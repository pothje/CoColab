import {
  AutomationConfig,
  BatchJobStatus,
  BatchQueueItem,
  ColabProject,
  ComfyModelId,
  TelemetrySnapshot,
} from '../types/automation';
import { hasComfyFlag } from './comfyConfig';

export type ThroughputGpuTierSelection = 'auto' | '80GB' | '40GB';
export type ThroughputMetricMode = 'duration' | 'efficiency';
export type ThroughputComplianceState =
  | 'on_target'
  | 'over_target'
  | 'queued'
  | 'error';

export interface A100EfficiencyProfile {
  effectiveTier: '80GB' | '40GB';
  tierSource: 'override' | 'telemetry' | 'config';
  tierLabel: string;
  modelId: ComfyModelId;
  modelLabel: string;
  targetRenderMin: number;
  baseRenderMin: number;
  theoreticalSpeedupPct: number;
  hasHighVramFlag: boolean;
  activeOptimizations: string[];
}

export interface RenderThroughputDatum {
  id: string;
  order: number;
  projectId: string;
  projectName: string;
  sceneLabel: string;
  shortLabel: string;
  status: BatchJobStatus;
  gpuTierUsed: '80GB' | '40GB';
  actualMin: number | null;
  estimatedMin: number;
  displayDurationMin: number;
  targetMin: number;
  varianceMin: number;
  efficiencyRatioPct: number;
  complianceState: ThroughputComplianceState;
  startedAt: string | null;
  completedAt: string | null;
}

export interface RenderThroughputReport {
  profile: A100EfficiencyProfile;
  items: RenderThroughputDatum[];
  totalJobs: number;
  measuredJobsCount: number;
  onTargetCount: number;
  overTargetCount: number;
  queuedCount: number;
  errorCount: number;
  avgActualMin: number | null;
  avgEstimatedMin: number;
  totalQueueMin: number;
  targetCompliancePct: number | null;
}

const MODEL_BASE_TARGET_MIN: Record<
  ComfyModelId,
  { '80GB': number; '40GB': number; label: string }
> = {
  'minimax-h3': { '80GB': 3.2, '40GB': 4.3, label: 'MiniMax-H3' },
  'wan-2.2': { '80GB': 2.9, '40GB': 3.9, label: 'Wan 2.2' },
  'ltx-2.3': { '80GB': 2.4, '40GB': 3.2, label: 'LTX 2.3' },
};

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function buildCompactJobLabel(index: number, sceneLabel: string): string {
  const prefix = `#${String(index + 1).padStart(2, '0')}`;
  const parts = sceneLabel.split('·');
  const tail = (parts.length > 1 ? parts[parts.length - 1] : sceneLabel).trim();
  const words = tail.split(/\s+/).filter(Boolean);
  const firstWord = words[0] ?? 'Sahne';
  const twoWords = words.slice(0, 2).join(' ');
  const compact =
    twoWords.length <= 13
      ? twoWords
      : firstWord.length <= 12
        ? firstWord
        : `${firstWord.slice(0, 11)}…`;
  return `${prefix} ${compact}`;
}

export function resolveEffectiveA100Tier(
  config: AutomationConfig,
  tierSelection: ThroughputGpuTierSelection = 'auto',
  telemetry?: TelemetrySnapshot
): { tier: '80GB' | '40GB'; source: 'override' | 'telemetry' | 'config' } {
  if (tierSelection === '80GB' || tierSelection === '40GB') {
    return { tier: tierSelection, source: 'override' };
  }

  if (telemetry?.vramTotalGb != null && telemetry.vramTotalGb > 0) {
    return {
      tier: telemetry.vramTotalGb >= 70 ? '80GB' : '40GB',
      source: 'telemetry',
    };
  }

  const highVramEnabled = hasComfyFlag(
    config.comfyui.headlessFlags,
    '--highvram'
  );
  return {
    tier: highVramEnabled ? '80GB' : '40GB',
    source: 'config',
  };
}

export function computeA100EfficiencyProfile(
  config: AutomationConfig,
  tierSelection: ThroughputGpuTierSelection = 'auto',
  telemetry?: TelemetrySnapshot
): A100EfficiencyProfile {
  const { tier, source } = resolveEffectiveA100Tier(
    config,
    tierSelection,
    telemetry
  );
  const modelId: ComfyModelId = config.modelInstaller?.selectedModelId ?? 'minimax-h3';
  const modelSpec = MODEL_BASE_TARGET_MIN[modelId] ?? MODEL_BASE_TARGET_MIN['minimax-h3'];
  const baseRenderMin = modelSpec[tier];
  const hasHighVramFlag = hasComfyFlag(
    config.comfyui.headlessFlags,
    '--highvram'
  );

  let multiplier = 1.0;
  const activeOptimizations: string[] = [];

  if (tier === '80GB' && hasHighVramFlag) {
    activeOptimizations.push('--highvram');
  } else if (tier === '80GB' && !hasHighVramFlag) {
    multiplier *= 1.1;
  }

  if (config.comfyui.enableSageAttention) {
    multiplier *= 0.88;
    activeOptimizations.push('SageAttention');
  }

  if (config.comfyui.enableTeaCache) {
    multiplier *= 0.78;
    activeOptimizations.push('TeaCache');
  }

  if (config.comfyui.enableTurboLora) {
    multiplier *= 0.68;
    activeOptimizations.push(`${config.comfyui.turboSteps || 8}-Step Turbo LoRA`);
  }

  const targetRenderMin = Math.max(0.8, roundOneDecimal(baseRenderMin * multiplier));
  const theoreticalSpeedupPct = Math.max(
    0,
    Math.round(((baseRenderMin - targetRenderMin) / baseRenderMin) * 100)
  );

  return {
    effectiveTier: tier,
    tierSource: source,
    tierLabel: tier === '80GB' ? 'A100 80GB High-VRAM' : 'A100 40GB Offload',
    modelId,
    modelLabel: modelSpec.label,
    targetRenderMin,
    baseRenderMin,
    theoreticalSpeedupPct,
    hasHighVramFlag,
    activeOptimizations,
  };
}

export function estimateJobActualRenderMin(
  job: BatchQueueItem,
  nextStatus: BatchJobStatus
): number | null {
  if (typeof job.actualRenderMin === 'number' && Number.isFinite(job.actualRenderMin)) {
    return roundOneDecimal(job.actualRenderMin);
  }
  const baseEst =
    typeof job.estimatedRenderMin === 'number' && job.estimatedRenderMin > 0
      ? job.estimatedRenderMin
      : 3.0;
  if (nextStatus === 'tamamlandi') {
    return roundOneDecimal(Math.max(0.8, baseEst * 0.9));
  }
  if (nextStatus === 'isleniyor') {
    return roundOneDecimal(Math.max(0.6, baseEst * 0.65));
  }
  if (nextStatus === 'hazirlaniyor') {
    return roundOneDecimal(Math.max(0.4, baseEst * 0.25));
  }
  return null;
}

export function buildRenderThroughputReport(
  queue: BatchQueueItem[],
  projects: ColabProject[],
  config: AutomationConfig,
  tierSelection: ThroughputGpuTierSelection = 'auto',
  telemetry?: TelemetrySnapshot
): RenderThroughputReport {
  const profile = computeA100EfficiencyProfile(config, tierSelection, telemetry);
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  const items: RenderThroughputDatum[] = queue.map((job, idx) => {
    const project = projectMap.get(job.projectId);
    const fallbackTier: '80GB' | '40GB' =
      project?.targetGpuPolicy === '80GB_ONLY' ? '80GB' : profile.effectiveTier;
    const gpuTierUsed = job.gpuTierUsed ?? fallbackTier;

    const estimatedMin = roundOneDecimal(
      job.estimatedRenderMin > 0 ? job.estimatedRenderMin : profile.baseRenderMin
    );

    const isMeasured =
      job.status === 'tamamlandi' ||
      job.status === 'isleniyor' ||
      job.status === 'hazirlaniyor';

    const actualMin =
      typeof job.actualRenderMin === 'number' && Number.isFinite(job.actualRenderMin)
        ? roundOneDecimal(job.actualRenderMin)
        : isMeasured
          ? estimateJobActualRenderMin(job, job.status)
          : null;

    const displayDurationMin = actualMin ?? estimatedMin;
    const targetMin = profile.targetRenderMin;
    const varianceMin = roundOneDecimal(displayDurationMin - targetMin);
    const efficiencyRatioPct = Math.min(
      200,
      Math.max(10, Math.round((targetMin / Math.max(0.1, displayDurationMin)) * 100))
    );

    let complianceState: ThroughputComplianceState;
    if (job.status === 'hata') {
      complianceState = 'error';
    } else if (job.status === 'kuyrukta' || actualMin === null) {
      complianceState = 'queued';
    } else if (actualMin <= targetMin) {
      complianceState = 'on_target';
    } else {
      complianceState = 'over_target';
    }

    return {
      id: job.id,
      order: idx + 1,
      projectId: job.projectId,
      projectName: job.projectName,
      sceneLabel: job.sceneLabel,
      shortLabel: buildCompactJobLabel(idx, job.sceneLabel),
      status: job.status,
      gpuTierUsed,
      actualMin,
      estimatedMin,
      displayDurationMin,
      targetMin,
      varianceMin,
      efficiencyRatioPct,
      complianceState,
      startedAt: job.startedAt ?? null,
      completedAt: job.completedAt ?? null,
    };
  });

  const measuredItems = items.filter(
    (item) => item.complianceState === 'on_target' || item.complianceState === 'over_target'
  );
  const onTargetCount = items.filter((item) => item.complianceState === 'on_target').length;
  const overTargetCount = items.filter((item) => item.complianceState === 'over_target').length;
  const queuedCount = items.filter((item) => item.complianceState === 'queued').length;
  const errorCount = items.filter((item) => item.complianceState === 'error').length;

  const avgActualMin =
    measuredItems.length > 0
      ? roundOneDecimal(
          measuredItems.reduce((sum, item) => sum + (item.actualMin ?? 0), 0) /
            measuredItems.length
        )
      : null;

  const avgEstimatedMin =
    items.length > 0
      ? roundOneDecimal(
          items.reduce((sum, item) => sum + item.estimatedMin, 0) / items.length
        )
      : 0;

  const totalQueueMin = roundOneDecimal(
    items.reduce((sum, item) => sum + item.displayDurationMin, 0)
  );

  const targetCompliancePct =
    measuredItems.length > 0
      ? Math.round((onTargetCount / measuredItems.length) * 100)
      : null;

  return {
    profile,
    items,
    totalJobs: items.length,
    measuredJobsCount: measuredItems.length,
    onTargetCount,
    overTargetCount,
    queuedCount,
    errorCount,
    avgActualMin,
    avgEstimatedMin,
    totalQueueMin,
    targetCompliancePct,
  };
}
