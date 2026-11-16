import { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  LogOut,
  XCircle,
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
    <div className="space-y-6 text-[#F5F5F7]">
      <section className="rounded-2xl border border-white/[0.08] bg-[#141417] p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-medium text-[#0A84FF]">
              Kurulum · {completedCount} / 3 tamamlandı
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#F5F5F7]">
              Google &amp; Colab Hesap Bağlantısı
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Kendi hesabınızı bağlayın; videolarınız güvenli şekilde doğrudan cihazınıza ve Drive’a aktarılsın.
            </p>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="w-36 space-y-1.5">
              <div className="flex justify-between text-xs text-zinc-400 tabular-nums">
                <span>Hazırlık</span>
                <span>%{progressPct}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-[#30D158] transition-all duration-200"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('workbench')}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#0A84FF] px-4 py-2 text-xs font-semibold text-white hover:brightness-110 whitespace-nowrap"
            >
              Stüdyoya Geç
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3 items-stretch">
        {/* Step 1 */}
        <section className="flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#141417] p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">1. Google &amp; Drive</span>
              <span
                className={`text-xs font-medium ${
                  step1Done ? 'text-[#30D158]' : 'text-amber-400'
                }`}
              >
                {step1Done ? 'Bağlı' : 'Bekliyor'}
              </span>
            </div>

            <h2 className="text-base font-semibold text-[#F5F5F7]">Google Hesabı</h2>

            {driveAccessToken ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-[#30D158]/25 bg-[#30D158]/10 px-3.5 py-2.5 text-xs">
                <span className="truncate font-medium text-emerald-100">{driveUserEmail}</span>
                <button
                  type="button"
                  onClick={onDisconnectDrive}
                  className="inline-flex items-center gap-1 font-medium text-emerald-300 hover:text-white shrink-0"
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

            <label className="flex items-start gap-2.5 text-xs text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={config.autoSyncOutputsToDrive}
                onChange={(e) =>
                  onUpdateConfig({ ...config, autoSyncOutputsToDrive: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 rounded accent-[#0A84FF]"
              />
              <span>Videoları Google Drive’a da otomatik yedekle.</span>
            </label>

            <label className="flex items-start gap-2.5 text-xs text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={onboarding.colabPlanConfirmed}
                onChange={(e) =>
                  onUpdateOnboarding({
                    ...onboarding,
                    colabPlanConfirmed: e.target.checked,
                  })
                }
                className="mt-0.5 h-4 w-4 rounded accent-[#0A84FF]"
              />
              <span>Colab Pro yüksek bellekli GPU erişimim hazır.</span>
            </label>
          </div>

          <div className="mt-5 border-t border-white/[0.06] pt-3.5">
            <a
              href="https://colab.research.google.com/signup"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0A84FF] hover:underline"
            >
              Colab Pro hesabı aç
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </section>

        {/* Step 2 */}
        <section className="flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#141417] p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">2. HuggingFace</span>
              <span
                className={`text-xs font-medium ${
                  step2Done ? 'text-[#30D158]' : 'text-amber-400'
                }`}
              >
                {step2Done ? 'Doğrulandı' : 'Bekliyor'}
              </span>
            </div>

            <h2 className="text-base font-semibold text-[#F5F5F7]">Model Erişim Anahtarı</h2>

            <div className="space-y-2.5">
              <input
                id="onboard-hf-repo"
                aria-label="Kontrol Edilecek Model Adresi"
                type="text"
                value={hfTestRepo}
                onChange={(e) => setHfTestRepo(e.target.value)}
                className="w-full rounded-xl border border-white/[0.08] bg-[#0E0E11] px-3 py-2 font-mono text-xs text-[#F5F5F7] focus:border-[#0A84FF] focus:outline-none"
              />
              <input
                id="onboard-hf-token"
                aria-label="HuggingFace Erişim Anahtarı"
                type="password"
                autoComplete="off"
                placeholder="hf_..."
                value={hfTokenInput}
                onChange={(e) => setHfTokenInput(e.target.value)}
                className="w-full rounded-xl border border-white/[0.08] bg-[#0E0E11] px-3 py-2 font-mono text-xs text-[#F5F5F7] placeholder:text-zinc-600 focus:border-[#0A84FF] focus:outline-none"
              />

              <button
                type="button"
                onClick={handleTestHuggingFace}
                disabled={hfChecking}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/[0.08] bg-[#1C1C20] px-4 py-2 text-xs font-medium text-zinc-200 hover:bg-white/[0.08] disabled:opacity-50"
              >
                {hfChecking && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                Erişimi Kontrol Et
              </button>

              {hfCheckResult && (
                <div
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${
                    hfCheckResult.ok
                      ? 'bg-[#30D158]/10 text-[#30D158]'
                      : 'bg-[#FF453A]/10 text-[#FF453A]'
                  }`}
                >
                  {hfCheckResult.ok ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  )}
                  <span className="truncate">
                    {hfCheckResult.ok
                      ? `Hazır (${hfCheckResult.fileCount ?? 0} dosya)`
                      : hfCheckResult.error}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 border-t border-white/[0.06] pt-3.5">
            <label className="flex items-start gap-2.5 text-xs text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={onboarding.hfAccountReady}
                onChange={(e) =>
                  onUpdateOnboarding({
                    ...onboarding,
                    hfAccountReady: e.target.checked,
                  })
                }
                className="mt-0.5 h-4 w-4 rounded accent-[#0A84FF]"
              />
              <span>Anahtarımı Colab Secrets bölümüne ekledim.</span>
            </label>
          </div>
        </section>

        {/* Step 3 */}
        <section className="flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#141417] p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">3. Masaüstü Kurucu</span>
              <span
                className={`text-xs font-medium ${
                  step3Done ? 'text-[#30D158]' : 'text-amber-400'
                }`}
              >
                {step3Done ? 'Hazır' : 'Tek Tık'}
              </span>
            </div>

            <h2 className="text-base font-semibold text-[#F5F5F7]">Otomatik Kurulum Dosyası</h2>

            <div
              role="group"
              aria-label="İşletim sistemi seçici"
              className="grid grid-cols-2 gap-1 rounded-xl border border-white/[0.06] bg-[#0E0E11] p-1"
            >
              {(
                [
                  { id: 'windows', label: 'Windows' },
                  { id: 'macos_linux', label: 'macOS / Linux' },
                ] as const
              ).map((osOpt) => (
                <button
                  key={osOpt.id}
                  type="button"
                  onClick={() =>
                    onUpdateOnboarding({ ...onboarding, preferredOs: osOpt.id })
                  }
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    onboarding.preferredOs === osOpt.id
                      ? 'bg-white/[0.12] text-[#F5F5F7]'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {osOpt.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleDownloadInstaller}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#0A84FF] px-4 py-2 text-xs font-semibold text-white hover:brightness-110"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              {onboarding.preferredOs === 'windows'
                ? 'Windows Kurucusunu İndir'
                : 'macOS / Linux Kurucusunu İndir'}
            </button>
          </div>

          <div className="mt-5 border-t border-white/[0.06] pt-3.5">
            <label className="flex items-start gap-2.5 text-xs text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={onboarding.mcpInstalledConfirmed}
                onChange={(e) =>
                  onUpdateOnboarding({
                    ...onboarding,
                    mcpInstalledConfirmed: e.target.checked,
                  })
                }
                className="mt-0.5 h-4 w-4 rounded accent-[#0A84FF]"
              />
              <span>Kurulumu tamamladım veya manuel indireceğim.</span>
            </label>
          </div>
        </section>
      </div>
    </div>
  );
}
