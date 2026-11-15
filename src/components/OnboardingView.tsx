import { useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  ArrowRight,
  Download,
  Loader2,
  LogOut,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import {
  AutomationConfig,
  ColabProject,
  HfVerifyResult,
  OnboardingState,
  WorkspaceTab,
} from '../types/automation';
import { GoogleSignInButton } from './GoogleSignInButton';
import { generateColabMcpServer } from '../utils/codeGenerators';
import { generateMcpInstallerScript } from '../utils/claudeGenerators';

interface OnboardingViewProps {
  onboarding: OnboardingState;
  onUpdateOnboarding: (next: OnboardingState) => void;
  config: AutomationConfig;
  onUpdateConfig: (next: AutomationConfig) => void;
  activeProject: ColabProject;
  driveUserEmail: string | null;
  driveAccessToken: string | null;
  isSigningIn: boolean;
  onConnectDrive: () => Promise<void>;
  onDisconnectDrive: () => Promise<void>;
  onDownloadFile: (filename: string, content: string | Blob, mime: string) => void;
  onNavigate: (tab: WorkspaceTab) => void;
}

export function OnboardingView({
  onboarding,
  onUpdateOnboarding,
  config,
  onUpdateConfig,
  activeProject,
  driveUserEmail,
  driveAccessToken,
  isSigningIn,
  onConnectDrive,
  onDisconnectDrive,
  onDownloadFile,
  onNavigate,
}: OnboardingViewProps) {
  const [hfTokenInput, setHfTokenInput] = useState('');
  const [hfTestRepo, setHfTestRepo] = useState('Qwen/Qwen2.5-0.5B-Instruct');
  const [hfChecking, setHfChecking] = useState(false);
  const [hfCheckResult, setHfCheckResult] = useState<HfVerifyResult | null>(null);

  const step1Done = Boolean(driveAccessToken) && onboarding.colabPlanConfirmed;
  const step2Done = onboarding.hfAccountReady && onboarding.hfTokenVerified;
  const step3Done = onboarding.mcpInstalledConfirmed;
  const completedCount = [step1Done, step2Done, step3Done].filter(Boolean).length;
  const progressPct = Math.round((completedCount / 3) * 100);

  async function handleTestHuggingFace() {
    setHfChecking(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (hfTokenInput.trim()) {
        headers['x-hf-token'] = hfTokenInput.trim();
      }
      const res = await fetch('/api/hf/verify', {
        method: 'POST',
        headers,
        body: JSON.stringify({ repoId: hfTestRepo }),
      });
      const data = (await res.json()) as HfVerifyResult;
      setHfCheckResult(data);
      if (data.ok) {
        onUpdateOnboarding({
          ...onboarding,
          hfAccountReady: true,
          hfTokenVerified: true,
        });
      }
    } catch (err) {
      setHfCheckResult({
        ok: false,
        status: 0,
        repoId: hfTestRepo,
        error: err instanceof Error ? err.message : 'Bağlantı kurulamadı',
      });
    } finally {
      setHfChecking(false);
    }
  }

  function handleDownloadInstaller() {
    const mcpPy = generateColabMcpServer(config, activeProject.assets);
    const script = generateMcpInstallerScript(
      onboarding.preferredOs,
      activeProject,
      config,
      mcpPy
    );
    const filename =
      onboarding.preferredOs === 'windows'
        ? 'install_colabforge_mcp.ps1'
        : 'install_colabforge_mcp.sh';
    onDownloadFile(filename, script, 'text/plain;charset=utf-8');
  }

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-slate-200 bg-white p-6 md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-2.5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
              <span className="font-semibold text-blue-600">Hızlı Başlangıç</span>
              <span aria-hidden="true">·</span>
              <span>Herkesin Kendi Hesabıyla Çalışır</span>
              <span aria-hidden="true">·</span>
              <span>3 Kolay Adım</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl text-balance">
              Hesaplarınızı bir kez bağlayın, stüdyonuz her yerde hazır olsun
            </h1>
            <p className="text-sm leading-relaxed text-slate-600 md:text-base">
              Bu uygulama kimseye özel sabit bilgiler içermez. Siz veya ekibinizden biri kendi
              Google hesabıyla giriş yapar, model erişimini doğrular ve tek tıkla masaüstü
              bağlantısını kurar.
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 sm:items-end shrink-0">
            <div className="w-full sm:w-56 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Kurulum İlerlemesi</span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {completedCount} / 3 ({progressPct}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-200"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('workbench')}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-blue-700 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Stüdyoya Geç
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3 items-stretch">
        {/* Step 01 */}
        <section className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6">
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3.5">
              <span className="text-xs font-semibold text-slate-500">
                Adım 1 · Google &amp; Drive
              </span>
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                  step1Done ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {step1Done ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Bağlı
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    Bağlantı Bekliyor
                  </>
                )}
              </span>
            </div>

            <div className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">
                Google Hesabı &amp; Bulut Alanı İzni
              </h2>
              <p className="text-xs leading-relaxed text-slate-600">
                Üretilen videolar doğrudan bilgisayarınıza iner; isterseniz güvenlik yedeği
                olarak Google Drive klasörünüze de kopyalanır.
              </p>
            </div>

            <div className="space-y-3.5 pt-1">
              {driveAccessToken ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs">
                  <span className="truncate font-medium text-emerald-900">
                    {driveUserEmail}
                  </span>
                  <button
                    type="button"
                    onClick={onDisconnectDrive}
                    className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:text-emerald-900 hover:underline shrink-0"
                  >
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                    Çıkış
                  </button>
                </div>
              ) : (
                <GoogleSignInButton
                  onClick={onConnectDrive}
                  disabled={isSigningIn}
                  label={isSigningIn ? 'Bağlanıyor...' : 'Google ile Giriş Yap'}
                />
              )}

              <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.autoSyncOutputsToDrive}
                  onChange={(e) =>
                    onUpdateConfig({
                      ...config,
                      autoSyncOutputsToDrive: e.target.checked,
                    })
                  }
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-600"
                />
                <span>Üretilen videoları Google Drive’a da otomatik yedekle.</span>
              </label>

              <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onboarding.colabPlanConfirmed}
                  onChange={(e) =>
                    onUpdateOnboarding({
                      ...onboarding,
                      colabPlanConfirmed: e.target.checked,
                    })
                  }
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-600"
                />
                <span>Google Colab hesabımda yüksek bellekli GPU erişimim hazır.</span>
              </label>
            </div>
          </div>

          <div className="mt-6 border-t border-slate-200 pt-4">
            <a
              href="https://colab.research.google.com/signup"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
            >
              Henüz Colab Pro hesabınız yoksa buradan açın
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </section>

        {/* Step 02 */}
        <section className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6">
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3.5">
              <span className="text-xs font-semibold text-slate-500">
                Adım 2 · Model Erişimi
              </span>
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                  step2Done ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {step2Done ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Doğrulandı
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    Kontrol Bekliyor
                  </>
                )}
              </span>
            </div>

            <div className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">
                HuggingFace Hesabı &amp; İndirme Anahtarı
              </h2>
              <p className="text-xs leading-relaxed text-slate-600">
                Video modelleri her çalıştırmada güvenli şekilde HuggingFace üzerinden çekilir.
                Anahtarınız yalnızca anlık bağlantı kontrolü için kullanılır.
              </p>
            </div>

            <div className="flex flex-wrap gap-4 text-xs">
              <a
                href="https://huggingface.co/join"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700 hover:underline"
              >
                Ücretsiz Hesap Aç
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
              <a
                href="https://huggingface.co/settings/tokens/new?tokenType=read"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700 hover:underline"
              >
                Erişim Anahtarı Oluştur
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </div>

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="onboard-hf-repo"
                  className="block text-xs font-medium text-slate-700"
                >
                  Kontrol Edilecek Model Adresi
                </label>
                <input
                  id="onboard-hf-repo"
                  type="text"
                  value={hfTestRepo}
                  onChange={(e) => setHfTestRepo(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="onboard-hf-token"
                  className="block text-xs font-medium text-slate-700"
                >
                  Erişim Anahtarı (İsteğe Bağlı Test)
                </label>
                <input
                  id="onboard-hf-token"
                  type="password"
                  autoComplete="off"
                  placeholder="hf_..."
                  value={hfTokenInput}
                  onChange={(e) => setHfTokenInput(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={handleTestHuggingFace}
                disabled={hfChecking}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors duration-150 hover:border-blue-400 hover:bg-blue-50/40 disabled:opacity-50"
              >
                {hfChecking && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                Erişimi Şimdi Kontrol Et
              </button>

              {hfCheckResult && (
                <div
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                    hfCheckResult.ok
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-rose-200 bg-rose-50 text-rose-800'
                  }`}
                >
                  {hfCheckResult.ok ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  )}
                  <span>
                    {hfCheckResult.ok
                      ? `Bağlantı hazır: ${hfCheckResult.repoId} (${hfCheckResult.fileCount ?? 0} dosya)`
                      : hfCheckResult.error}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 border-t border-slate-200 pt-4">
            <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={onboarding.hfAccountReady}
                onChange={(e) =>
                  onUpdateOnboarding({
                    ...onboarding,
                    hfAccountReady: e.target.checked,
                  })
                }
                className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-600"
              />
              <span>Erişim anahtarımı Colab Sırlar (Secrets) bölümüne ekledim.</span>
            </label>
          </div>
        </section>

        {/* Step 03 */}
        <section className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6">
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3.5">
              <span className="text-xs font-semibold text-slate-500">
                Adım 3 · Masaüstü Kurulumu
              </span>
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                  step3Done ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {step3Done ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Hazır
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    Tek Tık Kurulum
                  </>
                )}
              </span>
            </div>

            <div className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">
                Otomatik Bağlantı &amp; Claude Kurucusu
              </h2>
              <p className="text-xs leading-relaxed text-slate-600">
                Kod yazmadan tek bir kurulum dosyasıyla bilgisayarınızdaki proje klasörünü ve
                uzaktan yönetim bağlantısını otomatik olarak ayarlayın.
              </p>
            </div>

            <div
              role="group"
              aria-label="İşletim sistemi seçici"
              className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1"
            >
              {(
                [
                  { id: 'windows', label: 'Windows (.ps1)' },
                  { id: 'macos_linux', label: 'macOS / Linux (.sh)' },
                ] as const
              ).map((osOpt) => (
                <button
                  key={osOpt.id}
                  type="button"
                  onClick={() =>
                    onUpdateOnboarding({ ...onboarding, preferredOs: osOpt.id })
                  }
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors duration-150 whitespace-nowrap ${
                    onboarding.preferredOs === osOpt.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {osOpt.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleDownloadInstaller}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2.5 text-xs font-semibold text-white transition-colors duration-150 hover:bg-blue-700"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              {onboarding.preferredOs === 'windows'
                ? 'Windows Kurucusunu İndir'
                : 'macOS / Linux Kurucusunu İndir'}
            </button>

            <button
              type="button"
              onClick={() => onNavigate('claude')}
              className="w-full text-left text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
            >
              Oluşturulan otomasyon dosyalarını incele →
            </button>
          </div>

          <div className="mt-6 border-t border-slate-200 pt-4">
            <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={onboarding.mcpInstalledConfirmed}
                onChange={(e) =>
                  onUpdateOnboarding({
                    ...onboarding,
                    mcpInstalledConfirmed: e.target.checked,
                  })
                }
                className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-600"
              />
              <span>Kurulum dosyasını çalıştırdım veya paketi manuel indireceğim.</span>
            </label>
          </div>
        </section>
      </div>
    </div>
  );
}
