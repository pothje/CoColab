import {
  AssetKind,
  AutomationConfig,
  BatchQueueItem,
  GpuProfileSpec,
  GuardrailCheckStep,
  GuardrailEvaluationResult,
  MediaRole,
  ProjectAssetFile,
} from '../types/automation';

export interface RawFileInput {
  name: string;
  relativePath: string;
  sizeBytes: number;
  mimeType: string;
  previewText?: string;
  objectUrl?: string;
  rawFile?: File;
}

const TARGET_SUBDIR_MAP: Record<AssetKind, string> = {
  schema: 'schema',
  prompts: 'prompts',
  settings: 'config',
  comfyui_workflow: 'ComfyUI/user/default/workflows',
  reference_media: 'ComfyUI/input',
  blender_graybox: 'ComfyUI/input/blender_graybox',
  other: 'ComfyUI/input/misc',
};

const STACK_FOLDER_MAP: Record<AssetKind, string> = {
  schema: '01_schema',
  prompts: '02_prompts',
  settings: '03_settings',
  comfyui_workflow: '03_settings',
  reference_media: '04_assets/references',
  blender_graybox: '04_assets/blender_graybox',
  other: '04_assets/misc',
};

export function inferAssetKind(relativePath: string, fileName: string, mimeType: string): AssetKind {
  const normalized = `${relativePath}/${fileName}`.toLowerCase();
  const lowerName = fileName.toLowerCase();

  if (/\.(blend|blend1)$/i.test(lowerName)) {
    return 'blender_graybox';
  }

  if (
    normalized.includes('comfy') ||
    normalized.includes('workflow') ||
    normalized.includes('node_graph')
  ) {
    return 'comfyui_workflow';
  }

  if (
    normalized.includes('graybox') ||
    normalized.includes('greybox') ||
    normalized.includes('blender') ||
    normalized.includes('clay') ||
    normalized.includes('depth_pass')
  ) {
    return 'blender_graybox';
  }

  if (
    normalized.includes('schema') ||
    normalized.includes('manifest') ||
    normalized.includes('pipeline')
  ) {
    return 'schema';
  }

  if (
    normalized.includes('prompt') ||
    lowerName.endsWith('.txt') ||
    lowerName.endsWith('.md')
  ) {
    return 'prompts';
  }

  if (
    normalized.includes('setting') ||
    normalized.includes('config') ||
    normalized.includes('brief') ||
    normalized.includes('finetune') ||
    normalized.includes('lora') ||
    normalized.includes('detail') ||
    normalized.includes('ayar') ||
    lowerName.endsWith('.yaml') ||
    lowerName.endsWith('.yml') ||
    lowerName.endsWith('.toml') ||
    lowerName.endsWith('.json') ||
    lowerName.endsWith('.safetensors')
  ) {
    return 'settings';
  }

  if (
    mimeType.startsWith('image/') ||
    mimeType.startsWith('video/') ||
    /\.(png|jpe?g|webp|exr|mp4|mov|webm|mkv)$/i.test(lowerName)
  ) {
    return 'reference_media';
  }

  return 'other';
}

export function inferMediaRole(
  relativePath: string,
  fileName: string,
  kind: AssetKind
): MediaRole {
  const normalized = `${relativePath}/${fileName}`.toLowerCase();
  const lowerName = fileName.toLowerCase();

  if (/\.(blend|blend1)$/i.test(lowerName)) {
    return 'blender_scene';
  }

  if (
    normalized.includes('first_frame') ||
    normalized.includes('ilk_kare') ||
    normalized.includes('start_frame') ||
    normalized.includes('keyframe_start') ||
    /(^|[_/-])frame_?0?1\./i.test(lowerName)
  ) {
    return 'first_frame';
  }

  if (
    normalized.includes('last_frame') ||
    normalized.includes('son_kare') ||
    normalized.includes('end_frame') ||
    normalized.includes('keyframe_end') ||
    normalized.includes('final_frame')
  ) {
    return 'last_frame';
  }

  if (kind === 'blender_graybox') {
    return 'blender_rendered';
  }

  if (kind === 'reference_media') {
    return 'style_ref';
  }

  return 'other';
}

export function buildTargetColabPath(
  workspaceRoot: string,
  kind: AssetKind,
  fileName: string
): string {
  const cleanRoot = workspaceRoot.replace(/\/+$/, '');
  if (kind === 'settings' && fileName.toLowerCase().endsWith('.safetensors')) {
    return `${cleanRoot}/ComfyUI/models/loras/${fileName}`;
  }
  const subdir = TARGET_SUBDIR_MAP[kind];
  return `${cleanRoot}/${subdir}/${fileName}`;
}

export function buildStackRelativePath(kind: AssetKind, fileName: string): string {
  if (kind === 'schema' && fileName === '01_routing_manifest.json') {
    return '01_routing_manifest.json';
  }
  return `${STACK_FOLDER_MAP[kind]}/${fileName}`;
}

export function classifyProjectFiles(
  files: RawFileInput[],
  workspaceRoot: string
): ProjectAssetFile[] {
  return files.map((file, idx) => {
    const kind = inferAssetKind(file.relativePath, file.name, file.mimeType);
    const mediaRole = inferMediaRole(file.relativePath, file.name, kind);
    return {
      id: `asset-${idx}-${file.name.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      name: file.name,
      relativePath: file.relativePath || file.name,
      sizeBytes: file.sizeBytes,
      mimeType: file.mimeType || 'application/octet-stream',
      kind,
      mediaRole,
      targetColabPath: buildTargetColabPath(workspaceRoot, kind, file.name),
      previewText: file.previewText,
      objectUrl: file.objectUrl,
      rawFile: file.rawFile,
      included: true,
    };
  });
}

export function validateAssetsCompleteness(assets: ProjectAssetFile[]): {
  hasSchema: boolean;
  hasPrompts: boolean;
  hasSettings: boolean;
  hasComfyWorkflow: boolean;
  hasGraybox: boolean;
  includedCount: number;
  missingCritical: string[];
} {
  const active = assets.filter((a) => a.included);
  const hasSchema = active.some((a) => a.kind === 'schema');
  const hasPrompts = active.some((a) => a.kind === 'prompts');
  const hasSettings = active.some((a) => a.kind === 'settings');
  const hasComfyWorkflow = active.some((a) => a.kind === 'comfyui_workflow');
  const hasGraybox = active.some((a) => a.kind === 'blender_graybox');

  const missingCritical: string[] = [];
  if (!hasSchema) missingCritical.push('Sistem Şeması (schema)');
  if (!hasPrompts) missingCritical.push('Prompt Dosyaları');
  if (!hasSettings) missingCritical.push('Ayar / İnce Ayar Dosyaları');

  return {
    hasSchema,
    hasPrompts,
    hasSettings,
    hasComfyWorkflow,
    hasGraybox,
    includedCount: active.length,
    missingCritical,
  };
}

export function evaluateRuntimeGuardrail(
  gpu: GpuProfileSpec,
  config: AutomationConfig,
  assets: ProjectAssetFile[],
  simulateHfAccessible: boolean = true
): GuardrailEvaluationResult {
  const checks: GuardrailCheckStep[] = [];
  const completeness = validateAssetsCompleteness(assets);

  let tier: '80GB' | '40GB' | '24GB' | 'REJECT' = 'REJECT';
  if (gpu.vramGb >= 75) {
    tier = '80GB';
    checks.push({
      id: 'gpu-check',
      label: 'GPU & VRAM Kovası Doğrulaması',
      status: 'pass',
      detail: `${gpu.nvidiaSmiName} (${gpu.vramGb} GB VRAM) -> ComfyUI High-VRAM 80GB profili eşleşti.`,
    });
  } else if (gpu.vramGb >= 38) {
    tier = '40GB';
    checks.push({
      id: 'gpu-check',
      label: 'GPU & VRAM Kovası Doğrulaması',
      status: 'warn',
      detail: `${gpu.nvidiaSmiName} (${gpu.vramGb} GB VRAM) -> ComfyUI 40GB NVFP4/INT8 + CPU Offload profili seçildi.`,
    });
  } else if (gpu.vramGb >= 22 && config.modelMatrix.allow24GbFallback) {
    tier = '24GB';
    checks.push({
      id: 'gpu-check',
      label: 'GPU & VRAM Kovası Doğrulaması',
      status: 'warn',
      detail: `${gpu.nvidiaSmiName} (${gpu.vramGb} GB VRAM) -> 24GB Acil Sequential Offload profili aktif.`,
    });
  } else {
    tier = 'REJECT';
    checks.push({
      id: 'gpu-check',
      label: 'GPU & VRAM Kovası Doğrulaması',
      status: 'fail',
      detail: `${gpu.nvidiaSmiName} (${gpu.vramGb} GB VRAM) yetersiz. Colab başka karta yönlendirdiği için runtime.unassign() tetiklenecek.`,
    });
  }

  const highRamOk = !config.requireHighRam || gpu.systemRamGb >= config.minHighRamGb;
  checks.push({
    id: 'high-ram-check',
    label: 'Colab High-RAM Bellek Doğrulaması',
    status: highRamOk ? 'pass' : 'fail',
    detail: highRamOk
      ? `${gpu.systemRamGb} GB Sistem RAM’i mevcut (High-RAM ≥ ${config.minHighRamGb} GB şartı karşılandı).`
      : `Yetersiz Sistem RAM’i (${gpu.systemRamGb} GB < ${config.minHighRamGb} GB). Standart RAM oturumunu kapatmak için runtime.unassign() tetiklenecek.`,
  });

  const requiredDisk = tier === '80GB' ? Math.max(config.minDiskFreeGb, 110) : config.minDiskFreeGb;
  const diskOk = gpu.diskFreeGb >= requiredDisk;
  checks.push({
    id: 'disk-check',
    label: 'Colab /content Disk Kotası (ComfyUI + Modeller)',
    status: diskOk ? 'pass' : 'fail',
    detail: diskOk
      ? `${gpu.diskFreeGb} GB boş alan mevcut (gereken ≥ ${requiredDisk} GB).`
      : `Yetersiz disk: ${gpu.diskFreeGb} GB boş, ComfyUI + ${tier} modeli için en az ${requiredDisk} GB gerekli.`,
  });

  const targetRepo =
    tier === '80GB'
      ? config.modelMatrix.repo80Gb
      : tier === '40GB'
        ? config.modelMatrix.repo40Gb
        : tier === '24GB'
          ? config.modelMatrix.repo24Gb
          : config.modelMatrix.repo40Gb;

  const repoValidFormat = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(targetRepo.trim());
  const hfOk = simulateHfAccessible && repoValidFormat;
  checks.push({
    id: 'hf-check',
    label: 'HuggingFace Repo & Token Erişimi',
    status: hfOk ? 'pass' : 'fail',
    detail: hfOk
      ? `${targetRepo} erişilebilir · ${config.enableHfTransfer ? 'hf_transfer (hızlı indirme) aktif' : 'standart indirme'}.`
      : `${targetRepo} doğrulanamadı (404 / yetkisiz HF_TOKEN / geçersiz repo formatı).`,
  });

  const assetsOk = completeness.missingCritical.length === 0;
  checks.push({
    id: 'asset-check',
    label: 'Proje Klasörü, ComfyUI Workflow & Graybox Bütünlüğü',
    status: assetsOk ? 'pass' : 'fail',
    detail: assetsOk
      ? `${completeness.includedCount} dosya doğrulandı (${completeness.hasComfyWorkflow ? 'ComfyUI API JSON + ' : ''}${completeness.hasGraybox ? 'Blender graybox dahil' : 'graybox olmadan'}).`
      : `Eksik zorunlu bileşenler: ${completeness.missingCritical.join(', ')}.`,
  });

  const hasFatal =
    tier === 'REJECT' ||
    !highRamOk ||
    !diskOk ||
    !hfOk ||
    (!assetsOk && config.strictKillOnMismatch);

  if (hasFatal) {
    return {
      verdict: 'ABORT_UNASSIGN',
      shouldTerminateSession: true,
      selectedModelRepo: null,
      selectedQuantization: null,
      estimatedVramUsageGb: 0,
      vramHeadroomGb: gpu.vramGb,
      checks,
      summary:
        'A100 High-RAM veya ön koşul doğrulanamadı: Compute Unit kaybetmemek için google.colab.runtime.unassign() ile oturum anında kapatılır.',
    };
  }

  if (tier === '80GB') {
    return {
      verdict: 'PASS_80GB',
      shouldTerminateSession: false,
      selectedModelRepo: config.modelMatrix.repo80Gb,
      selectedQuantization: config.modelMatrix.quant80Gb,
      estimatedVramUsageGb: 64.5,
      vramHeadroomGb: Number((gpu.vramGb - 64.5).toFixed(1)),
      checks,
      summary: `Oturum onaylandı: ${gpu.vramGb} GB VRAM + ${gpu.systemRamGb} GB High-RAM üzerinde ComfyUI (${config.modelMatrix.quant80Gb}) başlatılacak.`,
    };
  }

  if (tier === '40GB') {
    return {
      verdict: 'PASS_40GB_ADAPTIVE',
      shouldTerminateSession: false,
      selectedModelRepo: config.modelMatrix.repo40Gb,
      selectedQuantization: config.modelMatrix.quant40Gb,
      estimatedVramUsageGb: 34.2,
      vramHeadroomGb: Number((gpu.vramGb - 34.2).toFixed(1)),
      checks,
      summary: `Adaptif mod onaylandı: 40 GB VRAM + ${gpu.systemRamGb} GB High-RAM için ComfyUI (${config.modelMatrix.quant40Gb}) seçildi.`,
    };
  }

  return {
    verdict: 'PASS_24GB_FALLBACK',
    shouldTerminateSession: false,
    selectedModelRepo: config.modelMatrix.repo24Gb,
    selectedQuantization: config.modelMatrix.quant24Gb,
    estimatedVramUsageGb: 20.8,
    vramHeadroomGb: Number((gpu.vramGb - 20.8).toFixed(1)),
    checks,
    summary: `24 GB fallback onaylandı: ${config.modelMatrix.quant24Gb} ile ComfyUI bellek içi aktarım aktif.`,
  };
}

export function reorderBatchQueue(
  queue: BatchQueueItem[],
  index: number,
  direction: 'up' | 'down'
): BatchQueueItem[] {
  const targetIdx = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || index >= queue.length || targetIdx < 0 || targetIdx >= queue.length) {
    return queue;
  }
  const next = [...queue];
  const [moved] = next.splice(index, 1);
  next.splice(targetIdx, 0, moved);
  return next;
}

export function calculateBatchTimeSavings(
  queue: BatchQueueItem[],
  setupMinutesEstimate: number
): {
  totalJobs: number;
  pendingJobs: number;
  totalRenderMin: number;
  singleSessionTotalMin: number;
  separateSessionsTotalMin: number;
  savedSetupMin: number;
} {
  const totalJobs = queue.length;
  const pendingJobs = queue.filter((j) => j.status !== 'tamamlandi').length;
  const totalRenderMin = queue.reduce((sum, item) => sum + item.estimatedRenderMin, 0);
  if (totalJobs === 0) {
    return {
      totalJobs: 0,
      pendingJobs: 0,
      totalRenderMin: 0,
      singleSessionTotalMin: 0,
      separateSessionsTotalMin: 0,
      savedSetupMin: 0,
    };
  }
  const singleSessionTotalMin = setupMinutesEstimate + totalRenderMin;
  const separateSessionsTotalMin = totalJobs * setupMinutesEstimate + totalRenderMin;
  const savedSetupMin = Math.max(0, (totalJobs - 1) * setupMinutesEstimate);
  return {
    totalJobs,
    pendingJobs,
    totalRenderMin,
    singleSessionTotalMin,
    separateSessionsTotalMin,
    savedSetupMin,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
