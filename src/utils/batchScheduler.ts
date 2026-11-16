import {
  BatchQueueItem,
  BatchScheduleConfig,
  BatchScheduleRecurrence,
  TelemetrySnapshot,
} from '../types/automation';

export interface SystemLoadMetrics {
  source: 'telemetry' | 'simulated';
  hasLiveTelemetry: boolean;
  vramLoadPct: number | null;
  ramLoadPct: number | null;
  combinedLoadPct: number | null;
  loadSatisfied: boolean;
}

export interface BatchScheduleEvaluation {
  queuedCount: number;
  activeCount: number;
  timeDue: boolean;
  loadDue: boolean;
  shouldTrigger: boolean;
  loadMetrics: SystemLoadMetrics;
  nextRunAt: Date | null;
  countdownSec: number | null;
  countdownLabel: string;
  statusHeadline: string;
  triggerReason: string;
}

export interface CalendarDaySlot {
  isoDate: string;
  dayNumber: string;
  weekdayShort: string;
  monthShort: string;
  isToday: boolean;
  isSelected: boolean;
  hasScheduledRun: boolean;
}

const WEEKDAY_TR = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const MONTH_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

const TRIGGER_WINDOW_MS = 5 * 60 * 1000;
const COOLDOWN_MS = 60 * 1000;

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function formatDateIsoLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatTimeHmLocal(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function parseLocalDateTime(isoDate: string, timeHm: string): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeHm.trim());
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]) - 1;
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (month < 0 || month > 11 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return null;
  }
  const dt = new Date(year, month, day, hour, minute, 0, 0);
  if (
    dt.getFullYear() !== year ||
    dt.getMonth() !== month ||
    dt.getDate() !== day
  ) {
    return null;
  }
  return dt;
}

function matchesRecurrenceDay(date: Date, recurrence: BatchScheduleRecurrence): boolean {
  if (recurrence === 'weekdays') {
    const day = date.getDay();
    return day >= 1 && day <= 5;
  }
  return true;
}

export function computeSystemLoadMetrics(
  schedule: BatchScheduleConfig,
  telemetry?: TelemetrySnapshot
): SystemLoadMetrics {
  if (schedule.loadSource === 'telemetry') {
    const hasVram =
      telemetry !== undefined &&
      telemetry.vramTotalGb !== null &&
      telemetry.vramTotalGb > 0 &&
      telemetry.vramUsedGb !== null;
    const hasRam =
      telemetry !== undefined &&
      telemetry.systemRamTotalGb !== null &&
      telemetry.systemRamTotalGb > 0 &&
      telemetry.systemRamUsedGb !== null;

    if (!hasVram && !hasRam) {
      return {
        source: 'telemetry',
        hasLiveTelemetry: false,
        vramLoadPct: null,
        ramLoadPct: null,
        combinedLoadPct: null,
        loadSatisfied: false,
      };
    }

    const vramLoadPct = hasVram
      ? clampPct(((telemetry!.vramUsedGb ?? 0) / telemetry!.vramTotalGb!) * 100)
      : 0;
    const ramLoadPct = hasRam
      ? clampPct(((telemetry!.systemRamUsedGb ?? 0) / telemetry!.systemRamTotalGb!) * 100)
      : 0;
    const combinedLoadPct = Math.round((vramLoadPct + ramLoadPct) / 2);

    return {
      source: 'telemetry',
      hasLiveTelemetry: true,
      vramLoadPct,
      ramLoadPct,
      combinedLoadPct,
      loadSatisfied:
        vramLoadPct <= schedule.maxVramLoadPct && ramLoadPct <= schedule.maxRamLoadPct,
    };
  }

  const vramLoadPct = clampPct(schedule.simulatedLoadPct);
  const ramLoadPct = clampPct(Math.round(schedule.simulatedLoadPct * 0.85));
  const combinedLoadPct = Math.round((vramLoadPct + ramLoadPct) / 2);

  return {
    source: 'simulated',
    hasLiveTelemetry: false,
    vramLoadPct,
    ramLoadPct,
    combinedLoadPct,
    loadSatisfied:
      vramLoadPct <= schedule.maxVramLoadPct && ramLoadPct <= schedule.maxRamLoadPct,
  };
}

export function computeNextScheduledOccurrence(
  schedule: BatchScheduleConfig,
  now: Date
): { nextRunAt: Date | null; timeDue: boolean } {
  const baseTarget = parseLocalDateTime(schedule.scheduledDate, schedule.scheduledTime);
  if (!baseTarget) {
    return { nextRunAt: null, timeDue: false };
  }

  const nowMs = now.getTime();

  if (schedule.recurrence === 'once') {
    const diff = nowMs - baseTarget.getTime();
    const timeDue = diff >= 0 && diff <= TRIGGER_WINDOW_MS;
    return {
      nextRunAt: baseTarget.getTime() >= nowMs ? baseTarget : timeDue ? baseTarget : null,
      timeDue,
    };
  }

  // Daily or weekdays recurrence: check today's slot and future occurrences
  const [, hourStr, minStr] = /^(\d{2}):(\d{2})$/.exec(schedule.scheduledTime) ?? ['', '00', '00'];
  const targetHour = Number(hourStr);
  const targetMin = Number(minStr);

  const cursor = new Date(
    Math.max(
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), targetHour, targetMin, 0, 0).getTime(),
      baseTarget.getTime()
    )
  );
  cursor.setHours(targetHour, targetMin, 0, 0);

  for (let i = 0; i < 14; i++) {
    const candidate = new Date(cursor);
    candidate.setDate(cursor.getDate() + i);
    if (candidate.getTime() < baseTarget.getTime()) continue;
    if (!matchesRecurrenceDay(candidate, schedule.recurrence)) continue;

    const diff = nowMs - candidate.getTime();
    if (diff >= 0 && diff <= TRIGGER_WINDOW_MS) {
      return { nextRunAt: candidate, timeDue: true };
    }
    if (candidate.getTime() >= nowMs) {
      return { nextRunAt: candidate, timeDue: false };
    }
  }

  return { nextRunAt: null, timeDue: false };
}

export function formatCountdownDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const days = Math.floor(safe / 86400);
  const hrs = Math.floor((safe % 86400) / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const hhmmss = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return days > 0 ? `${days}g ${hhmmss}` : hhmmss;
}

export function evaluateBatchSchedule(
  schedule: BatchScheduleConfig,
  queue: BatchQueueItem[],
  now: Date,
  telemetry?: TelemetrySnapshot
): BatchScheduleEvaluation {
  const queuedCount = queue.filter((j) => j.status === 'kuyrukta').length;
  const activeCount = queue.filter(
    (j) => j.status === 'hazirlaniyor' || j.status === 'isleniyor'
  ).length;
  const loadMetrics = computeSystemLoadMetrics(schedule, telemetry);
  const { nextRunAt, timeDue } = computeNextScheduledOccurrence(schedule, now);

  const countdownSec =
    nextRunAt !== null
      ? Math.max(0, Math.ceil((nextRunAt.getTime() - now.getTime()) / 1000))
      : null;

  const loadDue = loadMetrics.loadSatisfied;

  let conditionMet = false;
  if (schedule.mode === 'time') {
    conditionMet = timeDue;
  } else if (schedule.mode === 'low_load') {
    conditionMet = loadDue;
  } else {
    conditionMet = timeDue && loadDue;
  }

  const lastTriggerMs = schedule.lastTriggeredAt
    ? Date.parse(schedule.lastTriggeredAt)
    : NaN;
  const inCooldown =
    Number.isFinite(lastTriggerMs) && now.getTime() - lastTriggerMs < COOLDOWN_MS;

  // For time-based schedules, also avoid firing twice inside the exact same trigger window
  const alreadyTriggeredForCurrentSlot =
    schedule.mode !== 'low_load' &&
    nextRunAt !== null &&
    Number.isFinite(lastTriggerMs) &&
    lastTriggerMs >= nextRunAt.getTime() &&
    now.getTime() - nextRunAt.getTime() <= TRIGGER_WINDOW_MS;

  const shouldTrigger =
    schedule.enabled &&
    queuedCount > 0 &&
    conditionMet &&
    !inCooldown &&
    !alreadyTriggeredForCurrentSlot;

  let countdownLabel = '—';
  if (schedule.mode === 'low_load') {
    if (!loadMetrics.hasLiveTelemetry && loadMetrics.source === 'telemetry') {
      countdownLabel = 'Telemetri bekleniyor';
    } else if (loadDue) {
      countdownLabel = 'Yük eşiği uygun';
    } else {
      countdownLabel = `VRAM ≤ %${schedule.maxVramLoadPct} · RAM ≤ %${schedule.maxRamLoadPct}`;
    }
  } else if (timeDue) {
    countdownLabel = 'Başlatma penceresinde';
  } else if (countdownSec !== null) {
    countdownLabel = formatCountdownDuration(countdownSec);
  } else {
    countdownLabel = 'Geçmiş tarih';
  }

  let statusHeadline = 'Zamanlayıcı pasif';
  if (schedule.enabled) {
    if (queuedCount === 0) {
      statusHeadline = 'Kuyrukta bekleyen iş yok';
    } else if (shouldTrigger) {
      statusHeadline = 'Tetikleme koşulu sağlandı — kuyruktaki iş başlatılıyor';
    } else if (inCooldown) {
      statusHeadline = 'Son tetikleme tamamlandı — kuyruktaki iş sıraya alındı';
    } else if (schedule.mode === 'time') {
      statusHeadline = nextRunAt
        ? `${formatDateIsoLocal(nextRunAt)} · ${schedule.scheduledTime} bekleniyor`
        : 'Yeni bir gelecek saat seçin';
    } else if (schedule.mode === 'low_load') {
      statusHeadline =
        !loadMetrics.hasLiveTelemetry && loadMetrics.source === 'telemetry'
          ? 'Colab canlı telemetri verisi bekleniyor'
          : `Yük eşik altına indiğinde otomatik başlayacak (VRAM ≤ %${schedule.maxVramLoadPct}, RAM ≤ %${schedule.maxRamLoadPct})`;
    } else {
      if (!timeDue) {
        statusHeadline = nextRunAt
          ? `${formatDateIsoLocal(nextRunAt)} · ${schedule.scheduledTime} + düşük yük bekleniyor`
          : 'Yeni bir gelecek saat seçin';
      } else {
        statusHeadline = 'Saat geldi, sistem yükünün eşik altına düşmesi bekleniyor';
      }
    }
  }

  const triggerReason =
    schedule.mode === 'time'
      ? `Takvim saati (${schedule.scheduledDate} ${schedule.scheduledTime})`
      : schedule.mode === 'low_load'
        ? `Düşük sistem yükü (VRAM %${loadMetrics.vramLoadPct ?? 0} ≤ %${schedule.maxVramLoadPct}, RAM %${loadMetrics.ramLoadPct ?? 0} ≤ %${schedule.maxRamLoadPct})`
        : `Takvim + düşük yük (${schedule.scheduledTime} · VRAM %${loadMetrics.vramLoadPct ?? 0})`;

  return {
    queuedCount,
    activeCount,
    timeDue,
    loadDue,
    shouldTrigger,
    loadMetrics,
    nextRunAt,
    countdownSec,
    countdownLabel,
    statusHeadline,
    triggerReason,
  };
}

export function getCalendarWeekDays(
  schedule: BatchScheduleConfig,
  anchorDate: Date
): CalendarDaySlot[] {
  const todayIso = formatDateIsoLocal(anchorDate);
  const startBase = new Date(
    anchorDate.getFullYear(),
    anchorDate.getMonth(),
    anchorDate.getDate()
  );

  const slots: CalendarDaySlot[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(startBase);
    day.setDate(startBase.getDate() + i);
    const isoDate = formatDateIsoLocal(day);

    let hasScheduledRun = false;
    if (schedule.mode !== 'low_load') {
      if (schedule.recurrence === 'once') {
        hasScheduledRun = isoDate === schedule.scheduledDate;
      } else if (schedule.recurrence === 'daily') {
        hasScheduledRun = isoDate >= schedule.scheduledDate;
      } else {
        hasScheduledRun =
          isoDate >= schedule.scheduledDate &&
          matchesRecurrenceDay(day, 'weekdays');
      }
    }

    slots.push({
      isoDate,
      dayNumber: String(day.getDate()).padStart(2, '0'),
      weekdayShort: WEEKDAY_TR[day.getDay()],
      monthShort: MONTH_TR[day.getMonth()],
      isToday: isoDate === todayIso,
      isSelected: isoDate === schedule.scheduledDate,
      hasScheduledRun,
    });
  }
  return slots;
}

export function triggerQueuedBatchStart(queue: BatchQueueItem[]): {
  nextQueue: BatchQueueItem[];
  startedJob: BatchQueueItem | null;
} {
  const targetIndex = queue.findIndex((job) => job.status === 'kuyrukta');
  if (targetIndex === -1) {
    return { nextQueue: queue, startedJob: null };
  }

  const startedJob: BatchQueueItem = {
    ...queue[targetIndex],
    status: 'hazirlaniyor',
    startedAt:
      queue[targetIndex].startedAt ??
      new Date().toISOString().slice(0, 16).replace('T', ' '),
  };

  const nextQueue = queue.map((job, idx) =>
    idx === targetIndex ? startedJob : job
  );

  return { nextQueue, startedJob };
}
