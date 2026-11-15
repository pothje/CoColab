import { useEffect, useMemo, useState } from 'react';
import { Calendar, Clock, Cpu, Play, RotateCcw } from 'lucide-react';
import {
  AutomationConfig,
  BatchQueueItem,
  BatchScheduleConfig,
  BatchScheduleMode,
  BatchScheduleRecurrence,
  TelemetrySnapshot,
} from '../types/automation';
import {
  evaluateBatchSchedule,
  formatDateIsoLocal,
  formatTimeHmLocal,
  getCalendarWeekDays,
} from '../utils/batchScheduler';

interface BatchSchedulePanelProps {
  queue: BatchQueueItem[];
  config: AutomationConfig;
  telemetry: TelemetrySnapshot;
  onUpdateConfig: (next: AutomationConfig) => void;
  onTriggerNow: (reason: string) => void;
}

const MODE_OPTIONS: Array<{ id: BatchScheduleMode; label: string; hint: string }> = [
  {
    id: 'time',
    label: 'Belirli Saat',
    hint: 'Seçilen gün ve saatte kuyruktaki işleri otomatik başlatır',
  },
  {
    id: 'low_load',
    label: 'Düşük Sistem Yükü',
    hint: 'GPU VRAM ve RAM kullanımı eşik altına düştüğünde otomatik başlatır',
  },
  {
    id: 'time_and_low_load',
    label: 'Saat + Düşük Yük',
    hint: 'Hem takvim saati geldiğinde hem sistem yükü düştüğünde başlatır',
  },
];

const RECURRENCE_OPTIONS: Array<{ id: BatchScheduleRecurrence; label: string }> = [
  { id: 'once', label: 'Tek Seferlik' },
  { id: 'daily', label: 'Her Gün' },
  { id: 'weekdays', label: 'Hafta İçi' },
];

export function BatchSchedulePanel({
  queue,
  config,
  telemetry,
  onUpdateConfig,
  onTriggerNow,
}: BatchSchedulePanelProps) {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const schedule = config.batchSchedule;

  const updateSchedule = (patch: Partial<BatchScheduleConfig>) => {
    onUpdateConfig({
      ...config,
      batchSchedule: {
        ...schedule,
        ...patch,
      },
    });
  };

  const evaluation = useMemo(
    () => evaluateBatchSchedule(schedule, queue, now, telemetry),
    [schedule, queue, now, telemetry]
  );

  const calendarDays = useMemo(
    () => getCalendarWeekDays(schedule, now),
    [schedule, now]
  );

  const applyRelativeMinutes = (minutesAhead: number) => {
    const target = new Date(now.getTime() + minutesAhead * 60_000);
    updateSchedule({
      scheduledDate: formatDateIsoLocal(target),
      scheduledTime: formatTimeHmLocal(target),
      lastTriggeredAt: null,
    });
  };

  const applyFixedHour = (timeHm: string) => {
    const todayIso = formatDateIsoLocal(now);
    const currentHm = formatTimeHmLocal(now);
    let targetDate = todayIso;
    if (timeHm <= currentHm) {
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      targetDate = formatDateIsoLocal(tomorrow);
    }
    updateSchedule({
      scheduledDate: targetDate,
      scheduledTime: timeHm,
      lastTriggeredAt: null,
    });
  };

  const showTimeControls = schedule.mode === 'time' || schedule.mode === 'time_and_low_load';
  const showLoadControls =
    schedule.mode === 'low_load' || schedule.mode === 'time_and_low_load';
  const nextQueuedJob = queue.find((j) => j.status === 'kuyrukta') ?? null;

  return (
    <div
      data-testid="batch-schedule-section"
      className="border-t border-slate-200 pt-5 space-y-4"
    >
      {/* Header Row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-600">
            <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Zamanlanmış Başlatma &amp; Yük Tetikleyicisi</span>
          </div>
          <p className="mt-0.5 text-xs text-slate-600">
            Belirlediğiniz saatte veya GPU/RAM sistem yükü eşik altına düştüğünde sıradaki
            işleri otomatik başlatır.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            role="switch"
            aria-checked={schedule.enabled}
            onClick={() =>
              updateSchedule({
                enabled: !schedule.enabled,
              })
            }
            className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              schedule.enabled
                ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {schedule.enabled ? 'Zamanlayıcı Aktif' : 'Zamanlayıcıyı Etkinleştir'}
          </button>

          <button
            type="button"
            disabled={evaluation.queuedCount === 0}
            onClick={() => onTriggerNow('Manuel anlık tetikleme')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:border-blue-300 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            <Play className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
            Şimdi Başlat
          </button>
        </div>
      </div>

      {/* Mode Selector */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="group"
          aria-label="Zamanlama tetikleyici modu"
          className="inline-flex max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-slate-100 p-1"
        >
          {MODE_OPTIONS.map((opt) => {
            const active = schedule.mode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={active}
                onClick={() => updateSchedule({ mode: opt.id })}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="text-xs text-slate-600">
          {MODE_OPTIONS.find((m) => m.id === schedule.mode)?.hint}
        </div>
      </div>

      {/* Live Status Readout Strip */}
      <div className="grid divide-y divide-slate-200 rounded-lg border border-slate-200 bg-slate-50 sm:grid-cols-2 lg:grid-cols-4 sm:divide-y-0 sm:divide-x">
        <div className="p-3.5 min-w-0">
          <div className="text-[11px] font-medium text-slate-500">Tetikleyici Durumu</div>
          <div
            data-testid="scheduler-status-headline"
            className={`mt-1 text-xs font-bold ${
              schedule.enabled ? 'text-blue-700' : 'text-slate-700'
            }`}
          >
            {evaluation.statusHeadline}
          </div>
        </div>

        <div className="p-3.5 min-w-0">
          <div className="text-[11px] font-medium text-slate-500">
            {schedule.mode === 'low_load' ? 'Yük Koşulu' : 'Kalan Süre / Pencere'}
          </div>
          <div
            data-testid="scheduler-countdown"
            className="mt-1 font-mono text-sm font-bold text-slate-900 tabular-nums"
          >
            {evaluation.countdownLabel}
          </div>
        </div>

        <div className="p-3.5 min-w-0">
          <div className="text-[11px] font-medium text-slate-500">Sıradaki Kuyruk İşi</div>
          <div className="mt-1 truncate text-xs font-semibold text-slate-900">
            {nextQueuedJob ? nextQueuedJob.sceneLabel : 'Bekleyen iş yok'}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
            {evaluation.queuedCount} iş kuyrukta bekliyor
          </div>
        </div>

        <div className="p-3.5 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-slate-500">Son Tetikleme</span>
            {schedule.lastTriggeredAt && (
              <button
                type="button"
                onClick={() =>
                  updateSchedule({ lastTriggeredAt: null, lastTriggerReason: null })
                }
                aria-label="Son tetikleme kaydını sıfırla"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-900"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                Sıfırla
              </button>
            )}
          </div>
          <div
            data-testid="scheduler-last-trigger"
            className="mt-1 truncate text-xs font-semibold text-slate-900 tabular-nums"
          >
            {schedule.lastTriggeredAt
              ? new Date(schedule.lastTriggeredAt).toLocaleTimeString('tr-TR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })
              : 'Henüz tetiklenmedi'}
          </div>
          {schedule.lastTriggerReason && (
            <div className="mt-0.5 truncate text-[11px] text-emerald-700">
              {schedule.lastTriggerReason}
            </div>
          )}
        </div>
      </div>

      {/* Calendar & Time Configuration */}
      {showTimeControls && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs font-bold text-slate-900">
              7 Günlük Üretim Takvimi &amp; Saat Seçimi
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => applyRelativeMinutes(0)}
                className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50 whitespace-nowrap"
              >
                Şimdi ({formatTimeHmLocal(now)})
              </button>
              <button
                type="button"
                onClick={() => applyRelativeMinutes(15)}
                className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50 whitespace-nowrap"
              >
                +15 dk
              </button>
              <button
                type="button"
                onClick={() => applyFixedHour('02:00')}
                className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50 whitespace-nowrap"
              >
                02:00 Gece
              </button>
              <button
                type="button"
                onClick={() => applyFixedHour('06:00')}
                className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50 whitespace-nowrap"
              >
                06:00 Sabah
              </button>
            </div>
          </div>

          {/* 7-Day Interactive Calendar Strip */}
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {calendarDays.map((day) => (
              <button
                key={day.isoDate}
                type="button"
                aria-pressed={day.isSelected}
                aria-label={`${day.dayNumber} ${day.monthShort} ${day.weekdayShort}`}
                onClick={() =>
                  updateSchedule({
                    scheduledDate: day.isoDate,
                    lastTriggeredAt: null,
                  })
                }
                className={`min-w-0 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                  day.isSelected
                    ? 'border-blue-600 bg-blue-50/70 text-blue-900'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>{day.weekdayShort}</span>
                  {day.isToday && (
                    <span className="font-semibold text-blue-600">Bugün</span>
                  )}
                </div>
                <div className="mt-1 font-mono text-sm font-bold text-slate-900 tabular-nums">
                  {day.dayNumber} {day.monthShort}
                </div>
                <div className="mt-1 text-[10px] font-medium text-slate-500 tabular-nums">
                  {day.hasScheduledRun ? schedule.scheduledTime : 'Plan yok'}
                </div>
              </button>
            ))}
          </div>

          {/* Date, Time, and Recurrence Inputs */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 min-w-0">
              <label
                htmlFor="batch-schedule-date"
                className="block text-xs font-medium text-slate-700"
              >
                Başlangıç Tarihi
              </label>
              <input
                id="batch-schedule-date"
                type="date"
                value={schedule.scheduledDate}
                onChange={(e) =>
                  updateSchedule({
                    scheduledDate: e.target.value,
                    lastTriggeredAt: null,
                  })
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5 min-w-0">
              <label
                htmlFor="batch-schedule-time"
                className="block text-xs font-medium text-slate-700"
              >
                Başlangıç Saati
              </label>
              <input
                id="batch-schedule-time"
                type="time"
                value={schedule.scheduledTime}
                onChange={(e) =>
                  updateSchedule({
                    scheduledTime: e.target.value,
                    lastTriggeredAt: null,
                  })
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5 min-w-0">
              <label
                htmlFor="batch-schedule-recurrence"
                className="block text-xs font-medium text-slate-700"
              >
                Tekrar Sıklığı
              </label>
              <select
                id="batch-schedule-recurrence"
                value={schedule.recurrence}
                onChange={(e) =>
                  updateSchedule({
                    recurrence: e.target.value as BatchScheduleRecurrence,
                    lastTriggeredAt: null,
                  })
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                {RECURRENCE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* System Load Trigger Configuration */}
      {showLoadControls && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <Cpu className="h-3.5 w-3.5 text-blue-600 shrink-0" aria-hidden="true" />
              <span>Sistem Yükü Eşiği &amp; Yük Kaynağı</span>
            </div>

            <div
              role="group"
              aria-label="Sistem yükü veri kaynağı"
              className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 self-start sm:self-auto"
            >
              <button
                type="button"
                aria-pressed={schedule.loadSource === 'telemetry'}
                onClick={() => updateSchedule({ loadSource: 'telemetry' })}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${
                  schedule.loadSource === 'telemetry'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Canlı Telemetri
              </button>
              <button
                type="button"
                aria-pressed={schedule.loadSource === 'simulated'}
                onClick={() => updateSchedule({ loadSource: 'simulated' })}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${
                  schedule.loadSource === 'simulated'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Test Yükü Simülasyonu
              </button>
            </div>
          </div>

          {/* Current Load Meters */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700">Anlık GPU VRAM Yükü</span>
                <span className="font-mono font-bold text-slate-900 tabular-nums">
                  {evaluation.loadMetrics.vramLoadPct !== null
                    ? `%${evaluation.loadMetrics.vramLoadPct}`
                    : 'Bekleniyor'}
                  {' · '}
                  <span
                    className={
                      evaluation.loadMetrics.vramLoadPct !== null &&
                      evaluation.loadMetrics.vramLoadPct <= schedule.maxVramLoadPct
                        ? 'text-emerald-700'
                        : 'text-amber-700'
                    }
                  >
                    Eşik ≤ %{schedule.maxVramLoadPct}
                  </span>
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full transition-all duration-200 ${
                    evaluation.loadMetrics.vramLoadPct !== null &&
                    evaluation.loadMetrics.vramLoadPct <= schedule.maxVramLoadPct
                      ? 'bg-emerald-600'
                      : 'bg-amber-500'
                  }`}
                  style={{ width: `${evaluation.loadMetrics.vramLoadPct ?? 0}%` }}
                />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700">Anlık Sistem RAM Yükü</span>
                <span className="font-mono font-bold text-slate-900 tabular-nums">
                  {evaluation.loadMetrics.ramLoadPct !== null
                    ? `%${evaluation.loadMetrics.ramLoadPct}`
                    : 'Bekleniyor'}
                  {' · '}
                  <span
                    className={
                      evaluation.loadMetrics.ramLoadPct !== null &&
                      evaluation.loadMetrics.ramLoadPct <= schedule.maxRamLoadPct
                        ? 'text-emerald-700'
                        : 'text-amber-700'
                    }
                  >
                    Eşik ≤ %{schedule.maxRamLoadPct}
                  </span>
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full transition-all duration-200 ${
                    evaluation.loadMetrics.ramLoadPct !== null &&
                    evaluation.loadMetrics.ramLoadPct <= schedule.maxRamLoadPct
                      ? 'bg-emerald-600'
                      : 'bg-amber-500'
                  }`}
                  style={{ width: `${evaluation.loadMetrics.ramLoadPct ?? 0}%` }}
                />
              </div>
            </div>
          </div>

          {/* Threshold Sliders */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label
                  htmlFor="max-vram-threshold"
                  className="font-medium text-slate-700"
                >
                  Maksimum VRAM Eşiği
                </label>
                <span className="font-mono font-bold text-slate-900 tabular-nums">
                  %{schedule.maxVramLoadPct}
                </span>
              </div>
              <input
                id="max-vram-threshold"
                type="range"
                min={10}
                max={90}
                step={5}
                value={schedule.maxVramLoadPct}
                onChange={(e) =>
                  updateSchedule({ maxVramLoadPct: Number(e.target.value) })
                }
                className="w-full accent-blue-600"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label
                  htmlFor="max-ram-threshold"
                  className="font-medium text-slate-700"
                >
                  Maksimum RAM Eşiği
                </label>
                <span className="font-mono font-bold text-slate-900 tabular-nums">
                  %{schedule.maxRamLoadPct}
                </span>
              </div>
              <input
                id="max-ram-threshold"
                type="range"
                min={15}
                max={95}
                step={5}
                value={schedule.maxRamLoadPct}
                onChange={(e) =>
                  updateSchedule({ maxRamLoadPct: Number(e.target.value) })
                }
                className="w-full accent-blue-600"
              />
            </div>

            {schedule.loadSource === 'simulated' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label
                    htmlFor="simulated-system-load"
                    className="font-medium text-slate-700"
                  >
                    Test Sistem Yükü
                  </label>
                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                    %{schedule.simulatedLoadPct}
                  </span>
                </div>
                <input
                  id="simulated-system-load"
                  type="range"
                  min={5}
                  max={95}
                  step={5}
                  value={schedule.simulatedLoadPct}
                  onChange={(e) =>
                    updateSchedule({ simulatedLoadPct: Number(e.target.value) })
                  }
                  className="w-full accent-blue-600"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
