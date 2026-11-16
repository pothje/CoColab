import { useState } from 'react';
import {
  Activity,
  Check,
  ChevronDown,
  Copy,
  Radio,
  RotateCcw,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { TelemetrySnapshot, TelemetryStage } from '../types/automation';

interface TelemetryBridgePanelProps {
  telemetry: TelemetrySnapshot;
  wsStatus: 'connecting' | 'connected' | 'disconnected';
  ingestToken: string;
  pingSending: boolean;
  onSendBridgePing: () => Promise<void>;
  onResetTelemetry: () => Promise<void>;
}

const STAGE_LABELS: Record<TelemetryStage, string> = {
  idle: 'Beklemede',
  preflight: 'Donanım Doğrulandı',
  downloading: 'Modeller İndiriliyor',
  injecting: 'Sahne Hazırlanıyor',
  rendering: 'Video Üretiliyor',
  saving_local: 'Bilgisayara Kaydediliyor',
  backing_up_drive: 'Drive’a Yedekleniyor',
  completed: 'Tamamlandı',
  aborted: 'Durduruldu',
};

export function TelemetryBridgePanel({
  telemetry,
  wsStatus,
  ingestToken,
  pingSending,
  onSendBridgePing,
  onResetTelemetry,
}: TelemetryBridgePanelProps) {
  const [copiedToken, setCopiedToken] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  async function handleCopyToken() {
    if (!ingestToken) return;
    try {
      await navigator.clipboard.writeText(ingestToken);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 1800);
    } catch {
      // Clipboard ignored
    }
  }

  const vramRatio =
    telemetry.vramUsedGb !== null && telemetry.vramTotalGb
      ? Math.min(100, Math.round((telemetry.vramUsedGb / telemetry.vramTotalGb) * 100))
      : 0;

  return (
    <section
      data-testid="live-telemetry-panel"
      className="rounded-2xl border border-white/[0.08] bg-[#141417] p-5 space-y-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium">
            {wsStatus === 'connected' ? (
              <span className="inline-flex items-center gap-1.5 text-[#30D158]">
                <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
                Canlı Bağlantı Aktif
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-amber-400">
                <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
                {wsStatus === 'connecting' ? 'Bağlanıyor...' : 'Yeniden Bağlanıyor...'}
              </span>
            )}
          </div>
          <h3 className="mt-0.5 text-sm font-semibold text-[#F5F5F7]">
            Canlı Telemetri Köprüsü
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onSendBridgePing}
            disabled={pingSending || !ingestToken}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#0A84FF] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:brightness-110 disabled:opacity-40 whitespace-nowrap"
          >
            <Radio className="h-3.5 w-3.5" aria-hidden="true" />
            {pingSending ? 'Gönderiliyor...' : 'Bağlantıyı Test Et'}
          </button>
          <button
            type="button"
            onClick={onResetTelemetry}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-[#1C1C20] px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/[0.08] whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Sıfırla
          </button>
        </div>
      </div>

      <div className="grid divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] bg-[#0E0E11] sm:grid-cols-2 lg:grid-cols-4 lg:divide-y-0 lg:divide-x">
        <div className="p-3.5">
          <div className="text-[11px] text-zinc-500">Aşama</div>
          <div
            data-testid="telemetry-stage-label"
            className={`mt-1 text-xs font-semibold ${
              telemetry.stage === 'aborted'
                ? 'text-[#FF453A]'
                : telemetry.stage === 'completed' || telemetry.stage === 'preflight'
                  ? 'text-[#30D158]'
                  : 'text-[#F5F5F7]'
            }`}
          >
            {STAGE_LABELS[telemetry.stage]}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-zinc-500">
            {telemetry.currentStepLabel}
          </div>
        </div>

        <div className="p-3.5">
          <div className="text-[11px] text-zinc-500">Ekran Kartı &amp; VRAM</div>
          <div className="mt-1 text-xs font-semibold text-[#F5F5F7] tabular-nums">
            {telemetry.gpuName
              ? `${telemetry.vramUsedGb ?? 0} / ${telemetry.vramTotalGb ?? 0} GB`
              : 'Oturum Bekleniyor'}
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-[#0A84FF] transition-all duration-200"
              style={{ width: `${vramRatio}%` }}
            />
          </div>
        </div>

        <div className="p-3.5">
          <div className="text-[11px] text-zinc-500">Sistem RAM &amp; Disk</div>
          <div className="mt-1 text-xs font-semibold text-[#F5F5F7] tabular-nums">
            {telemetry.systemRamTotalGb !== null
              ? `${telemetry.systemRamUsedGb ?? 0} / ${telemetry.systemRamTotalGb} GB`
              : '—'}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500 tabular-nums">
            {telemetry.diskFreeGb !== null ? `Boş: ${telemetry.diskFreeGb} GB` : 'Bekleniyor'}
          </div>
        </div>

        <div className="p-3.5">
          <div className="text-[11px] text-zinc-500">Oturum Anahtarı</div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="truncate font-mono text-[11px] text-zinc-300">
              {ingestToken ? `${ingestToken.slice(0, 12)}...` : 'Hazırlanıyor'}
            </span>
            <button
              type="button"
              onClick={handleCopyToken}
              disabled={!ingestToken}
              aria-label="Oturum anahtarını kopyala"
              className="rounded-lg border border-white/[0.08] bg-[#1C1C20] px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/[0.08] shrink-0"
            >
              {copiedToken ? (
                <Check className="h-3 w-3 text-[#30D158]" aria-hidden="true" />
              ) : (
                <Copy className="h-3 w-3" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-[#0E0E11]">
        <button
          type="button"
          onClick={() => setShowLogs((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-2.5 text-left text-xs font-medium text-zinc-300 hover:text-white"
        >
          <span className="inline-flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-[#0A84FF]" aria-hidden="true" />
            <span>Olay Geçmişi ({telemetry.logs.length})</span>
          </span>
          <ChevronDown
            className={`h-4 w-4 text-zinc-500 transition-transform ${showLogs ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>

        {showLogs && (
          <div className="border-t border-white/[0.06] px-4 py-3">
            {telemetry.logs.length === 0 ? (
              <p className="text-xs text-zinc-500">Henüz kayıt yok.</p>
            ) : (
              <div className="max-h-32 space-y-1 overflow-auto font-mono text-[11px]">
                {telemetry.logs.map((entry) => (
                  <div
                    key={entry.id}
                    className={
                      entry.level === 'error'
                        ? 'text-[#FF453A]'
                        : entry.level === 'success'
                          ? 'text-[#30D158]'
                          : entry.level === 'warn'
                            ? 'text-amber-400'
                            : 'text-zinc-300'
                    }
                  >
                    <span className="text-zinc-500">[{entry.timestamp}]</span> {entry.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
