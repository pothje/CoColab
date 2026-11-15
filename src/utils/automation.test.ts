import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {
  buildStackRelativePath,
  calculateBatchTimeSavings,
  classifyProjectFiles,
  evaluateRuntimeGuardrail,
  reorderBatchQueue,
  validateAssetsCompleteness,
} from './guardrailEngine';
import {
  generateBatchQueueJson,
  generateColabMcpServer,
  generateColabNotebookJson,
  generateManifestJson,
  generatePreflightPython,
} from './codeGenerators';
import { buildAutomationZipBundle } from './zipBundle';
import {
  buildMacCommandScript,
  createMacTrialZipBuffer,
  DEFAULT_MAC_TRIAL_ORIGIN,
  sanitizeMacAppOrigin,
} from './macPackage';
import {
  applyProjectDetailUpdate,
  computeProjectProgress,
  filterProjectsForDashboard,
} from './projectProgress';
import {
  getComfyVramMode,
  hasComfyFlag,
  normalizeComfyFlags,
  setComfyVramMode,
  toggleComfyFlag,
} from './comfyConfig';
import {
  applyModelToAutomationConfig,
  COMFY_MODEL_CATALOG,
  generateAcceleratedModelBashScript,
  generateAcceleratedModelPythonScript,
  generateColabModelInstallSnippet,
  resolveModelStoragePaths,
} from './modelInstaller';
import {
  computeSystemLoadMetrics,
  evaluateBatchSchedule,
  getCalendarWeekDays,
  triggerQueuedBatchStart,
} from './batchScheduler';
import {
  buildClaudeRevisionBrief,
  generateClaudeDesktopConfigSnippet,
  generateClaudeRulesMd,
  generateClaudeSkillMd,
  generateMcpInstallerScript,
  generateRoutingManifestJson,
} from './claudeGenerators';
import {
  createInitialBatchQueue,
  createInitialProjects,
  DEFAULT_AUTOMATION_CONFIG,
  GPU_SIMULATION_PRESETS,
  INITIAL_AUDIT_FINDINGS,
  SAMPLE_PROJECT_FILES_SEED,
} from '../data/auditFindings';

test('classifyProjectFiles separates ComfyUI workflows, Blender graybox, schema, prompts, settings, and references', () => {
  const assets = classifyProjectFiles(
    SAMPLE_PROJECT_FILES_SEED,
    DEFAULT_AUTOMATION_CONFIG.workspaceRoot
  );

  assert.equal(assets.length, SAMPLE_PROJECT_FILES_SEED.length);
  const byName = new Map(assets.map((a) => [a.name, a]));

  assert.equal(byName.get('system_schema.json')?.kind, 'schema');
  assert.equal(byName.get('comfyui_workflow_api.json')?.kind, 'comfyui_workflow');
  assert.ok(
    byName
      .get('comfyui_workflow_api.json')
      ?.targetColabPath.endsWith('/ComfyUI/user/default/workflows/comfyui_workflow_api.json')
  );
  assert.equal(byName.get('master_prompt.txt')?.kind, 'prompts');
  assert.equal(byName.get('runtime_settings.json')?.kind, 'settings');
  assert.equal(byName.get('finetune_lora.yaml')?.kind, 'settings');
  assert.equal(byName.get('style_ref_lobby.png')?.kind, 'reference_media');
  assert.equal(byName.get('motion_ref_pan.mp4')?.kind, 'reference_media');
  assert.equal(byName.get('cam01_graybox_clay.png')?.kind, 'blender_graybox');
  assert.equal(byName.get('cam01_graybox_anim.mp4')?.kind, 'blender_graybox');
  assert.ok(
    byName
      .get('cam01_graybox_anim.mp4')
      ?.targetColabPath.endsWith('/ComfyUI/input/blender_graybox/cam01_graybox_anim.mp4')
  );
  assert.equal(
    buildStackRelativePath('blender_graybox', 'shot_clay.mp4'),
    '04_assets/blender_graybox/shot_clay.mp4'
  );
});

test('evaluateRuntimeGuardrail selects 80GB High-VRAM on A100 80GB and 40GB NVFP4 on A100 40GB', () => {
  const assets = classifyProjectFiles(
    SAMPLE_PROJECT_FILES_SEED,
    DEFAULT_AUTOMATION_CONFIG.workspaceRoot
  );
  const gpu80 = GPU_SIMULATION_PRESETS.find((g) => g.id === 'a100-80')!;
  const gpu40 = GPU_SIMULATION_PRESETS.find((g) => g.id === 'a100-40')!;

  const res80 = evaluateRuntimeGuardrail(gpu80, DEFAULT_AUTOMATION_CONFIG, assets, true);
  assert.equal(res80.verdict, 'PASS_80GB');
  assert.equal(res80.shouldTerminateSession, false);
  assert.equal(res80.selectedModelRepo, 'Comfy-Org/MiniMax-H3');
  assert.ok(res80.checks.some((c) => c.id === 'high-ram-check' && c.status === 'pass'));

  const res40 = evaluateRuntimeGuardrail(gpu40, DEFAULT_AUTOMATION_CONFIG, assets, true);
  assert.equal(res40.verdict, 'PASS_40GB_ADAPTIVE');
  assert.equal(res40.shouldTerminateSession, false);
  assert.equal(res40.selectedModelRepo, 'Comfy-Org/MiniMax-H3');
});

test('evaluateRuntimeGuardrail triggers runtime.unassign abort on incompatible GPU, low High-RAM, or inaccessible HF repo', () => {
  const assets = classifyProjectFiles(
    SAMPLE_PROJECT_FILES_SEED,
    DEFAULT_AUTOMATION_CONFIG.workspaceRoot
  );
  const gpuT4 = GPU_SIMULATION_PRESETS.find((g) => g.id === 't4-16')!;
  const gpu80LowRam = {
    ...GPU_SIMULATION_PRESETS.find((g) => g.id === 'a100-80')!,
    systemRamGb: 16,
  };

  const resT4 = evaluateRuntimeGuardrail(gpuT4, DEFAULT_AUTOMATION_CONFIG, assets, true);
  assert.equal(resT4.verdict, 'ABORT_UNASSIGN');
  assert.equal(resT4.shouldTerminateSession, true);

  const resLowRam = evaluateRuntimeGuardrail(
    gpu80LowRam,
    DEFAULT_AUTOMATION_CONFIG,
    assets,
    true
  );
  assert.equal(resLowRam.verdict, 'ABORT_UNASSIGN');
  assert.equal(resLowRam.shouldTerminateSession, true);
  assert.ok(resLowRam.checks.some((c) => c.id === 'high-ram-check' && c.status === 'fail'));
});

test('validateAssetsCompleteness detects ComfyUI workflow and missing critical assets when schema is excluded', () => {
  const baseAssets = classifyProjectFiles(
    SAMPLE_PROJECT_FILES_SEED,
    DEFAULT_AUTOMATION_CONFIG.workspaceRoot
  );
  assert.equal(validateAssetsCompleteness(baseAssets).hasComfyWorkflow, true);

  const assets = baseAssets.map((a) => (a.kind === 'schema' ? { ...a, included: false } : a));
  const status = validateAssetsCompleteness(assets);
  assert.equal(status.hasSchema, false);
  assert.ok(status.missingCritical.includes('Sistem Şeması (schema)'));
});

test('generated .ipynb notebook configures 6 ComfyUI + MiniMax H3 cells, A100 High-RAM, Batch Queue loop, and Drive toggle', () => {
  const projects = createInitialProjects(DEFAULT_AUTOMATION_CONFIG.workspaceRoot);
  const queue = createInitialBatchQueue(projects);
  const assets = projects[0].assets;

  const nbRaw = generateColabNotebookJson(
    { ...DEFAULT_AUTOMATION_CONFIG, autoSyncOutputsToDrive: false },
    assets,
    INITIAL_AUDIT_FINDINGS,
    queue,
    projects,
    'https://example.test',
    'tok-123'
  );
  const nb = JSON.parse(nbRaw);
  assert.equal(nb.nbformat, 4);
  assert.equal(nb.nbformat_minor, 5);
  assert.equal(nb.metadata.colab.gpuType, 'A100');
  assert.equal(nb.metadata.colab.machine_shape, 'hm');
  assert.equal(nb.cells.length, 6);

  const cell1Source = nb.cells[0].source.join('');
  assert.ok(cell1Source.includes('tok-123'));
  assert.ok(cell1Source.includes('sleep 7200 && kill 1'));
  assert.ok(cell1Source.includes('websocket-client'));
  assert.ok(cell1Source.includes('%env HF_HUB_ENABLE_HF_TRANSFER=1'));
  assert.ok(cell1Source.includes('os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"'));
  assert.ok(cell1Source.includes('"huggingface_hub[hf_transfer]"'));

  const cell2Source = nb.cells[1].source.join('');
  assert.ok(cell2Source.includes('ComfyUI.git'));
  assert.ok(cell2Source.includes('ComfyUI-VideoHelperSuite'));
  assert.ok(cell2Source.includes('ComfyUI-KJNodes'));
  assert.ok(cell2Source.includes('constraints.txt'));
  assert.ok(cell2Source.includes('sageattention'));

  const cell3Source = nb.cells[2].source.join('');
  assert.ok(cell3Source.includes('minimax_h3_fl2va_pruned_int8_convrot.safetensors'));
  assert.ok(cell3Source.includes('ENABLE_HF_TRANSFER = True'));
  assert.ok(cell3Source.includes('hf_constants.HF_HUB_ENABLE_HF_TRANSFER = HF_TRANSFER_ACTIVE'));
  assert.ok(
    cell3Source.indexOf('os.environ["HF_HUB_ENABLE_HF_TRANSFER"]') <
      cell3Source.indexOf('from huggingface_hub import hf_hub_download, snapshot_download')
  );
  assert.ok(cell3Source.includes('download_model_weight'));

  const nbDisabled = JSON.parse(
    generateColabNotebookJson(
      { ...DEFAULT_AUTOMATION_CONFIG, enableHfTransfer: false },
      assets,
      INITIAL_AUDIT_FINDINGS,
      queue,
      projects
    )
  );
  assert.ok(nbDisabled.cells[0].source.join('').includes('os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "0"'));
  assert.ok(nbDisabled.cells[2].source.join('').includes('ENABLE_HF_TRANSFER = False'));

  const cell5Source = nb.cells[4].source.join('');
  assert.ok(cell5Source.includes('/prompt'));
  assert.ok(cell5Source.includes('BATCH_QUEUE'));
  assert.ok(cell5Source.includes('VAEDecodeTiled'));
  assert.ok(cell5Source.includes('wait_for_prompt_ws'));
  assert.ok(cell5Source.includes('/free'));

  const cell6Source = nb.cells[5].source.join('');
  assert.ok(cell6Source.includes('AUTO_SYNC_TO_DRIVE = False'));

  const manifest = JSON.parse(generateManifestJson(DEFAULT_AUTOMATION_CONFIG, assets));
  assert.equal(manifest.engine, 'ComfyUI');
  assert.equal(manifest.counts.comfyui_workflow, 1);
  assert.equal(manifest.counts.blender_graybox, 2);
  assert.equal(manifest.local_output_primary, true);
  assert.equal(manifest.enable_hf_transfer, true);

  const guardPy = generatePreflightPython(DEFAULT_AUTOMATION_CONFIG, INITIAL_AUDIT_FINDINGS);
  assert.ok(guardPy.includes('runtime.unassign()'));
  assert.ok(guardPy.includes('verify_high_ram'));
  assert.ok(guardPy.includes('HF_HUB_ENABLE_HF_TRANSFER'));

  const mcpPy = generateColabMcpServer(DEFAULT_AUTOMATION_CONFIG, assets);
  assert.ok(mcpPy.includes('pull_colab_outputs_to_local'));
  assert.ok(mcpPy.includes('comfyui_workflow'));
  assert.ok(mcpPy.includes('get_batch_queue_manifest'));
  assert.ok(mcpPy.includes('push_telemetry_event'));
  assert.ok(mcpPy.includes('comfy_get_system_stats'));
  assert.ok(mcpPy.includes('comfy_submit_workflow'));
  assert.ok(mcpPy.includes('comfy_free_vram'));
  assert.ok(mcpPy.includes('comfy_interrupt_render'));
});

test('Batch Queue ordering and 15-minute setup time-savings calculations work deterministically', () => {
  const projects = createInitialProjects(DEFAULT_AUTOMATION_CONFIG.workspaceRoot);
  const queue = createInitialBatchQueue(projects);

  const savings = calculateBatchTimeSavings(queue, 15);
  assert.equal(savings.totalJobs, 3);
  assert.equal(savings.singleSessionTotalMin, 24);
  assert.equal(savings.separateSessionsTotalMin, 54);
  assert.equal(savings.savedSetupMin, 30);

  const reordered = reorderBatchQueue(queue, 1, 'up');
  assert.equal(reordered[0].id, queue[1].id);
  assert.equal(reordered[1].id, queue[0].id);

  const batchJson = JSON.parse(
    generateBatchQueueJson(queue, projects, DEFAULT_AUTOMATION_CONFIG)
  );
  assert.equal(batchJson.total_jobs, 3);
  assert.equal(batchJson.jobs[0].order, 1);
});

test('buildAutomationZipBundle creates a complete ZIP archive with batch_queue_manifest.json and Claude MCP files', async () => {
  const projects = createInitialProjects(DEFAULT_AUTOMATION_CONFIG.workspaceRoot);
  const queue = createInitialBatchQueue(projects);
  const project = projects[0];
  const blob = await buildAutomationZipBundle(
    DEFAULT_AUTOMATION_CONFIG,
    project.assets,
    INITIAL_AUDIT_FINDINGS,
    project,
    queue,
    projects
  );
  const buffer = await blob.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  assert.ok(zip.file('minimax_h3_colab_automation.ipynb'));
  assert.ok(zip.file('preflight_guard.py'));
  assert.ok(zip.file('colab_mcp_server.py'));
  assert.ok(zip.file('batch_queue_manifest.json'));
  assert.ok(zip.file('workspace_manifest.json'));
  assert.ok(zip.file('01_routing_manifest.json'));
  assert.ok(zip.file('.claude/skills/minimax-h3-pipeline/SKILL.md'));
  assert.ok(zip.file('CLAUDE.md'));
  assert.ok(zip.file('install_colabforge_mcp.sh'));
  assert.ok(zip.file('install_colabforge_mcp.ps1'));
  assert.ok(zip.file('input_project/04_assets/blender_graybox/cam01_graybox_anim.mp4'));
});

test('universal Claude Skill, official googlecolab/colab-mcp config, installers, and revision brief avoid hardcoded user paths', () => {
  const project = createInitialProjects(DEFAULT_AUTOMATION_CONFIG.workspaceRoot)[0];
  const skill = generateClaudeSkillMd(project, DEFAULT_AUTOMATION_CONFIG);
  const rules = generateClaudeRulesMd(project, DEFAULT_AUTOMATION_CONFIG);
  const routing = JSON.parse(
    generateRoutingManifestJson(project, DEFAULT_AUTOMATION_CONFIG)
  );
  const mcpPy = generateColabMcpServer(DEFAULT_AUTOMATION_CONFIG, project.assets);
  const shScript = generateMcpInstallerScript('macos_linux', project, DEFAULT_AUTOMATION_CONFIG, mcpPy);
  const psScript = generateMcpInstallerScript('windows', project, DEFAULT_AUTOMATION_CONFIG, mcpPy);
  const desktopCfg = JSON.parse(generateClaudeDesktopConfigSnippet('windows'));

  assert.ok(skill.includes('googlecolab/colab-mcp'));
  assert.ok(skill.includes('list_runtimes'));
  assert.ok(rules.includes('googlecolab/colab-mcp'));
  assert.equal(routing.local_output_primary, true);
  assert.equal(desktopCfg.mcpServers['google-colab'].command, 'uvx');
  assert.deepEqual(desktopCfg.mcpServers['google-colab'].args, [
    'git+https://github.com/googlecolab/colab-mcp',
  ]);
  assert.ok(desktopCfg.mcpServers['colabforge-local']);
  assert.ok(shScript.includes('$HOME/.colabforge-mcp'));
  assert.ok(psScript.includes('$env:USERPROFILE'));
  assert.ok(!shScript.includes('sonermuhammed'));
  assert.ok(!psScript.includes('sonermuhammed'));

  const brief = buildClaudeRevisionBrief(
    project,
    project.outputs[0],
    'Duvar dokusu 2. saniyede titriyor, graybox ağırlığını artır.'
  );
  assert.ok(brief.includes('Duvar dokusu 2. saniyede titriyor'));
  assert.ok(brief.includes('pull_colab_outputs_to_local'));
});

test('MacBook trial ZIP builder sanitizes untrusted origins and sets executable command script', async () => {
  assert.equal(
    sanitizeMacAppOrigin('https://example.run.app/path?foo=1#bar'),
    'https://example.run.app'
  );
  assert.equal(
    sanitizeMacAppOrigin('https://evil.com"; rm -rf /'),
    DEFAULT_MAC_TRIAL_ORIGIN
  );
  assert.equal(
    sanitizeMacAppOrigin('javascript:alert(1)'),
    DEFAULT_MAC_TRIAL_ORIGIN
  );

  const script = buildMacCommandScript('https://ais-pre-demo.europe-west1.run.app');
  assert.ok(script.includes('APP_URL="https://ais-pre-demo.europe-west1.run.app"'));
  assert.ok(script.includes('/usr/bin/osacompile'));
  assert.ok(script.includes('ColabForge.app'));

  const { buffer, origin } = await createMacTrialZipBuffer(
    'https://ais-pre-demo.europe-west1.run.app'
  );
  assert.equal(origin, 'https://ais-pre-demo.europe-west1.run.app');

  const zip = await JSZip.loadAsync(buffer);
  const cmdEntry = zip.file('ColabForge Baslat.command');
  const readmeEntry = zip.file('BeniOku_Mac.txt');
  assert.ok(cmdEntry);
  assert.ok(readmeEntry);
  assert.equal(Number(cmdEntry.unixPermissions) & 0o111, 0o111);

  const cmdText = await cmdEntry.async('string');
  assert.ok(cmdText.includes('https://ais-pre-demo.europe-west1.run.app'));
});

test('computeProjectProgress and filterProjectsForDashboard accurately resolve kuyrukta, isleniyor, and tamamlandi states', () => {
  const projects = createInitialProjects(DEFAULT_AUTOMATION_CONFIG.workspaceRoot);
  const queue = createInitialBatchQueue(projects);

  const p0 = computeProjectProgress(projects[0], queue);
  const p1 = computeProjectProgress(projects[1], queue);
  const p2 = computeProjectProgress(projects[2], queue);

  assert.equal(p0.status, 'tamamlandi');
  assert.equal(p0.stageKey, 'tamamlandi');
  assert.equal(p0.progressPct, 100);

  assert.equal(p1.status, 'isleniyor');
  assert.equal(p1.stageKey, 'isleniyor');
  assert.ok(p1.progressPct > 0 && p1.progressPct < 100);

  assert.equal(p2.status, 'kuyrukta');
  assert.equal(p2.stageKey, 'kuyrukta');
  assert.equal(p2.progressPct, 0);

  const preparingQueue = queue.map((job, idx) =>
    idx === 2 ? { ...job, status: 'hazirlaniyor' as const } : job
  );
  const p2Preparing = computeProjectProgress(projects[2], preparingQueue);
  assert.equal(p2Preparing.status, 'isleniyor');
  assert.equal(p2Preparing.stageKey, 'hazirlaniyor');
  assert.equal(p2Preparing.progressPct, 35);

  const liveTelemetryOverride = computeProjectProgress(projects[2], queue, {
    sessionId: 'sess-1',
    stage: 'rendering',
    gpuName: 'NVIDIA A100-SXM4-80GB',
    vramUsedGb: 62,
    vramTotalGb: 80,
    systemRamUsedGb: 44,
    systemRamTotalGb: 167,
    gpuTempC: 67,
    diskFreeGb: 190,
    downloadProgressPct: 100,
    activeProjectId: projects[2].id,
    activeBatchJobId: queue[2].id,
    batchIndex: 1,
    batchTotal: 1,
    currentStepLabel: 'MiniMax H3 kare üretimi',
    lastUpdatedAt: '2026-11-15T10:00:00Z',
    logs: [],
  });
  assert.equal(liveTelemetryOverride.status, 'isleniyor');
  assert.equal(liveTelemetryOverride.progressPct, 76);

  const progressMap = {
    [projects[0].id]: p0,
    [projects[1].id]: p1,
    [projects[2].id]: p2,
  };
  assert.equal(filterProjectsForDashboard(projects, progressMap, '', 'tumu').length, 3);
  assert.equal(filterProjectsForDashboard(projects, progressMap, '', 'isleniyor').length, 1);
  assert.equal(filterProjectsForDashboard(projects, progressMap, 'vitrin', 'kuyrukta').length, 1);
  assert.equal(filterProjectsForDashboard(projects, progressMap, 'vitrin', 'tamamlandi').length, 0);
});

test('applyProjectDetailUpdate updates project metadata and master_prompt.txt bytes cleanly', () => {
  const projects = createInitialProjects(DEFAULT_AUTOMATION_CONFIG.workspaceRoot);
  const target = projects[1];
  const nextPrompt = 'Kamera yavaşça 360 derece döner, stüdyo yumuşak ışık vurgulu.';

  const updatedList = applyProjectDetailUpdate(projects, target.id, {
    name: '  Ürün 360 Turntable Final  ',
    description: 'Yeni stüdyo aydınlatma ve pürüzsüz dönüş',
    targetGpuPolicy: '80GB_ONLY',
    masterPromptText: nextPrompt,
    updatedAt: '2026-11-16',
  });

  const updated = updatedList.find((p) => p.id === target.id)!;
  assert.equal(updated.name, 'Ürün 360 Turntable Final');
  assert.equal(updated.description, 'Yeni stüdyo aydınlatma ve pürüzsüz dönüş');
  assert.equal(updated.targetGpuPolicy, '80GB_ONLY');
  assert.equal(updated.updatedAt, '2026-11-16');

  const promptAsset = updated.assets.find((a) => a.name === 'master_prompt.txt')!;
  assert.equal(promptAsset.previewText, nextPrompt);
  assert.equal(promptAsset.sizeBytes, new TextEncoder().encode(nextPrompt).length);

  // Unrelated projects remain unchanged
  assert.equal(updatedList[0].name, projects[0].name);
});

test('comfyConfig helpers manage --highvram, startup flags, and sync TeaCache / 8-Step Turbo LoRA into generated notebook', () => {
  const base = '--listen 127.0.0.1 --port 8188 --highvram --preview-method none';
  assert.equal(hasComfyFlag(base, '--highvram'), true);
  assert.equal(getComfyVramMode(base), 'highvram');

  const withoutHigh = toggleComfyFlag(base, '--highvram', false);
  assert.equal(hasComfyFlag(withoutHigh, '--highvram'), false);
  assert.equal(getComfyVramMode(withoutHigh), 'auto');

  const normalMode = setComfyVramMode(base, 'normalvram');
  assert.equal(hasComfyFlag(normalMode, '--highvram'), false);
  assert.equal(hasComfyFlag(normalMode, '--normalvram'), true);
  assert.equal(getComfyVramMode(normalMode), 'normalvram');

  const withFast = toggleComfyFlag(normalMode, '--fast', true);
  assert.equal(hasComfyFlag(withFast, '--fast'), true);
  assert.equal(normalizeComfyFlags(`${withFast} --fast`), withFast);

  const projects = createInitialProjects(DEFAULT_AUTOMATION_CONFIG.workspaceRoot);
  const queue = createInitialBatchQueue(projects);
  const customConfig = {
    ...DEFAULT_AUTOMATION_CONFIG,
    comfyui: {
      ...DEFAULT_AUTOMATION_CONFIG.comfyui,
      enableTeaCache: true,
      enableTurboLora: true,
      turboSteps: 8,
      headlessFlags: withFast,
    },
  };
  const nb = JSON.parse(
    generateColabNotebookJson(customConfig, projects[0].assets, INITIAL_AUDIT_FINDINGS, queue, projects)
  );
  const cell4Source = nb.cells[3].source.join('');
  const cell5Source = nb.cells[4].source.join('');

  assert.ok(cell4Source.includes('--normalvram'));
  assert.ok(cell4Source.includes('--fast'));
  assert.ok(cell5Source.includes('ENABLE_TEACACHE = True'));
  assert.ok(cell5Source.includes('ENABLE_TURBO_LORA = True'));
  assert.ok(cell5Source.includes('TURBO_STEPS = 8'));
  assert.ok(cell5Source.includes('original_unet_id'));
});

test('ComfyUI Model Installer configures MiniMax-H3, Wan 2.2, and LTX 2.3 with uv, hf_transfer, and Drive vs NVMe scripts', () => {
  const modelIds = COMFY_MODEL_CATALOG.map((m) => m.id);
  assert.deepEqual(modelIds, ['minimax-h3', 'wan-2.2', 'ltx-2.3']);

  const drivePaths = resolveModelStoragePaths(DEFAULT_AUTOMATION_CONFIG, 'wan-2.2', 'drive');
  assert.equal(
    drivePaths.activeDownloadDir,
    '/content/drive/MyDrive/ColabForge_Projects/ComfyUI_Models/wan-2.2'
  );
  assert.equal(drivePaths.nvmeModelsDir, '/content/minimax_h3_workspace/ComfyUI/models');

  const nvmePaths = resolveModelStoragePaths(DEFAULT_AUTOMATION_CONFIG, 'ltx-2.3', 'nvme');
  assert.equal(nvmePaths.activeDownloadDir, '/content/minimax_h3_workspace/ComfyUI/models');

  const pyDrive = generateAcceleratedModelPythonScript(
    'wan-2.2',
    'balanced_40gb',
    'drive',
    DEFAULT_AUTOMATION_CONFIG
  );
  assert.ok(pyDrive.includes('["uv", "pip", "install", "--system"]'));
  assert.ok(pyDrive.includes('os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"'));
  assert.ok(pyDrive.includes('Comfy-Org/Wan_2.2_ComfyUI_Repackaged'));
  assert.ok(pyDrive.includes('drive.mount("/content/drive")'));
  assert.ok(pyDrive.includes('symlink_dst.symlink_to'));

  const shNvme = generateAcceleratedModelBashScript(
    'ltx-2.3',
    'balanced_40gb',
    'nvme',
    DEFAULT_AUTOMATION_CONFIG
  );
  assert.ok(shNvme.includes('export HF_HUB_ENABLE_HF_TRANSFER=1'));
  assert.ok(shNvme.includes('uv pip install --system'));
  assert.ok(shNvme.includes('Lightricks/LTX-2.3'));
  assert.ok(shNvme.includes('ComfyUI-LTXVideo'));
  assert.ok(!shNvme.includes('ln -sfn'));

  const shDrive = generateAcceleratedModelBashScript(
    'ltx-2.3',
    'balanced_40gb',
    'drive',
    DEFAULT_AUTOMATION_CONFIG
  );
  assert.ok(shDrive.includes('ln -sfn'));

  const colabCell = generateColabModelInstallSnippet(
    'minimax-h3',
    'quality_80gb',
    'nvme',
    DEFAULT_AUTOMATION_CONFIG
  );
  assert.ok(colabCell.includes('%env HF_HUB_ENABLE_HF_TRANSFER=1'));
  assert.ok(colabCell.includes('uv pip install --system'));

  const ltxDriveConfig = applyModelToAutomationConfig(
    DEFAULT_AUTOMATION_CONFIG,
    'ltx-2.3',
    'balanced_40gb',
    'drive'
  );
  assert.equal(ltxDriveConfig.modelMatrix.repo40Gb, 'Lightricks/LTX-2.3');
  assert.equal(ltxDriveConfig.modelInstaller.installTarget, 'drive');

  const projects = createInitialProjects(DEFAULT_AUTOMATION_CONFIG.workspaceRoot);
  const queue = createInitialBatchQueue(projects);
  const nb = JSON.parse(
    generateColabNotebookJson(ltxDriveConfig, projects[0].assets, INITIAL_AUDIT_FINDINGS, queue, projects)
  );
  const cell1 = nb.cells[0].source.join('');
  const cell2 = nb.cells[1].source.join('');
  const cell3 = nb.cells[2].source.join('');

  assert.ok(cell1.includes('uv pip install --system'));
  assert.ok(cell2.includes('ComfyUI-LTXVideo'));
  assert.ok(cell3.includes('MODEL_INSTALL_TARGET = "drive"'));
  assert.ok(cell3.includes('ComfyUI_Models/ltx-2.3'));
  assert.ok(cell3.includes('symlink_dst.symlink_to'));

  const mcpPy = generateColabMcpServer(ltxDriveConfig, projects[0].assets);
  assert.ok(mcpPy.includes('comfy_install_model'));
});

test('BatchQueue scheduler evaluates calendar time, low system load, combined mode, and syncs to manifest & notebook', () => {
  const projects = createInitialProjects(DEFAULT_AUTOMATION_CONFIG.workspaceRoot);
  const queue = createInitialBatchQueue(projects);
  const now = new Date(2026, 10, 15, 10, 30, 0); // 2026-11-15 10:30 local

  // 1. Calendar week days generation
  const days = getCalendarWeekDays(
    {
      ...DEFAULT_AUTOMATION_CONFIG.batchSchedule,
      enabled: true,
      mode: 'time',
      scheduledDate: '2026-11-15',
      scheduledTime: '22:00',
      recurrence: 'weekdays',
    },
    now
  );
  assert.equal(days.length, 7);
  assert.equal(days[0].isoDate, '2026-11-15');
  assert.equal(days[0].isToday, true);
  assert.equal(days[0].hasScheduledRun, false); // 2026-11-15 is Sunday; weekdays skips Sunday
  assert.equal(days[1].hasScheduledRun, true); // Monday 2026-11-16

  // 2. Time mode waits before target and triggers at target window
  const futureTimeEval = evaluateBatchSchedule(
    {
      ...DEFAULT_AUTOMATION_CONFIG.batchSchedule,
      enabled: true,
      mode: 'time',
      scheduledDate: '2026-11-15',
      scheduledTime: '11:00',
      recurrence: 'once',
    },
    queue,
    now
  );
  assert.equal(futureTimeEval.shouldTrigger, false);
  assert.equal(futureTimeEval.countdownLabel, '00:30:00');

  const dueTimeEval = evaluateBatchSchedule(
    {
      ...DEFAULT_AUTOMATION_CONFIG.batchSchedule,
      enabled: true,
      mode: 'time',
      scheduledDate: '2026-11-15',
      scheduledTime: '10:29',
      recurrence: 'once',
    },
    queue,
    now
  );
  assert.equal(dueTimeEval.timeDue, true);
  assert.equal(dueTimeEval.shouldTrigger, true);

  // 3. Low-load mode triggers only when VRAM & RAM drop below thresholds
  const highLoadEval = evaluateBatchSchedule(
    {
      ...DEFAULT_AUTOMATION_CONFIG.batchSchedule,
      enabled: true,
      mode: 'low_load',
      maxVramLoadPct: 35,
      maxRamLoadPct: 60,
      loadSource: 'simulated',
      simulatedLoadPct: 75,
    },
    queue,
    now
  );
  assert.equal(highLoadEval.loadDue, false);
  assert.equal(highLoadEval.shouldTrigger, false);

  const lowLoadEval = evaluateBatchSchedule(
    {
      ...DEFAULT_AUTOMATION_CONFIG.batchSchedule,
      enabled: true,
      mode: 'low_load',
      maxVramLoadPct: 35,
      maxRamLoadPct: 60,
      loadSource: 'simulated',
      simulatedLoadPct: 25,
    },
    queue,
    now
  );
  assert.equal(lowLoadEval.loadDue, true);
  assert.equal(lowLoadEval.shouldTrigger, true);

  // 4. Live telemetry load calculation
  const telemetryLoad = computeSystemLoadMetrics(
    {
      ...DEFAULT_AUTOMATION_CONFIG.batchSchedule,
      loadSource: 'telemetry',
      maxVramLoadPct: 30,
      maxRamLoadPct: 50,
    },
    {
      sessionId: 's1',
      stage: 'idle',
      gpuName: 'A100',
      vramUsedGb: 16,
      vramTotalGb: 80,
      systemRamUsedGb: 40,
      systemRamTotalGb: 160,
      gpuTempC: 42,
      diskFreeGb: 200,
      downloadProgressPct: null,
      activeProjectId: null,
      activeBatchJobId: null,
      batchIndex: 0,
      batchTotal: 0,
      currentStepLabel: 'Idle',
      lastUpdatedAt: null,
      logs: [],
    }
  );
  assert.equal(telemetryLoad.vramLoadPct, 20);
  assert.equal(telemetryLoad.ramLoadPct, 25);
  assert.equal(telemetryLoad.loadSatisfied, true);

  // 5. Queue transition moves first 'kuyrukta' job to 'hazirlaniyor'
  const { nextQueue, startedJob } = triggerQueuedBatchStart(queue);
  assert.ok(startedJob);
  assert.equal(startedJob.id, queue[2].id);
  assert.equal(nextQueue[2].status, 'hazirlaniyor');

  // 6. Manifest & Colab Notebook sync
  const scheduledConfig = {
    ...DEFAULT_AUTOMATION_CONFIG,
    batchSchedule: {
      ...DEFAULT_AUTOMATION_CONFIG.batchSchedule,
      enabled: true,
      mode: 'time_and_low_load' as const,
      scheduledDate: '2026-11-15',
      scheduledTime: '23:30',
      maxVramLoadPct: 30,
      maxRamLoadPct: 55,
    },
  };
  const batchManifest = JSON.parse(
    generateBatchQueueJson(queue, projects, scheduledConfig)
  );
  assert.equal(batchManifest.schedule.enabled, true);
  assert.equal(batchManifest.schedule.mode, 'time_and_low_load');
  assert.equal(batchManifest.schedule.scheduled_time, '23:30');

  const nb = JSON.parse(
    generateColabNotebookJson(
      scheduledConfig,
      projects[0].assets,
      INITIAL_AUDIT_FINDINGS,
      queue,
      projects
    )
  );
  const cell5 = nb.cells[4].source.join('');
  assert.ok(cell5.includes('wait_for_scheduled_trigger'));
  assert.ok(cell5.includes('SCHEDULE_CONFIG'));
});




