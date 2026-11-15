import { useState } from 'react';
import { AppWindow, CheckCircle2, Download, Laptop, Share, X } from 'lucide-react';

interface MacInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  isMac: boolean;
  isSafari: boolean;
  onInstallPwa: () => Promise<boolean>;
}

export function MacInstallModal({
  isOpen,
  onClose,
  isInstallable,
  isInstalled,
  isIOS,
  isMac,
  isSafari,
  onInstallPwa,
}: MacInstallModalProps) {
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [zipDownloaded, setZipDownloaded] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleDownloadMacZip() {
    setDownloadingZip(true);
    setZipError(null);
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const res = await fetch(
        `/api/download/mac-trial?origin=${encodeURIComponent(origin)}`
      );
      if (!res.ok) {
        throw new Error(`İndirme başarısız (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ColabForge-Mac-Deneme.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setZipDownloaded(true);
    } catch (err) {
      setZipError(
        err instanceof Error ? err.message : 'MacBook paketi indirilemedi.'
      );
    } finally {
      setDownloadingZip(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mac-install-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Laptop className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="mac-install-modal-title"
                className="text-base font-bold text-slate-900"
              >
                MacBook Deneme Sürümünü İndir
              </h2>
              <p className="text-xs text-slate-500">
                Ek kurulum veya kod bilgisi gerektirmeden masaüstü uygulaması olarak çalıştırın.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          {/* Option 1: Instant Desktop App (PWA / Dock) */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AppWindow className="h-4 w-4 text-blue-600" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-slate-900">
                  1. Tek Tıkla Mac Dock Uygulaması (Önerilen)
                </h3>
              </div>
              <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                En Hızlısı
              </span>
            </div>

            {isInstalled ? (
              <div className="mt-2.5 flex items-center gap-2 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Uygulama şu an bağımsız masaüstü penceresinde çalışıyor.</span>
              </div>
            ) : isInstallable ? (
              <div className="mt-3 space-y-2.5">
                <p className="text-xs leading-relaxed text-slate-600">
                  Tarayıcınız doğrudan masaüstü kurulumunu destekliyor. Tek tıkla MacBook Uygulamalarım
                  ve Dock çubuğuna ekleyebilirsiniz.
                </p>
                <button
                  type="button"
                  onClick={() => void onInstallPwa()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  <span>Mac&apos;e Uygulama Olarak Kur</span>
                </button>
              </div>
            ) : isIOS ? (
              <div className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-slate-600">
                <p className="flex items-center gap-1.5 font-medium text-slate-800">
                  <Share className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
                  iPad / iPhone Safari Kurulumu:
                </p>
                <p>1. Safari alt/üst araç çubuğundaki <strong>Paylaş</strong> simgesine dokunun.</p>
                <p>2. Listeden <strong>Ana Ekrana Ekle</strong> seçeneğini seçin.</p>
              </div>
            ) : isMac && isSafari ? (
              <div className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-slate-600">
                <p>
                  Mac Safari&apos;de üst menü çubuğundan <strong>Dosya → Dock&apos;a Ekle</strong>{' '}
                  seçeneğine tıklayarak ColabForge&apos;u doğrudan Mac uygulaması gibi Dock&apos;a
                  sabitleyebilirsiniz.
                </p>
              </div>
            ) : (
              <div className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-slate-600">
                <p>
                  Chrome veya Edge kullanıyorsanız adres çubuğunun sağındaki{' '}
                  <strong>Yükle (Bilgisayar + ok)</strong> simgesine ya da tarayıcı menüsünden{' '}
                  <strong>Yayınla, kaydet ve paylaş → Sayfayı uygulama olarak yükle</strong>{' '}
                  adımlarını izleyin.
                </p>
              </div>
            )}
          </div>

          {/* Option 2: Downloadable .zip MacBook Launcher */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Download className="h-4 w-4 text-slate-700" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-slate-900">
                  2. İndirilebilir MacBook Başlatıcı Paketi (.zip)
                </h3>
              </div>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                ~3 KB
              </span>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              İndirdiğiniz paketteki dosyaya çift tıkladığınızda MacBook&apos;unuzda{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-800">
                ColabForge.app
              </code>{' '}
              uygulamasını oluşturur ve stüdyoyu ayrı pencerede başlatır.
            </p>

            <ol className="mt-2.5 space-y-1 text-xs text-slate-600">
              <li>1. Aşağıdaki butonla ZIP paketini Mac&apos;inize indirin ve açın.</li>
              <li>
                2. <strong className="text-slate-800">ColabForge Baslat.command</strong> dosyasına
                çift tıklayın (ilk açılışta uyarı çıkarsa <em>Sağ Tık → Aç</em>).
              </li>
              <li>3. Uygulama penceresi otomatik olarak açılır ve Spotlight&apos;a eklenir.</li>
            </ol>

            {zipError && (
              <p className="mt-2.5 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                {zipError}
              </p>
            )}

            {zipDownloaded && (
              <div className="mt-2.5 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Paket indirildi! İndirilenler klasöründen ZIP&apos;i açıp{' '}
                  <strong>ColabForge Baslat.command</strong> dosyasını çalıştırın.
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleDownloadMacZip()}
              disabled={downloadingZip}
              className="mt-3.5 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-60"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>
                {downloadingZip
                  ? 'MacBook Paketi Hazırlanıyor...'
                  : 'ColabForge-Mac-Deneme.zip İndir'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
