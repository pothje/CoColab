import { useEffect, useMemo, useState } from 'react';
import { Calendar, Cpu, Play, RotateCcw } from 'lucide-react';
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

const MODE_OPTIONS: Array<{ id: BatchScheduleMode; label: string }> = [
  { id: 'time', label: 'Belirli Saat' },
  { id: 'low_load', label: 'Düşük Sistem Yükü' },
  { id: 'time_and_low_load', label: 'Saat + Düşük Yük' },
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

  return (
    <div
      data-testid="batch-schedule-section"
      className="space-y-4 rounded-xl border border-white/[0.06] bg-[#0E0E11] p-5"
    >
      {/* Header Row with Apple iOS Switch */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <Calendar className="h-4 w-4 text-[#0A84FF] shrink-0" aria-hidden="true" />
          <div>
            <div className="text-sm font-medium text-[#F5F5F7]">
              Zamanlanmış Başlatma
            </div>
            <p className="text-xs text-zinc-500">
              Belirlenen saatte veya sistem yükü düştüğünde otomatik başlatır.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            disabled={evaluation.queuedCount === 0}
            onClick={() => onTriggerNow('Manuel anlık tetikleme')}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-[#1C1C20] px-3.5 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/[0.08] disabled:opacity-40 whitespace-nowrap"
          >
            <Play className="h-3 w-3 text-[#0A84FF]" aria-hidden="true" />
            Şimdi Başlat
          </button>

          <button
            type="button"
            role="switch"
            aria-checked={schedule.enabled}
            aria-label={
              schedule.enabled ? 'Zamanlayıcı Aktif' : 'Zamanlayıcıyı Etkinleştir'
            }
            onClick={() => updateSchedule({ enabled: !schedule.enabled })}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#0A84FF]/60 ${
              schedule.enabled ? 'bg-[#30D158]' : 'bg-zinc-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                schedule.enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Mode Selector + Status Summary */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="group"
          aria-label="Zamanlama tetikleyici modu"
          className="inline-flex max-w-full overflow-x-auto rounded-lg bg-[#141417] p-1 border border-white/[0.06]"
        >
          {MODE_OPTIONS.map((opt) => {
            const active = schedule.mode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={active}
                onClick={() => updateSchedule({ mode: opt.id })}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white/[0.12] text-[#F5F5F7]'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span
            data-testid="scheduler-status-headline"
            className={`font-medium ${schedule.enabled ? 'text-[#0A84FF]' : 'text-zinc-400'}`}
          >
            {evaluation.statusHeadline}
          </span>
          <span aria-hidden="true" className="text-zinc-700">
            ·
          </span>
          <span
            data-testid="scheduler-countdown"
            className="font-medium text-[#F5F5F7] tabular-nums"
          >
            {evaluation.countdownLabel}
          </span>
          <span aria-hidden="true" className="text-zinc-700">
            ·
          </span>
          <span
            data-testid="scheduler-last-trigger"
            className="text-zinc-400 tabular-nums"
          >
            {schedule.lastTriggeredAt
              ? `Son: ${new Date(schedule.lastTriggeredAt).toLocaleTimeString('tr-TR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}`
              : 'Henüz tetiklenmedi'}
          </span>
          {schedule.lastTriggeredAt && (
            <button
              type="button"
              onClick={() =>
                updateSchedule({ lastTriggeredAt: null, lastTriggerReason: null })
              }
              aria-label="Son tetikleme kaydını sıfırla"
              className="inline-flex items-center gap-1 text-zinc-400 hover:text-white"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Calendar & Time Controls */}
      {showTimeControls && (
        <div className="space-y-3 border-t border-white/[0.06] pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-zinc-400">Takvim &amp; Saat</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => applyRelativeMinutes(0)}
                className="rounded-full border border-white/[0.08] bg-[#141417] px-2.5 py-1 text-[11px] font-medium text-zinc-300 hover:bg-white/[0.08] whitespace-nowrap"
              >
                Şimdi ({formatTimeHmLocal(now)})
              </button>
              <button
                type="button"
                onClick={() => applyRelativeMinutes(15)}
                className="rounded-full border border-white/[0.08] bg-[#141417] px-2.5 py-1 text-[11px] font-medium text-zinc-300 hover:bg-white/[0.08] whitespace-nowrap"
              >
                +15 dk
              </button>
              <button
                type="button"
                onClick={() => applyFixedHour('02:00')}
                className="rounded-full border border-white/[0.08] bg-[#141417] px-2.5 py-1 text-[11px] font-medium text-zinc-300 hover:bg-white/[0.08] whitespace-nowrap"
              >
                02:00 Gece
              </button>
            </div>
          </div>

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
                className={`min-w-0 rounded-xl border px-2.5 py-2 text-left transition-colors ${
                  day.isSelected
                    ? 'border-[#0A84FF] bg-[#0A84FF]/15 text-white'
                    : 'border-white/[0.06] bg-[#141417] text-zinc-300 hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>{day.weekdayShort}</span>
                  {day.isToday && <span className="text-[#0A84FF] font-medium">Bugün</span>}
                </div>
                <div className="mt-1 text-xs font-semibold text-[#F5F5F7] tabular-nums">
                  {day.dayNumber} {day.monthShort}
                </div>
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1 min-w-0">
              <label
                htmlFor="batch-schedule-date"
                className="block text-[11px] text-zinc-400"
              >
                Tarih
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
                className="w-full rounded-xl border border-white/[0.08] bg-[#141417] px-3 py-2 text-xs text-[#F5F5F7] focus:border-[#0A84FF] focus:outline-none"
              />
            </div>

            <div className="space-y-1 min-w-0">
              <label
                htmlFor="batch-schedule-time"
                className="block text-[11px] text-zinc-400"
              >
                Saat
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
                className="w-full rounded-xl border border-white/[0.08] bg-[#141417] px-3 py-2 text-xs text-[#F5F5F7] focus:border-[#0A84FF] focus:outline-none"
              />
            </div>

            <div className="space-y-1 min-w-0">
              <label
                htmlFor="batch-schedule-recurrence"
                className="block text-[11px] text-zinc-400"
              >
                Tekrar
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
                className="w-full rounded-xl border border-white/[0.08] bg-[#141417] px-3 py-2 text-xs font-medium text-[#F5F5F7] focus:border-[#0A84FF] focus:outline-none"
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

      {/* System Load Trigger Controls */}
      {showLoadControls && (
        <div className="space-y-3 border-t border-white/[0.06] pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-300">
              <Cpu className="h-3.5 w-3.5 text-[#0A84FF]" aria-hidden="true" />
              Sistem Yükü Eşiği
            </span>

            <div
              role="group"
              aria-label="Sistem yükü veri kaynağı"
              className="inline-flex rounded-lg border border-white/[0.06] bg-[#141417] p-0.5"
            >
              <button
                type="button"
                aria-pressed={schedule.loadSource === 'telemetry'}
                onClick={() => updateSchedule({ loadSource: 'telemetry' })}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium whitespace-nowrap ${
                  schedule.loadSource === 'telemetry'
                    ? 'bg-white/[0.12] text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Canlı Telemetri
              </button>
              <button
                type="button"
                aria-pressed={schedule.loadSource === 'simulated'}
                onClick={() => updateSchedule({ loadSource: 'simulated' })}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium whitespace-nowrap ${
                  schedule.loadSource === 'simulated'
                    ? 'bg-white/[0.12] text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Simülasyon
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="max-vram-threshold" className="text-zinc-400">
                  VRAM Eşiği (Anlık:{' '}
                  {evaluation.loadMetrics.vramLoadPct !== null
                    ? `%${evaluation.loadMetrics.vramLoadPct}`
                    : '—'}
                  )
                </label>
                <span className="font-medium text-[#F5F5F7] tabular-nums">
                  ≤ %{schedule.maxVramLoadPct}
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
                className="w-full accent-[#0A84FF]"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="max-ram-threshold" className="text-zinc-400">
                  RAM Eşiği (Anlık:{' '}
                  {evaluation.loadMetrics.ramLoadPct !== null
                    ? `%${evaluation.loadMetrics.ramLoadPct}`
                    : '—'}
                  )
                </label>
                <span className="font-medium text-[#F5F5F7] tabular-nums">
                  ≤ %{schedule.maxRamLoadPct}
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
                className="w-full accent-[#0A84FF]"
              />
            </div>

            {schedule.loadSource === 'simulated' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="simulated-system-load" className="text-zinc-400">
                    Test Yükü
                  </label>
                  <span className="font-medium text-[#F5F5F7] tabular-nums">
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
                  className="w-full accent-[#0A84FF]"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
