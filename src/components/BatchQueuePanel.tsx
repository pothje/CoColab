import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  ChevronDown,
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
import { getDeliveryPreset } from '../utils/claudeBundle';
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
  kuyrukta: { text: 'Bekliyor', className: 'text-zinc-400' },
  hazirlaniyor: { text: 'Hazırlanıyor', className: 'text-[#0A84FF]' },
  isleniyor: { text: 'Üretiliyor', className: 'text-amber-400' },
  tamamlandi: { text: 'Tamamlandı', className: 'text-[#30D158]' },
  hata: { text: 'Durduruldu', className: 'text-[#FF453A]' },
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
  const [showSchedule, setShowSchedule] = useState<boolean>(config.batchSchedule.enabled);

  const effectiveProjectId = projects.some((p) => p.id === selectedProjectId)
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
    <section className="rounded-2xl border border-white/[0.08] bg-[#141417] p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-[#0A84FF]">
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Toplu Üretim Sırası</span>
          </div>
          <h2 className="mt-0.5 text-base font-semibold tracking-tight text-[#F5F5F7]">
            Üretim Kuyruğu ({queue.length} sahne)
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {hasCompleted && (
            <button
              type="button"
              onClick={onClearCompleted}
              className="rounded-full border border-white/[0.08] bg-[#1C1C20] px-3.5 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/[0.08] whitespace-nowrap"
            >
              Tamamlananları Temizle
            </button>
          )}
          <button
            type="button"
            onClick={onDownloadQueueManifest}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-[#1C1C20] px-3.5 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/[0.08] whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Listeyi İndir
          </button>
        </div>
      </div>

      {/* Compact 3-Metric Readout */}
      <div className="grid divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] bg-[#0E0E11] sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
        <div className="px-4 py-3.5">
          <div className="text-xs text-zinc-500">Tek Oturum Süresi</div>
          <div className="mt-0.5 text-lg font-semibold text-[#F5F5F7] tabular-nums">
            ~{savings.singleSessionTotalMin} dk
          </div>
        </div>
        <div className="px-4 py-3.5">
          <div className="text-xs text-zinc-500">Ayrı Çalıştırılsaydı</div>
          <div className="mt-0.5 text-lg font-semibold text-zinc-400 tabular-nums">
            ~{savings.separateSessionsTotalMin} dk
          </div>
        </div>
        <div className="px-4 py-3.5">
          <div className="text-xs text-zinc-500">Kazanılan Süre</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-lg font-semibold text-[#30D158] tabular-nums">
            <Clock className="h-4 w-4" aria-hidden="true" />
            {savings.savedSetupMin} dk tasarruf
          </div>
        </div>
      </div>

      {/* Clean Inline Scene Adder */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <select
          id="batch-project-select"
          aria-label="Sıraya Eklenecek Proje"
          value={effectiveProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
          className="rounded-xl border border-white/[0.08] bg-[#0E0E11] px-3 py-2 text-xs font-medium text-[#F5F5F7] focus:border-[#0A84FF] focus:outline-none sm:w-56"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <input
          id="batch-scene-label"
          aria-label="Sahne Adı"
          type="text"
          placeholder="Sahne adı (örn: Sahne 03 · Gece Aydınlatma)"
          value={sceneLabelInput}
          onChange={(e) => setSceneLabelInput(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-[#0E0E11] px-3.5 py-2 text-xs text-[#F5F5F7] placeholder:text-zinc-500 focus:border-[#0A84FF] focus:outline-none"
        />

        <button
          type="button"
          onClick={handleAddClick}
          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#0A84FF] px-4 py-2 text-xs font-semibold text-white transition-colors hover:brightness-110 whitespace-nowrap shrink-0"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Sıraya Ekle
        </button>
      </div>

      {/* Queue List */}
      {queue.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/[0.1] bg-[#0E0E11] p-6 text-center text-xs text-zinc-500">
          Üretim sırası boş. Yukarıdan yeni bir sahne ekleyin.
        </div>
      ) : (
        <div className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] bg-[#0E0E11]">
          {queue.map((job, idx) => {
            const statusStyle = STATUS_LABELS[job.status];
            const presetSpec = job.deliveryPreset
              ? getDeliveryPreset(job.deliveryPreset)
              : null;

            return (
              <div
                key={job.id}
                className="flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-medium text-zinc-500 tabular-nums shrink-0 w-6">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-[#F5F5F7]">
                      {job.sceneLabel}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      <span>{job.projectName}</span>
                      {presetSpec && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-zinc-400">
                            {presetSpec.shortLabel} ({presetSpec.width}×{presetSpec.height})
                          </span>
                        </>
                      )}
                      {job.requiresBlenderRender && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#0A84FF]">Blender OptiX</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {typeof job.actualRenderMin === 'number'
                          ? `${job.actualRenderMin.toFixed(1)} dk`
                          : `~${job.estimatedRenderMin} dk`}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <span className={`mr-1 text-xs font-medium ${statusStyle.className}`}>
                    {statusStyle.text}
                  </span>

                  <button
                    type="button"
                    aria-label={`${job.sceneLabel} yukarı taşı`}
                    disabled={idx === 0}
                    onClick={() => onReorderJob(idx, 'up')}
                    className="rounded-full border border-white/[0.08] bg-[#1C1C20] p-1.5 text-zinc-300 hover:bg-white/[0.1] hover:text-white disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`${job.sceneLabel} aşağı taşı`}
                    disabled={idx === queue.length - 1}
                    onClick={() => onReorderJob(idx, 'down')}
                    className="rounded-full border border-white/[0.08] bg-[#1C1C20] p-1.5 text-zinc-300 hover:bg-white/[0.1] hover:text-white disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`${job.sceneLabel} sıradan çıkar`}
                    onClick={() => onRemoveJob(job.id)}
                    className="rounded-full border border-white/[0.08] bg-[#1C1C20] p-1.5 text-zinc-400 hover:bg-[#FF453A]/20 hover:text-[#FF453A]"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Collapsible Scheduled Launch Section */}
      <div className="border-t border-white/[0.06] pt-3">
        <button
          type="button"
          onClick={() => setShowSchedule((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left text-xs font-medium text-zinc-300 transition-colors hover:bg-white/[0.03]"
        >
          <span className="inline-flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-[#0A84FF]" aria-hidden="true" />
            <span>Zamanlanmış Başlatma &amp; Yük Tetikleyicisi</span>
            {config.batchSchedule.enabled && (
              <span className="rounded-full bg-[#30D158]/15 px-2 py-0.5 text-[11px] font-medium text-[#30D158]">
                Aktif
              </span>
            )}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-zinc-500 transition-transform ${
              showSchedule ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </button>

        {showSchedule && (
          <div className="mt-3">
            <BatchSchedulePanel
              queue={queue}
              config={config}
              telemetry={telemetry}
              onUpdateConfig={onUpdateConfig}
              onTriggerNow={onTriggerScheduledStart}
            />
          </div>
        )}
      </div>
    </section>
  );
}
