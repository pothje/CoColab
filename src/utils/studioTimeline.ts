import { BatchQueueItem, ColabProject, OutputRenderItem, ProjectAssetFile } from '../types/automation';

export type MonitorViewMode = 'final' | 'graybox' | 'style' | 'compare';
export type CompareTargetLayer = 'graybox' | 'style';

export interface TimelineClipItem {
  id: string;
  track: 'video' | 'graybox' | 'reference';
  label: string;
  sublabel: string;
  startSec: number;
  durationSec: number;
  status: 'ready' | 'rendering' | 'queued' | 'error' | 'guide';
  sourceType: 'output' | 'batch' | 'asset';
  targetMonitorMode: MonitorViewMode;
  refId?: string;
}

export interface StudioTimelineModel {
  totalDurationSec: number;
  fps: number;
  videoClips: TimelineClipItem[];
  grayboxClips: TimelineClipItem[];
  referenceClips: TimelineClipItem[];
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function formatTimecode(seconds: number, fps = 24): string {
  const safeFps = Math.max(1, Math.round(fps));
  const safeSec = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const totalFrames = Math.floor(safeSec * safeFps + 1e-6);
  const frames = totalFrames % safeFps;
  const totalWholeSeconds = Math.floor(totalFrames / safeFps);
  const secs = totalWholeSeconds % 60;
  const mins = Math.floor(totalWholeSeconds / 60) % 60;
  const hours = Math.floor(totalWholeSeconds / 3600);

  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${pad2(hours)}:${pad2(mins)}:${pad2(secs)}:${pad2(frames)}`;
}

export function stepFrameTime(
  currentSec: number,
  deltaFrames: number,
  totalDurationSec: number,
  fps = 24
): number {
  const safeFps = Math.max(1, Math.round(fps));
  const stepSec = deltaFrames / safeFps;
  return Number(clampNumber(currentSec + stepSec, 0, Math.max(0.1, totalDurationSec)).toFixed(4));
}

export function computeTimelineClipStyle(
  clip: Pick<TimelineClipItem, 'startSec' | 'durationSec'>,
  totalDurationSec: number
): { leftPct: number; widthPct: number } {
  const safeTotal = Math.max(1, totalDurationSec);
  const leftPct = clampNumber((clip.startSec / safeTotal) * 100, 0, 96);
  const rawWidth = (clip.durationSec / safeTotal) * 100;
  const widthPct = clampNumber(rawWidth, 6, 100 - leftPct);
  return {
    leftPct: Number(leftPct.toFixed(2)),
    widthPct: Number(widthPct.toFixed(2)),
  };
}

export function buildStudioTimelineModel(
  project: ColabProject,
  batchQueue: BatchQueueItem[],
  fps = 24
): StudioTimelineModel {
  const projectOutputs: OutputRenderItem[] = project.outputs;
  const projectQueueJobs = batchQueue.filter((j) => j.projectId === project.id);

  const videoClips: TimelineClipItem[] = [];
  let cursorSec = 0;

  for (const out of projectOutputs) {
    const dur = Math.max(3, Math.round(out.durationSec || 5));
    videoClips.push({
      id: `tl-out-${out.id}`,
      track: 'video',
      label: out.title,
      sublabel: `${out.resolution} · ${dur}s`,
      startSec: cursorSec,
      durationSec: dur,
      status: out.status === 'revizyon_gerekli' ? 'rendering' : 'ready',
      sourceType: 'output',
      targetMonitorMode: 'final',
      refId: out.id,
    });
    cursorSec += dur;
  }

  for (const job of projectQueueJobs) {
    const dur = Math.max(4, Math.round((job.actualRenderMin ?? job.estimatedRenderMin) * 1.5));
    const status: TimelineClipItem['status'] =
      job.status === 'tamamlandi'
        ? 'ready'
        : job.status === 'hata'
          ? 'error'
          : job.status === 'isleniyor' || job.status === 'hazirlaniyor'
            ? 'rendering'
            : 'queued';

    videoClips.push({
      id: `tl-job-${job.id}`,
      track: 'video',
      label: job.sceneLabel,
      sublabel:
        job.status === 'tamamlandi'
          ? 'Render Tamam'
          : job.status === 'isleniyor'
            ? 'İşleniyor'
            : job.status === 'hazirlaniyor'
              ? 'Hazırlık'
              : 'Kuyrukta',
      startSec: cursorSec,
      durationSec: dur,
      status,
      sourceType: 'batch',
      targetMonitorMode: 'final',
      refId: job.id,
    });
    cursorSec += dur;
  }

  if (videoClips.length === 0) {
    videoClips.push({
      id: 'tl-default-final',
      track: 'video',
      label: `${project.name} · Ana Sekans`,
      sublabel: 'MiniMax H3 · 5.0s',
      startSec: 0,
      durationSec: 5,
      status: 'queued',
      sourceType: 'output',
      targetMonitorMode: 'final',
    });
    cursorSec = 5;
  }

  const totalDurationSec = Math.max(10, cursorSec);

  const grayboxAssets: ProjectAssetFile[] = project.assets.filter(
    (a) => a.kind === 'blender_graybox'
  );
  const grayboxClips: TimelineClipItem[] =
    grayboxAssets.length > 0
      ? grayboxAssets.map((asset, idx) => {
          const span = Number((totalDurationSec / grayboxAssets.length).toFixed(2));
          return {
            id: `tl-gb-${asset.id}`,
            track: 'graybox',
            label: asset.name,
            sublabel: '3D Kamera Kılavuzu',
            startSec: Number((idx * span).toFixed(2)),
            durationSec: span,
            status: 'guide',
            sourceType: 'asset',
            targetMonitorMode: 'graybox',
            refId: asset.id,
          };
        })
      : [
          {
            id: 'tl-gb-placeholder',
            track: 'graybox',
            label: 'cam01_graybox_anim.mp4',
            sublabel: '3D Kamera',
            startSec: 0,
            durationSec: totalDurationSec,
            status: 'guide',
            sourceType: 'asset',
            targetMonitorMode: 'graybox',
          },
        ];

  const refAssets = project.assets.filter(
    (a) => a.kind === 'reference_media' || a.kind === 'prompts'
  );
  const referenceClips: TimelineClipItem[] =
    refAssets.length > 0
      ? refAssets.slice(0, 3).map((asset, idx, arr) => {
          const span = Number((totalDurationSec / arr.length).toFixed(2));
          return {
            id: `tl-ref-${asset.id}`,
            track: 'reference',
            label: asset.name,
            sublabel: asset.kind === 'prompts' ? 'Sahne Tarifi' : 'Stil & Işık Ref',
            startSec: Number((idx * span).toFixed(2)),
            durationSec: span,
            status: 'guide',
            sourceType: 'asset',
            targetMonitorMode: 'style',
            refId: asset.id,
          };
        })
      : [
          {
            id: 'tl-ref-placeholder',
            track: 'reference',
            label: 'style_ref + master_prompt',
            sublabel: 'Stil & Prompt',
            startSec: 0,
            durationSec: totalDurationSec,
            status: 'guide',
            sourceType: 'asset',
            targetMonitorMode: 'style',
          },
        ];

  return {
    totalDurationSec,
    fps,
    videoClips,
    grayboxClips,
    referenceClips,
  };
}
