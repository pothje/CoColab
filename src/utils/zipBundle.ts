import JSZip from 'jszip';
import {
  AuditFinding,
  AutomationConfig,
  BatchQueueItem,
  ColabProject,
  ProjectAssetFile,
} from '../types/automation';
import {
  generateBatchQueueJson,
  generateColabMcpServer,
  generateColabNotebookJson,
  generateManifestJson,
  generatePreflightPython,
  generateZeroCreditRunner,
} from './codeGenerators';
import {
  generateClaudeDesktopConfigSnippet,
  generateClaudeRulesMd,
  generateClaudeSkillMd,
  generateMcpInstallerScript,
  generateRoutingManifestJson,
} from './claudeGenerators';
import {
  buildBlenderRenderHelperPython,
  DEFAULT_BLENDER_RENDER_CONFIG,
} from './blenderModule';
import { getDeliveryPreset } from './claudeBundle';

export async function buildAutomationZipBundle(
  config: AutomationConfig,
  assets: ProjectAssetFile[],
  findings: AuditFinding[],
  project?: ColabProject,
  batchQueue: BatchQueueItem[] = [],
  projects: ColabProject[] = [],
  telemetryUrl: string = '',
  telemetryToken: string = ''
): Promise<Blob> {
  const zip = new JSZip();
  const mcpServerPy = generateColabMcpServer(config, assets);
  const presetSpec = getDeliveryPreset(project?.deliveryPreset);

  zip.file(
    'minimax_h3_colab_automation.ipynb',
    generateColabNotebookJson(
      config,
      assets,
      findings,
      batchQueue,
      projects,
      telemetryUrl,
      telemetryToken
    )
  );
  zip.file('preflight_guard.py', generatePreflightPython(config, findings));
  zip.file(
    'blender_render_helper.py',
    buildBlenderRenderHelperPython(
      config.blenderRender ?? DEFAULT_BLENDER_RENDER_CONFIG,
      presetSpec.width,
      presetSpec.height
    )
  );
  zip.file('colab_mcp_server.py', mcpServerPy);
  zip.file('local_zero_credit_runner.py', generateZeroCreditRunner(config, assets));
  zip.file('workspace_manifest.json', generateManifestJson(config, assets));
  zip.file(
    'batch_queue_manifest.json',
    generateBatchQueueJson(batchQueue, projects, config)
  );

  if (project) {
    zip.file('01_routing_manifest.json', generateRoutingManifestJson(project, config));
    zip.file('.claude/skills/minimax-h3-pipeline/SKILL.md', generateClaudeSkillMd(project, config));
    zip.file('CLAUDE.md', generateClaudeRulesMd(project, config));
    zip.file(
      'install_colabforge_mcp.sh',
      generateMcpInstallerScript('macos_linux', project, config, mcpServerPy)
    );
    zip.file(
      'install_colabforge_mcp.ps1',
      generateMcpInstallerScript('windows', project, config, mcpServerPy)
    );
    zip.file(
      'claude_desktop_config.json',
      generateClaudeDesktopConfigSnippet('windows')
    );
  }

  const readme = `ColabForge — Evrensel MiniMax H3 + Resmi googlecolab/colab-mcp Paketi
=====================================================================

1. Tek Komutla Resmi Colab MCP + Yerel MCP & Skill Kurulumu:
   - Windows (PowerShell): .\\install_colabforge_mcp.ps1
   - macOS / Linux: bash ./install_colabforge_mcp.sh
   Bu betik hem resmi googlecolab/colab-mcp (uvx) hem de yerel colabforge-local sunucusunu kurar.

2. A100 High-RAM & Otomatik GPU Koruma:
   - minimax_h3_colab_automation.ipynb dosyasi A100 + High-RAM (machine_shape: hm) ister.
   - Colab farkli GPU/Standart RAM verirse 1. hucre runtime.unassign() ile oturumu aninda kapatir.

3. Coklu Sahne Batch Queue & Yerel Cikti Indirme:
   - 15 dakikalik kurulum tek kez yapilir; batch_queue_manifest.json icindeki tum sahneler sirayla islenir.
   - Uretilen videolar MCP ile dogrudan 05_outputs/renders/ klasorune indirilir; Drive yedegi opsiyoneldir.
`;
  zip.file('README_KURULUM.txt', readme);

  const inputDir = zip.folder('input_project');
  if (inputDir) {
    for (const asset of assets.filter((a) => a.included)) {
      const targetPath = asset.relativePath.replace(/^\/+/, '');
      if (asset.rawFile) {
        inputDir.file(targetPath, asset.rawFile);
      } else {
        inputDir.file(
          targetPath,
          asset.previewText ?? `# Ornek yer tutucu: ${asset.name}\n`
        );
      }
    }
  }

  return zip.generateAsync({ type: 'blob' });
}
