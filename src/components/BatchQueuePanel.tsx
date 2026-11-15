import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Clock,
  Download,
  Layers,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  AutomationConfig,
  BatchJobStatus,
  BatchQueueItem,
  ColabProject,
  TelemetrySnapshot,
} from '../types/automation';
import { calculateBatchTimeSavings } from '../utils/guardrailEngine';
import { BatchSchedulePanel } from './BatchSchedulePanel';

interface BatchQueuePanelProps {
  queue: BatchQueueItem[];
  projects: ColabProject[];
  config: AutomationConfig;
  telemetry: TelemetrySnapshot;
  onUpdateConfig: (next: AutomationConfig) => void;
  onTriggerScheduledStart: (reason: string) => void;
  onAddJob: (projectId: string, sceneLabel: string) => void;
  onReorderJob: (index: number, direction: 'up' | 'down') => void;
  onRemoveJob: (jobId: string) => void;
  onClearCompleted: () => void;
  onDownloadQueueManifest: () => void;
}

const STATUS_LABELS: Record<BatchJobStatus, { text: string; className: string }> = {
  kuyrukta: { text: 'Sırada Bekliyor', className: 'text-slate-600' },
  hazirlaniyor: { text: 'Hazırlanıyor', className: 'text-blue-600' },
  isleniyor: { text: 'Video Üretiliyor', className: 'text-amber-700' },
  tamamlandi: { text: 'Tamamlandı', className: 'text-emerald-700' },
  hata: { text: 'Durduruldu', className: 'text-rose-700' },
};

export function BatchQueuePanel({
  queue,
  projects,
  config,
  telemetry,
  onUpdateConfig,
  onTriggerScheduledStart,
  onAddJob,
  onReorderJob,
  onRemoveJob,
  onClearCompleted,
  onDownloadQueueManifest,
}: BatchQueuePanelProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    projects[0]?.id ?? ''
  );
  const [sceneLabelInput, setSceneLabelInput] = useState<string>('');

  const effectiveProjectId =
    projects.some((p) => p.id === selectedProjectId)
      ? selectedProjectId
      : (projects[0]?.id ?? '');

  const savings = calculateBatchTimeSavings(queue, config.setupMinutesEstimate);
  const hasCompleted = queue.some((j) => j.status === 'tamamlandi');

  function handleAddClick() {
    if (!effectiveProjectId) return;
    const targetProject = projects.find((p) => p.id === effectiveProjectId);
    const label =
      sceneLabelInput.trim() ||
      `Sahne ${String(queue.length + 1).padStart(2, '0')} · ${targetProject?.name ?? 'Proje'}`;
    onAddJob(effectiveProjectId, label);
    setSceneLabelInput('');
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-600">
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            Tek Kurulumda Çoklu Sahne Sırası
          </div>
          <h2 className="mt-1 text-base font-bold text-slate-900">
            Toplu Üretim Kuyruğu ({queue.length} sahne)
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Sistem bir kez hazırlanır; sıradaki tüm projeler ve sahneler ek kurulum beklemeden
            peş peşe üretilir.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {hasCompleted && (
            <button
              type="button"
              onClick={onClearCompleted}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 whitespace-nowrap"
            >
              Tamamlananları Temizle
            </button>
          )}
          <button
            type="button"
            onClick={onDownloadQueueManifest}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-blue-300 hover:bg-slate-50 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Sıra Listesini İndir
          </button>
        </div>
      </div>

      {/* Time Amortization Readout */}
      <div className="grid divide-y divide-slate-200 rounded-lg border border-slate-200 bg-slate-50 sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
        <div className="p-4">
          <div className="text-[11px] font-medium text-slate-500">Tek Oturumda Toplam Süre</div>
          <div className="mt-1 font-mono text-lg font-bold text-slate-900 tabular-nums">
            ~{savings.singleSessionTotalMin} dk
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
            {config.setupMinutesEstimate} dk hazırlık + {savings.totalRenderMin} dk video üretimi
          </div>
        </div>
        <div className="p-4">
          <div className="text-[11px] font-medium text-slate-500">Ayrı Ayrı Çalışsaydı</div>
          <div className="mt-1 font-mono text-lg font-bold text-slate-600 tabular-nums">
            ~{savings.separateSessionsTotalMin} dk
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
            {savings.totalJobs} kez yeniden kurulum süresi
          </div>
        </div>
        <div className="p-4">
          <div className="text-[11px] font-medium text-slate-500">Kazanılan Süre</div>
          <div className="mt-1 flex items-center gap-1.5 font-mono text-lg font-bold text-emerald-700 tabular-nums">
            <Clock className="h-4 w-4" aria-hidden="true" />
            {savings.savedSetupMin} dk tasarruf
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            Tüm sahneler bitince sistem otomatik kapanır
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <label
            htmlFor="batch-project-select"
            className="block text-xs font-medium text-slate-700"
          >
            Sıraya Eklenecek Proje
          </label>
          <select
            id="batch-project-select"
            value={effectiveProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.assets.filter((a) => a.included).length} öge)
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 space-y-1.5">
          <label
            htmlFor="batch-scene-label"
            className="block text-xs font-medium text-slate-700"
          >
            Sahne Adı
          </label>
          <input
            id="batch-scene-label"
            type="text"
            placeholder="Örn: Sahne 03 · Gece Aydınlatma Geçişi"
            value={sceneLabelInput}
            onChange={(e) => setSceneLabelInput(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
          />
        </div>

        <button
          type="button"
          onClick={handleAddClick}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Sıraya Ekle
        </button>
      </div>

      {queue.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500">
          Üretim sırası şu an boş. Tek kurulumda art arda üretmek için yukarıdan bir sahne
          ekleyin.
        </div>
      ) : (
        <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {queue.map((job, idx) => {
            const proj = projects.find((p) => p.id === job.projectId);
            const assetCount = proj ? proj.assets.filter((a) => a.included).length : 0;
            const statusStyle = STATUS_LABELS[job.status];

            return (
              <div
                key={job.id}
                className="flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span className="mt-0.5 font-mono text-xs font-semibold text-slate-400 tabular-nums shrink-0">
                    #{String(idx + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-slate-900">
                      {job.sceneLabel}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span>{job.projectName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{assetCount} dosya</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">~{job.estimatedRenderMin} dk</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <span className={`text-xs font-semibold ${statusStyle.className}`}>
                    {statusStyle.text}
                  </span>

                  <button
                    type="button"
                    aria-label={`${job.sceneLabel} yukarı taşı`}
                    disabled={idx === 0}
                    onClick={() => onReorderJob(idx, 'up')}
                    className="rounded border border-slate-200 bg-white p-1.5 text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`${job.sceneLabel} aşağı taşı`}
                    disabled={idx === queue.length - 1}
                    onClick={() => onReorderJob(idx, 'down')}
                    className="rounded border border-slate-200 bg-white p-1.5 text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`${job.sceneLabel} sıradan çıkar`}
                    onClick={() => onRemoveJob(job.id)}
                    className="rounded border border-slate-200 bg-white p-1.5 text-slate-500 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <BatchSchedulePanel
        queue={queue}
        config={config}
        telemetry={telemetry}
        onUpdateConfig={onUpdateConfig}
        onTriggerNow={onTriggerScheduledStart}
      />
    </section>
  );
}
