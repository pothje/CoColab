import {
  AutomationConfig,
  ColabProject,
  TelemetrySnapshot,
} from '../types/automation';

export type AllocatedGpuTier = '80GB' | '40GB' | '24GB' | '16GB' | 'unknown';
export type GpuHealthStatus = 'pending' | 'healthy' | 'mismatch' | 'critical';
export type HealthCheckTrigger = 'auto_connect' | 'project_switch' | 'manual';

export interface GpuHealthCheckResult {
  status: GpuHealthStatus;
  shouldAlert: boolean;
  isConnected: boolean;
  allocatedVramGb: number | null;
  allocatedTier: AllocatedGpuTier;
  allocatedLabel: string;
  requiredPolicy: ColabProject['targetGpuPolicy'];
  requiredLabel: string;
  highRamOk: boolean;
  systemRamTotalGb: number | null;
  headline: string;
  detail: string;
  recommendedAction: string | null;
  canRelaxPolicyTo40Gb: boolean;
}

export interface GpuHealthHistoryEntry {
  id: string;
  checkedAt: string;
  trigger: HealthCheckTrigger;
  projectName: string;
  gpuName: string;
  allocatedVramGb: number | null;
  requiredPolicy: ColabProject['targetGpuPolicy'];
  status: GpuHealthStatus;
  headline: string;
}

export function classifyAllocatedVramTier(
  vramTotalGb: number | null
): AllocatedGpuTier {
  if (vramTotalGb === null || !Number.isFinite(vramTotalGb) || vramTotalGb <= 0) {
    return 'unknown';
  }
  if (vramTotalGb >= 75) return '80GB';
  if (vramTotalGb >= 38) return '40GB';
  if (vramTotalGb >= 20) return '24GB';
  return '16GB';
}

export function evaluateGpuHealthCheck(
  project: ColabProject,
  telemetry: TelemetrySnapshot,
  config: AutomationConfig
): GpuHealthCheckResult {
  const isConnected =
    telemetry.vramTotalGb !== null &&
    Number.isFinite(telemetry.vramTotalGb) &&
    telemetry.vramTotalGb > 0;

  const requiredPolicy = project.targetGpuPolicy;
  const requiredLabel =
    requiredPolicy === '80GB_ONLY'
      ? 'A100 80GB Zorunlu'
      : 'A100 80GB / 40GB Uyumlu';

  if (!isConnected) {
    return {
      status: 'pending',
      shouldAlert: false,
      isConnected: false,
      allocatedVramGb: null,
      allocatedTier: 'unknown',
      allocatedLabel: 'Bağlantı bekleniyor',
      requiredPolicy,
      requiredLabel,
      highRamOk: true,
      systemRamTotalGb: telemetry.systemRamTotalGb,
      headline: 'Colab runtime bağlantısı bekleniyor',
      detail:
        'Oturum bağlandığında tahsis edilen VRAM (40GB / 80GB) proje gereksinimiyle otomatik karşılaştırılır.',
      recommendedAction: null,
      canRelaxPolicyTo40Gb: false,
    };
  }

  const allocatedVramGb = telemetry.vramTotalGb!;
  const allocatedTier = classifyAllocatedVramTier(allocatedVramGb);
  const gpuLabel = telemetry.gpuName || `NVIDIA GPU (${allocatedVramGb} GB)`;
  const allocatedLabel =
    allocatedTier === 'unknown'
      ? gpuLabel
      : `${allocatedTier} (${allocatedVramGb} GB)`;

  const highRamOk =
    !config.requireHighRam ||
    telemetry.systemRamTotalGb === null ||
    telemetry.systemRamTotalGb >= config.minHighRamGb;

  // Case 1: Non-A100 / Insufficient GPU (< 38 GB)
  if (allocatedTier === '24GB' || allocatedTier === '16GB' || allocatedTier === 'unknown') {
    return {
      status: 'critical',
      shouldAlert: true,
      isConnected: true,
      allocatedVramGb,
      allocatedTier,
      allocatedLabel,
      requiredPolicy,
      requiredLabel,
      highRamOk,
      systemRamTotalGb: telemetry.systemRamTotalGb,
      headline: `Kritik GPU Uyumsuzluğu: ${allocatedVramGb} GB VRAM yetersiz`,
      detail: `${gpuLabel} tahsis edildi. "${project.name}" projesi en az ${
        requiredPolicy === '80GB_ONLY' ? '80 GB' : '40 GB'
      } A100 gerektirir; mevcut kart Compute Unit israfına ve OOM çökmesine yol açar.`,
      recommendedAction:
        'Oturumu runtime.unassign() ile hemen sonlandırıp A100 runtime isteyin.',
      canRelaxPolicyTo40Gb: false,
    };
  }

  // Case 2: Project requires 80GB_ONLY, but runtime allocated 40GB
  if (requiredPolicy === '80GB_ONLY' && allocatedTier === '40GB') {
    return {
      status: 'mismatch',
      shouldAlert: true,
      isConnected: true,
      allocatedVramGb,
      allocatedTier,
      allocatedLabel,
      requiredPolicy,
      requiredLabel,
      highRamOk,
      systemRamTotalGb: telemetry.systemRamTotalGb,
      headline: `VRAM Katmanı Eşleşmedi: 40 GB tahsis edildi, 80 GB gerekli`,
      detail: `Colab oturumu ${gpuLabel} (${allocatedVramGb} GB VRAM) ile bağlandı; ancak "${project.name}" projesi "80GB_ONLY" politikasıyla işaretli.`,
      recommendedAction:
        'A100 80GB oturumu yeniden başlatın veya projeyi 40GB NVFP4 offload uyumlu moda alın.',
      canRelaxPolicyTo40Gb: true,
    };
  }

  // Case 3: VRAM tier matches project policy, check High-RAM requirement
  if (!highRamOk) {
    return {
      status: 'mismatch',
      shouldAlert: true,
      isConnected: true,
      allocatedVramGb,
      allocatedTier,
      allocatedLabel,
      requiredPolicy,
      requiredLabel,
      highRamOk: false,
      systemRamTotalGb: telemetry.systemRamTotalGb,
      headline: `Sistem High-RAM Yetersiz: ${telemetry.systemRamTotalGb} GB < ${config.minHighRamGb} GB`,
      detail: `${allocatedVramGb} GB VRAM uyumlu olsa da sistem belleği (${telemetry.systemRamTotalGb} GB) High-RAM eşiğinin altında. VAE decode aşamasında SIGKILL (Exit 137) riski var.`,
      recommendedAction:
        'High-RAM makine şekli (machine_shape: hm) ile oturumu yeniden açın.',
      canRelaxPolicyTo40Gb: false,
    };
  }

  // Case 4: Healthy match (80GB on 80GB_ONLY/80GB_OR_40GB, or 40GB on 80GB_OR_40GB)
  const modeNote =
    allocatedTier === '80GB'
      ? 'High-VRAM (--highvram) tam kapasite hazır.'
      : '40 GB NVFP4/INT8 offload modu proje politikasıyla uyumlu.';

  return {
    status: 'healthy',
    shouldAlert: false,
    isConnected: true,
    allocatedVramGb,
    allocatedTier,
    allocatedLabel,
    requiredPolicy,
    requiredLabel,
    highRamOk: true,
    systemRamTotalGb: telemetry.systemRamTotalGb,
    headline: `GPU Sağlık Kontrolü Başarılı · ${allocatedTier} VRAM Uyumlu`,
    detail: `${gpuLabel} (${allocatedVramGb} GB VRAM) "${project.name}" (${requiredLabel}) gereksinimleriyle eşleşti. ${modeNote}`,
    recommendedAction: null,
    canRelaxPolicyTo40Gb: false,
  };
}
