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
  injecting: 'Sahne Dosyaları Hazırlanıyor',
  rendering: 'Video Üretiliyor',
  saving_local: 'Bilgisayara Kaydediliyor',
  backing_up_drive: 'Google Drive’a Yedekleniyor',
  completed: 'Tüm Üretim Tamamlandı',
  aborted: 'Güvenlik Nedeniyle Durduruldu',
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
      className="rounded-xl border border-slate-200 bg-white p-6 space-y-5"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold">
            {wsStatus === 'connected' ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-700">
                <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
                Canlı Bağlantı Aktif
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-amber-700">
                <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
                {wsStatus === 'connecting' ? 'Bağlanıyor...' : 'Yeniden Bağlanıyor...'}
              </span>
            )}
          </div>
          <h2 className="mt-1 text-base font-bold text-slate-900">
            Canlı Üretim &amp; Donanım Takibi
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Bulut oturumu çalışırken ekran kartı kullanımı, sistem belleği ve hangi sahnenin
            üretildiği burada anlık olarak görünür.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onSendBridgePing}
            disabled={pingSending || !ingestToken}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
          >
            <Radio className="h-3.5 w-3.5" aria-hidden="true" />
            {pingSending ? 'Gönderiliyor...' : 'Bağlantıyı Test Et'}
          </button>
          <button
            type="button"
            onClick={onResetTelemetry}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Sıfırla
          </button>
        </div>
      </div>

      {/* Clean light instrument strip */}
      <div className="grid divide-y divide-slate-200 rounded-lg border border-slate-200 bg-slate-50 sm:grid-cols-2 lg:grid-cols-5 lg:divide-y-0 lg:divide-x">
        <div className="p-3.5">
          <div className="text-[11px] font-medium text-slate-500">Aşama</div>
          <div
            data-testid="telemetry-stage-label"
            className={`mt-1 text-xs font-bold ${
              telemetry.stage === 'aborted'
                ? 'text-rose-700'
                : telemetry.stage === 'completed' || telemetry.stage === 'preflight'
                  ? 'text-emerald-700'
                  : 'text-slate-900'
            }`}
          >
            {STAGE_LABELS[telemetry.stage]}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-slate-500">
            {telemetry.currentStepLabel}
          </div>
        </div>

        <div className="p-3.5">
          <div className="text-[11px] font-medium text-slate-500">Ekran Kartı &amp; Bellek</div>
          <div className="mt-1 font-mono text-xs font-bold text-slate-900 tabular-nums">
            {telemetry.gpuName
              ? `${telemetry.vramUsedGb ?? 0} / ${telemetry.vramTotalGb ?? 0} GB`
              : 'Oturum Bekleniyor'}
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-200"
              style={{ width: `${vramRatio}%` }}
            />
          </div>
        </div>

        <div className="p-3.5">
          <div className="text-[11px] font-medium text-slate-500">Yüksek Sistem RAM</div>
          <div className="mt-1 font-mono text-xs font-bold text-slate-900 tabular-nums">
            {telemetry.systemRamTotalGb !== null
              ? `${telemetry.systemRamUsedGb ?? 0} / ${telemetry.systemRamTotalGb} GB`
              : '—'}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
            {telemetry.gpuTempC !== null ? `Sıcaklık: ${telemetry.gpuTempC}°C` : 'Önerilen ≥ 50 GB'}
          </div>
        </div>

        <div className="p-3.5">
          <div className="text-[11px] font-medium text-slate-500">Sıradaki Sahneler</div>
          <div className="mt-1 font-mono text-xs font-bold text-slate-900 tabular-nums">
            {telemetry.batchTotal > 0
              ? `${telemetry.batchIndex} / ${telemetry.batchTotal} sahne`
              : '0 / 0'}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
            {telemetry.diskFreeGb !== null ? `Boş Alan: ${telemetry.diskFreeGb} GB` : 'Alan bekleniyor'}
          </div>
        </div>

        <div className="p-3.5">
          <div className="text-[11px] font-medium text-slate-500">Oturum Bağlantı Anahtarı</div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="truncate font-mono text-[11px] text-slate-700">
              {ingestToken ? `${ingestToken.slice(0, 12)}...` : 'Hazırlanıyor'}
            </span>
            <button
              type="button"
              onClick={handleCopyToken}
              disabled={!ingestToken}
              aria-label="Oturum anahtarını kopyala"
              className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-blue-300 shrink-0"
            >
              {copiedToken ? (
                <Check className="h-3 w-3 text-emerald-600" aria-hidden="true" />
              ) : (
                <Copy className="h-3 w-3" aria-hidden="true" />
              )}
            </button>
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            Pakete otomatik eklenir
          </div>
        </div>
      </div>

      {/* Collapsible event stream so customer UI remains clean */}
      <div className="rounded-lg border border-slate-200 bg-slate-50">
        <button
          type="button"
          onClick={() => setShowLogs((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-2.5 text-left text-xs font-medium text-slate-700 hover:text-slate-900"
        >
          <span className="inline-flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
            <span>Canlı Olay Geçmişi ({telemetry.logs.length})</span>
          </span>
          <ChevronDown
            className={`h-4 w-4 text-slate-400 transition-transform ${showLogs ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>

        {(showLogs || telemetry.logs.length > 0) && (
          <div className="border-t border-slate-200 bg-white px-4 py-3">
            {telemetry.logs.length === 0 ? (
              <p className="text-xs text-slate-500">
                Henüz etkinlik yok. Üretim başladığında veya &ldquo;Bağlantıyı Test Et&rdquo;
                düğmesine bastığınızda son güncellemeler burada görünür.
              </p>
            ) : (
              <div className="max-h-32 space-y-1 overflow-auto font-mono text-[11px]">
                {telemetry.logs.map((entry) => (
                  <div
                    key={entry.id}
                    className={
                      entry.level === 'error'
                        ? 'text-rose-700'
                        : entry.level === 'success'
                          ? 'text-emerald-700'
                          : entry.level === 'warn'
                            ? 'text-amber-700'
                            : 'text-slate-700'
                    }
                  >
                    <span className="text-slate-400">[{entry.timestamp}]</span> {entry.message}
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
