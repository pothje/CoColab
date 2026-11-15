import {
  BatchQueueItem,
  ColabProject,
  TelemetrySnapshot,
} from '../types/automation';
import { validateAssetsCompleteness } from './guardrailEngine';

export type DashboardStatusKey = 'kuyrukta' | 'isleniyor' | 'tamamlandi';
export type DashboardStageKey = 'kuyrukta' | 'hazirlaniyor' | 'isleniyor' | 'tamamlandi';
export type DashboardFilterOption = 'tumu' | DashboardStatusKey;

export interface ProjectProgressSummary {
  projectId: string;
  status: DashboardStatusKey;
  stageKey: DashboardStageKey;
  statusLabel: string;
  progressPct: number;
  stageDetail: string;
  totalJobs: number;
  queuedJobs: number;
  processingJobs: number;
  completedJobs: number;
  estimatedRemainingMin: number;
  readinessCount: number;
  readinessTotal: number;
  readinessItems: {
    id: string;
    label: string;
    ready: boolean;
  }[];
}

const ACTIVE_TELEMETRY_STAGES = new Set([
  'preflight',
  'downloading',
  'injecting',
  'rendering',
  'saving_local',
  'backing_up_drive',
]);

function mapTelemetryToPercent(telemetry: TelemetrySnapshot): {
  pct: number;
  stageKey: DashboardStageKey;
  label: string;
} {
  switch (telemetry.stage) {
    case 'preflight':
      return {
        pct: 18,
        stageKey: 'hazirlaniyor',
        label: telemetry.currentStepLabel || 'GPU ve RAM doğrulaması yapılıyor',
      };
    case 'downloading': {
      const dl = telemetry.downloadProgressPct ?? 50;
      return {
        pct: Math.min(48, Math.max(20, Math.round(20 + dl * 0.28))),
        stageKey: 'hazirlaniyor',
        label: telemetry.currentStepLabel || 'Model ağırlıkları indiriliyor',
      };
    }
    case 'injecting':
      return {
        pct: 56,
        stageKey: 'isleniyor',
        label: telemetry.currentStepLabel || 'ComfyUI iş akışı hazırlanıyor',
      };
    case 'rendering':
      return {
        pct: 76,
        stageKey: 'isleniyor',
        label: telemetry.currentStepLabel || 'MiniMax H3 kare üretimi sürüyor',
      };
    case 'saving_local':
      return {
        pct: 90,
        stageKey: 'isleniyor',
        label: telemetry.currentStepLabel || 'Çıktılar yerele indiriliyor',
      };
    case 'backing_up_drive':
      return {
        pct: 96,
        stageKey: 'isleniyor',
        label: telemetry.currentStepLabel || 'Google Drive yedeği alınıyor',
      };
    default:
      return {
        pct: 68,
        stageKey: 'isleniyor',
        label: 'ComfyUI üretim aşamasında',
      };
  }
}

export function computeProjectProgress(
  project: ColabProject,
  batchQueue: BatchQueueItem[],
  telemetry?: TelemetrySnapshot
): ProjectProgressSummary {
  const projectJobs = batchQueue.filter((job) => job.projectId === project.id);
  const completedJobs = projectJobs.filter((j) => j.status === 'tamamlandi').length;
  const preparingJobs = projectJobs.filter((j) => j.status === 'hazirlaniyor').length;
  const renderingJobs = projectJobs.filter((j) => j.status === 'isleniyor').length;
  const processingJobs = preparingJobs + renderingJobs;
  const queuedJobs = projectJobs.filter((j) => j.status === 'kuyrukta').length;
  const totalJobs = projectJobs.length;

  const completeness = validateAssetsCompleteness(project.assets);
  const readinessItems = [
    { id: 'prompts', label: 'Sahne Tarifi', ready: completeness.hasPrompts },
    { id: 'graybox', label: '3D Graybox', ready: completeness.hasGraybox },
    { id: 'settings', label: 'Kalite Ayarı', ready: completeness.hasSettings },
    {
      id: 'workflow',
      label: 'Motor Akışı',
      ready: completeness.hasComfyWorkflow || completeness.hasSchema,
    },
  ];
  const readinessCount = readinessItems.filter((item) => item.ready).length;
  const readinessTotal = readinessItems.length;

  const estimatedRemainingMin = projectJobs
    .filter((j) => j.status !== 'tamamlandi')
    .reduce((sum, j) => sum + j.estimatedRenderMin, 0);

  const isLiveTelemetryActive =
    telemetry &&
    telemetry.activeProjectId === project.id &&
    ACTIVE_TELEMETRY_STAGES.has(telemetry.stage);

  if (isLiveTelemetryActive && telemetry) {
    const mapped = mapTelemetryToPercent(telemetry);
    return {
      projectId: project.id,
      status: 'isleniyor',
      stageKey: mapped.stageKey,
      statusLabel: mapped.stageKey === 'hazirlaniyor' ? 'Hazırlanıyor' : 'İşleniyor',
      progressPct: mapped.pct,
      stageDetail: mapped.label,
      totalJobs: Math.max(1, totalJobs),
      queuedJobs,
      processingJobs: Math.max(1, processingJobs),
      completedJobs,
      estimatedRemainingMin,
      readinessCount,
      readinessTotal,
      readinessItems,
    };
  }

  if (renderingJobs > 0) {
    const basePct =
      totalJobs > 0
        ? Math.round(((completedJobs + 0.68 * renderingJobs + 0.35 * preparingJobs) / totalJobs) * 100)
        : 68;
    const clampedPct = Math.min(95, Math.max(45, basePct));
    const activeScene = projectJobs.find((j) => j.status === 'isleniyor')?.sceneLabel;

    return {
      projectId: project.id,
      status: 'isleniyor',
      stageKey: 'isleniyor',
      statusLabel: 'İşleniyor',
      progressPct: clampedPct,
      stageDetail: activeScene
        ? `${activeScene} · ComfyUI render sürüyor`
        : 'ComfyUI + MiniMax H3 kare üretimi sürüyor',
      totalJobs,
      queuedJobs,
      processingJobs,
      completedJobs,
      estimatedRemainingMin,
      readinessCount,
      readinessTotal,
      readinessItems,
    };
  }

  if (preparingJobs > 0) {
    const basePct =
      totalJobs > 0
        ? Math.round(((completedJobs + 0.35 * preparingJobs) / totalJobs) * 100)
        : 35;
    const clampedPct = Math.min(60, Math.max(25, basePct));
    const activeScene = projectJobs.find((j) => j.status === 'hazirlaniyor')?.sceneLabel;

    return {
      projectId: project.id,
      status: 'isleniyor',
      stageKey: 'hazirlaniyor',
      statusLabel: 'Hazırlanıyor',
      progressPct: clampedPct,
      stageDetail: activeScene
        ? `${activeScene} · A100 High-RAM & ComfyUI hazırlanıyor`
        : 'A100 High-RAM & ComfyUI ortamı hazırlanıyor',
      totalJobs,
      queuedJobs,
      processingJobs,
      completedJobs,
      estimatedRemainingMin,
      readinessCount,
      readinessTotal,
      readinessItems,
    };
  }

  if (queuedJobs > 0) {
    const partialPct =
      totalJobs > 0 && completedJobs > 0
        ? Math.round((completedJobs / totalJobs) * 100)
        : 0;
    return {
      projectId: project.id,
      status: 'kuyrukta',
      stageKey: 'kuyrukta',
      statusLabel: 'Kuyrukta',
      progressPct: partialPct,
      stageDetail:
        completedJobs > 0
          ? `${completedJobs}/${totalJobs} sahne bitti · ${queuedJobs} sahne sırada`
          : `Üretim sırası bekleniyor · ~${estimatedRemainingMin} dk`,
      totalJobs,
      queuedJobs,
      processingJobs,
      completedJobs,
      estimatedRemainingMin,
      readinessCount,
      readinessTotal,
      readinessItems,
    };
  }

  if (completedJobs > 0 || project.outputs.length > 0) {
    const latestOutput = project.outputs[0];
    return {
      projectId: project.id,
      status: 'tamamlandi',
      stageKey: 'tamamlandi',
      statusLabel: 'Tamamlandı',
      progressPct: 100,
      stageDetail: latestOutput
        ? `${latestOutput.fileName} hazır · ${latestOutput.resolution}`
        : `${completedJobs}/${Math.max(1, totalJobs)} sahne tamamlandı`,
      totalJobs: Math.max(1, totalJobs),
      queuedJobs: 0,
      processingJobs: 0,
      completedJobs: Math.max(1, completedJobs),
      estimatedRemainingMin: 0,
      readinessCount,
      readinessTotal,
      readinessItems,
    };
  }

  return {
    projectId: project.id,
    status: 'kuyrukta',
    stageKey: 'kuyrukta',
    statusLabel: 'Kuyrukta',
    progressPct: 0,
    stageDetail:
      readinessCount === readinessTotal
        ? 'Dosyalar hazır · Sıraya alınmayı bekliyor'
        : 'Sıraya almak için aşağıdaki aşamalardan seçin',
    totalJobs: 0,
    queuedJobs: 0,
    processingJobs: 0,
    completedJobs: 0,
    estimatedRemainingMin: 0,
    readinessCount,
    readinessTotal,
    readinessItems,
  };
}

export function filterProjectsForDashboard(
  projects: ColabProject[],
  progressById: Record<string, ProjectProgressSummary>,
  searchQuery: string,
  statusFilter: DashboardFilterOption
): ColabProject[] {
  const q = searchQuery.trim().toLowerCase();
  return projects.filter((project) => {
    const summary = progressById[project.id];
    if (statusFilter !== 'tumu' && summary?.status !== statusFilter) {
      return false;
    }
    if (!q) return true;
    return (
      project.name.toLowerCase().includes(q) ||
      project.description.toLowerCase().includes(q)
    );
  });
}

export interface ProjectDetailUpdateInput {
  name: string;
  description: string;
  targetGpuPolicy: ColabProject['targetGpuPolicy'];
  masterPromptText?: string;
  updatedAt?: string;
}

export function applyProjectDetailUpdate(
  projects: ColabProject[],
  projectId: string,
  updates: ProjectDetailUpdateInput
): ColabProject[] {
  const trimmedName = updates.name.trim();
  const trimmedDesc = updates.description.trim();
  const nextDate = updates.updatedAt || new Date().toISOString().slice(0, 10);

  return projects.map((project) => {
    if (project.id !== projectId) return project;

    let nextAssets = project.assets;
    if (updates.masterPromptText !== undefined) {
      const nextText = updates.masterPromptText;
      const nextSize = new TextEncoder().encode(nextText).length;
      const masterPromptIdx = project.assets.findIndex(
        (asset) => asset.kind === 'prompts' && asset.name === 'master_prompt.txt'
      );
      const fallbackPromptIdx =
        masterPromptIdx !== -1
          ? masterPromptIdx
          : project.assets.findIndex((asset) => asset.kind === 'prompts');

      if (fallbackPromptIdx !== -1) {
        nextAssets = project.assets.map((asset, idx) =>
          idx === fallbackPromptIdx
            ? { ...asset, previewText: nextText, sizeBytes: nextSize }
            : asset
        );
      }
    }

    return {
      ...project,
      name: trimmedName || project.name,
      description: trimmedDesc,
      targetGpuPolicy: updates.targetGpuPolicy,
      updatedAt: nextDate,
      assets: nextAssets,
    };
  });
}

