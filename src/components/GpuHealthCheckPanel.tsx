import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Cpu,
  History,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Wifi,
} from 'lucide-react';
import { ColabProject, TelemetrySnapshot } from '../types/automation';
import type {
  GpuHealthCheckResult,
  GpuHealthHistoryEntry,
} from '../utils/gpuHealthCheck';

export interface ConnectPresetOption {
  id: 'a100-80' | 'a100-40' | 'l4-24';
  label: string;
  gpuName: string;
  vramTotalGb: number;
  vramUsedGb: number;
  systemRamTotalGb: number;
  systemRamUsedGb: number;
  diskFreeGb: number;
}

export const HEALTH_CHECK_CONNECT_PRESETS: ConnectPresetOption[] = [
  {
    id: 'a100-80',
    label: 'A100 80GB Bağlan',
    gpuName: 'NVIDIA A100-SXM4-80GB',
    vramTotalGb: 80,
    vramUsedGb: 2.4,
    systemRamTotalGb: 167,
    systemRamUsedGb: 18.6,
    diskFreeGb: 231.5,
  },
  {
    id: 'a100-40',
    label: 'A100 40GB Bağlan',
    gpuName: 'NVIDIA A100-SXM4-40GB',
    vramTotalGb: 40,
    vramUsedGb: 2.1,
    systemRamTotalGb: 83.5,
    systemRamUsedGb: 16.2,
    diskFreeGb: 166,
  },
  {
    id: 'l4-24',
    label: 'L4 24GB Bağlan',
    gpuName: 'NVIDIA L4',
    vramTotalGb: 24,
    vramUsedGb: 1.8,
    systemRamTotalGb: 53,
    systemRamUsedGb: 12.4,
    diskFreeGb: 112,
  },
];

interface GpuHealthCheckPanelProps {
  project: ColabProject;
  projects: ColabProject[];
  telemetry: TelemetrySnapshot;
  wsStatus: 'connecting' | 'connected' | 'disconnected';
  ingestToken: string;
  pingSending: boolean;
  healthResult: GpuHealthCheckResult;
  lastCheckedAt: string | null;
  history: GpuHealthHistoryEntry[];
  onRunManualCheck: () => void;
  onSimulateRuntimeConnect: (preset: ConnectPresetOption) => Promise<void>;
  onSelectProject: (projectId: string) => void;
  onRelaxProjectPolicyTo40Gb: (projectId: string) => void;
  onResetTelemetry: () => Promise<void>;
}

const TRIGGER_LABELS = {
  auto_connect: 'Otomatik',
  project_switch: 'Proje Değişimi',
  manual: 'Manuel',
} as const;

export function GpuHealthCheckPanel({
  project,
  projects,
  telemetry,
  wsStatus,
  ingestToken,
  pingSending,
  healthResult,
  lastCheckedAt,
  history,
  onRunManualCheck,
  onSimulateRuntimeConnect,
  onSelectProject,
  onRelaxProjectPolicyTo40Gb,
  onResetTelemetry,
}: GpuHealthCheckPanelProps) {
  const [showHistory, setShowHistory] = useState(false);

  const isMismatchOrCritical =
    healthResult.status === 'mismatch' || healthResult.status === 'critical';

  return (
    <section
      aria-labelledby="gpu-health-check-heading"
      data-testid="gpu-health-check-panel"
      className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#141417]"
    >
      {/* Clean Header Row */}
      <div className="flex flex-col gap-3 border-b border-white/[0.06] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="inline-flex items-center gap-1.5 font-medium text-[#0A84FF]">
              <Cpu className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>GPU Sağlık Kontrolü</span>
            </span>
            <span aria-hidden="true" className="text-zinc-600">
              ·
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Wifi
                className={`h-3 w-3 ${
                  wsStatus === 'connected' ? 'text-[#30D158]' : 'text-zinc-500'
                }`}
                aria-hidden="true"
              />
              <span>{wsStatus === 'connected' ? 'Otomatik hazır' : 'Bekleniyor'}</span>
            </span>
            {lastCheckedAt && (
              <>
                <span aria-hidden="true" className="text-zinc-600">
                  ·
                </span>
                <span className="tabular-nums text-zinc-500">{lastCheckedAt}</span>
              </>
            )}
          </div>
          <h2
            id="gpu-health-check-heading"
            className="text-base font-semibold tracking-tight text-[#F5F5F7]"
          >
            Donanım &amp; VRAM Doğrulaması
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <label htmlFor="health-check-project-select" className="sr-only">
            Proje Katmanı
          </label>
          <select
            id="health-check-project-select"
            value={project.id}
            onChange={(e) => onSelectProject(e.target.value)}
            className="rounded-xl border border-white/[0.08] bg-[#0E0E11] px-3 py-1.5 text-xs font-medium text-[#F5F5F7] focus:border-[#0A84FF] focus:outline-none"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.targetGpuPolicy === '80GB_ONLY' ? '80GB' : '40/80GB'})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onRunManualCheck}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-[#1C1C20] px-3.5 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/[0.08] whitespace-nowrap shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Şimdi Doğrula</span>
          </button>
        </div>
      </div>

      {/* Immediate Mismatch / Critical Alert Banner */}
      {healthResult.shouldAlert && (
        <div
          role="alert"
          data-testid="gpu-health-alert"
          className="flex flex-col gap-3 border-b border-[#FF453A]/30 bg-[#FF453A]/[0.1] px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            {healthResult.status === 'critical' ? (
              <ShieldAlert className="mt-0.5 h-5 w-5 text-[#FF453A] shrink-0" aria-hidden="true" />
            ) : (
              <AlertTriangle className="mt-0.5 h-5 w-5 text-[#FF453A] shrink-0" aria-hidden="true" />
            )}
            <div className="space-y-0.5">
              <div className="text-sm font-semibold text-rose-100">{healthResult.headline}</div>
              <p className="text-xs leading-relaxed text-rose-200/85">{healthResult.detail}</p>
              {healthResult.recommendedAction && (
                <p className="text-xs font-medium text-rose-200">
                  {healthResult.recommendedAction}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {healthResult.canRelaxPolicyTo40Gb && (
              <button
                type="button"
                onClick={() => onRelaxProjectPolicyTo40Gb(project.id)}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[#141417]/80 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/15 whitespace-nowrap"
              >
                40GB / 80GB Uyumlu Moda Al
              </button>
            )}
            <button
              type="button"
              onClick={onResetTelemetry}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#FF453A] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:brightness-110 whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Oturumu Kes</span>
            </button>
          </div>
        </div>
      )}

      {/* Calm Healthy Strip */}
      {healthResult.status === 'healthy' && (
        <div
          data-testid="gpu-health-healthy-banner"
          className="flex items-center gap-3 border-b border-[#30D158]/25 bg-[#30D158]/[0.08] px-6 py-3"
        >
          <ShieldCheck className="h-4 w-4 text-[#30D158] shrink-0" aria-hidden="true" />
          <div className="min-w-0 text-xs text-emerald-100">
            <strong className="font-semibold">{healthResult.headline}</strong>
            <span className="mx-1.5 text-emerald-400/60">·</span>
            <span className="text-emerald-200/80">{healthResult.detail}</span>
          </div>
        </div>
      )}

      {/* 3-Metric Comparison Grid */}
      <div className="grid grid-cols-1 divide-y divide-white/[0.06] bg-[#0E0E11] sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
        <div className="px-6 py-4">
          <div className="text-xs text-zinc-500">Tahsis Edilen VRAM</div>
          <div
            data-testid="gpu-health-allocated-vram"
            className={`mt-1 text-base font-semibold tabular-nums ${
              isMismatchOrCritical
                ? 'text-[#FF453A]'
                : healthResult.status === 'healthy'
                  ? 'text-[#30D158]'
                  : 'text-[#F5F5F7]'
            }`}
          >
            {healthResult.allocatedLabel}
          </div>
          <div className="mt-0.5 truncate text-xs text-zinc-500">
            {telemetry.gpuName ?? 'Runtime bekleniyor'}
          </div>
        </div>

        <div className="px-6 py-4">
          <div className="text-xs text-zinc-500">Proje Gereksinimi</div>
          <div
            data-testid="gpu-health-required-tier"
            className="mt-1 text-base font-semibold text-[#F5F5F7] tabular-nums"
          >
            {healthResult.requiredLabel}
          </div>
          <div className="mt-0.5 truncate text-xs text-zinc-500">{project.name}</div>
        </div>

        <div className="px-6 py-4">
          <div className="text-xs text-zinc-500">Durum</div>
          <div
            data-testid="gpu-health-status-label"
            className={`mt-1 inline-flex items-center gap-1.5 text-base font-semibold ${
              healthResult.status === 'healthy'
                ? 'text-[#30D158]'
                : isMismatchOrCritical
                  ? 'text-[#FF453A]'
                  : 'text-zinc-300'
            }`}
          >
            {healthResult.status === 'healthy' && (
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            {isMismatchOrCritical && (
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span>
              {healthResult.status === 'healthy'
                ? 'Uyumlu'
                : healthResult.status === 'mismatch'
                  ? 'Katman Uyumsuz'
                  : healthResult.status === 'critical'
                    ? 'Kritik Hata'
                    : 'Bekleniyor'}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-zinc-500 tabular-nums">
            {healthResult.systemRamTotalGb !== null
              ? `Sistem RAM: ${healthResult.systemRamTotalGb} GB`
              : 'Yüksek RAM koruması aktif'}
          </div>
        </div>
      </div>

      {/* Quiet Footer: Simulation Presets + Collapsible History */}
      <div className="flex flex-col gap-3 border-t border-white/[0.06] bg-[#141417] px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-zinc-500">Bağlantı Testi:</span>
          {HEALTH_CHECK_CONNECT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={pingSending || !ingestToken}
              onClick={() => onSimulateRuntimeConnect(preset)}
              className="rounded-full border border-white/[0.08] bg-[#1C1C20] px-3 py-1 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/[0.1] hover:text-white disabled:opacity-40 whitespace-nowrap"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {history.length > 0 && (
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-zinc-400 transition-colors hover:text-white sm:self-auto"
          >
            <History className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Kayıtlar ({history.length})</span>
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${showHistory ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
        )}
      </div>

      {showHistory && history.length > 0 && (
        <div className="border-t border-white/[0.06] bg-[#0E0E11] px-6 py-3 space-y-1.5 text-xs">
          {history.slice(0, 4).map((entry) => (
            <div
              key={entry.id}
              className="flex flex-wrap items-center justify-between gap-2 text-zinc-400"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="tabular-nums text-zinc-500">{entry.checkedAt}</span>
                <span
                  className={`font-medium ${
                    entry.status === 'healthy'
                      ? 'text-[#30D158]'
                      : entry.status === 'pending'
                        ? 'text-zinc-400'
                        : 'text-[#FF453A]'
                  }`}
                >
                  {entry.status === 'healthy' ? 'Uyumlu' : 'Uyarı'}
                </span>
                <span className="truncate text-zinc-300">{entry.headline}</span>
              </div>
              <span className="text-zinc-500 shrink-0">{TRIGGER_LABELS[entry.trigger]}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
