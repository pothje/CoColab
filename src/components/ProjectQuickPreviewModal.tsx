import { useEffect, useState } from 'react';
import { ArrowRight, Film, Play, X } from 'lucide-react';
import { ColabProject } from '../types/automation';
import { getSeedVisualForProject } from '../data/studioVisuals';
import type { ProjectProgressSummary } from '../utils/projectProgress';

export type QuickPreviewLayerKey = 'final' | 'graybox' | 'style';

interface ProjectQuickPreviewModalProps {
  project: ColabProject | null;
  summary: ProjectProgressSummary | null;
  initialLayer?: QuickPreviewLayerKey;
  onClose: () => void;
  onStartProject: (projectId: string) => void;
  onOpenInStudio: (projectId: string) => void;
}

const GPU_LABELS: Record<ColabProject['targetGpuPolicy'], string> = {
  '80GB_ONLY': 'A100 80GB',
  '80GB_OR_40GB': 'A100 80GB / 40GB',
};

function isVideoAssetName(name: string, mime: string): boolean {
  return mime.startsWith('video/') || /\.(mp4|mov|webm|mkv)$/i.test(name);
}

export function ProjectQuickPreviewModal({
  project,
  summary,
  initialLayer = 'final',
  onClose,
  onStartProject,
  onOpenInStudio,
}: ProjectQuickPreviewModalProps) {
  const [activeLayer, setActiveLayer] = useState<QuickPreviewLayerKey>(initialLayer);
  const [brokenLayers, setBrokenLayers] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setActiveLayer(initialLayer);
    setBrokenLayers({});
  }, [project?.id, initialLayer]);

  useEffect(() => {
    if (!project) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [project, onClose]);

  if (!project || !summary) return null;

  const seedVisuals = getSeedVisualForProject(project.id);
  const latestOutput = project.outputs[0];
  const hasRealVideoOutput = Boolean(
    latestOutput?.objectUrl &&
      isVideoAssetName(latestOutput.fileName, latestOutput.mimeType)
  );
  const grayboxAsset = project.assets.find(
    (a) => a.kind === 'blender_graybox' && !isVideoAssetName(a.name, a.mimeType)
  );
  const styleAsset = project.assets.find(
    (a) => a.kind === 'reference_media' && !isVideoAssetName(a.name, a.mimeType)
  );
  const promptAsset =
    project.assets.find(
      (a) => a.kind === 'prompts' && a.name === 'master_prompt.txt'
    ) ?? project.assets.find((a) => a.kind === 'prompts');

  const layerUrls: Record<QuickPreviewLayerKey, string> = {
    final: latestOutput?.objectUrl || seedVisuals.finalPreview,
    graybox: grayboxAsset?.objectUrl || seedVisuals.grayboxPreview,
    style: styleAsset?.objectUrl || seedVisuals.stylePreview,
  };

  const layerTabs: { key: QuickPreviewLayerKey; label: string }[] = [
    { key: 'final', label: 'Final Önizleme' },
    { key: 'graybox', label: '3D Graybox' },
    { key: 'style', label: 'Stil Referansı' },
  ];

  const currentUrl = layerUrls[activeLayer];
  const brokenKey = `${project.id}-${activeLayer}`;
  const showVideoPlayer = activeLayer === 'final' && hasRealVideoOutput && latestOutput?.objectUrl;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-preview-modal-title"
        className="w-full max-w-3xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div className="min-w-0">
            <h2
              id="quick-preview-modal-title"
              className="truncate text-base font-bold tracking-tight text-slate-900"
            >
              {project.name}
            </h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
              <span className="font-semibold text-slate-700">
                {summary.statusLabel} %{summary.progressPct}
              </span>
              <span aria-hidden="true">·</span>
              <span>{GPU_LABELS[project.targetGpuPolicy]}</span>
              <span aria-hidden="true">·</span>
              <span>
                {latestOutput
                  ? `${latestOutput.resolution} · ${latestOutput.durationSec} sn`
                  : `${project.assets.length} proje dosyası`}
              </span>
            </div>
          </div>

          <button
            type="button"
            aria-label="Hızlı izleme penceresini kapat"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          {/* Layer Selector Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              role="tablist"
              aria-label="Hızlı izleme katmanları"
              className="inline-flex rounded-lg bg-slate-100 p-1"
            >
              {layerTabs.map((tab) => {
                const isSelected = activeLayer === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => setActiveLayer(tab.key)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      isSelected
                        ? 'bg-white text-slate-900 shadow-xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <span className="text-xs text-slate-500">
              {summary.stageDetail}
            </span>
          </div>

          {/* 16:9 Stage */}
          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-slate-900">
            {showVideoPlayer ? (
              <video
                src={latestOutput.objectUrl}
                controls
                autoPlay
                loop
                playsInline
                className="h-full w-full object-contain"
              />
            ) : currentUrl && !brokenLayers[brokenKey] ? (
              <img
                src={currentUrl}
                alt={`${project.name} — ${activeLayer} büyük önizleme`}
                referrerPolicy="no-referrer"
                onError={() =>
                  setBrokenLayers((prev) => ({ ...prev, [brokenKey]: true }))
                }
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-300">
                <Film className="h-8 w-8" aria-hidden="true" />
                <span className="text-xs font-medium">{project.name}</span>
              </div>
            )}
          </div>

          {/* Description & Prompt Snippet */}
          <div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Sahne Özeti
              </p>
              <p className="text-xs leading-relaxed text-slate-700">
                {project.description}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Aktif Sahne Tarifi ({promptAsset?.name ?? 'master_prompt.txt'})
              </p>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="line-clamp-3 font-mono text-[11px] leading-relaxed text-slate-700">
                  {promptAsset?.previewText?.trim() ||
                    'Henüz sahne tarifi girilmemiş. Detayları Düzenle veya Stüdyo üzerinden ekleyebilirsiniz.'}
                </p>
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => {
                onStartProject(project.id);
                onClose();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Play className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
              <span>
                {summary.stageKey === 'isleniyor' ? 'Üretim Konsoluna Git' : 'Üretimi Başlat'}
              </span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Kapat
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenInStudio(project.id);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                <span>Stüdyoda Aç</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
