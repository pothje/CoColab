import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  HardDrive,
  Loader2,
  Terminal,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  AutomationConfig,
  ComfyModelId,
  HfVerifyResult,
  InstalledModelRecord,
  ModelStorageTarget,
  ModelVariantId,
  WorkspaceTab,
} from '../types/automation';
import {
  COMFY_MODEL_CATALOG,
  applyModelToAutomationConfig,
  generateAcceleratedModelBashScript,
  generateAcceleratedModelPythonScript,
  generateColabModelInstallSnippet,
  getComfyModelSpec,
  getComfyModelVariant,
  resolveModelStoragePaths,
} from '../utils/modelInstaller';
import { GoogleSignInButton } from './GoogleSignInButton';

interface ComfyModelInstallerViewProps {
  config: AutomationConfig;
  onUpdateConfig: (next: AutomationConfig) => void;
  driveUserEmail: string | null;
  driveAccessToken: string | null;
  isSigningIn: boolean;
  onConnectDrive: () => Promise<void>;
  onDownloadFile: (filename: string, content: string | Blob, mime: string) => void;
  onNavigate: (tab: WorkspaceTab) => void;
}

interface ActiveInstallProgress {
  modelId: ComfyModelId;
  target: ModelStorageTarget;
  variantId: ModelVariantId;
  pct: number;
  stageLabel: string;
}

type ScriptTab = 'python' | 'bash' | 'colab';

function ApplePillSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#0A84FF]/60 ${
        checked ? 'bg-[#30D158]' : 'bg-zinc-700'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export function ComfyModelInstallerView({
  config,
  onUpdateConfig,
  driveUserEmail,
  driveAccessToken,
  isSigningIn,
  onConnectDrive,
  onDownloadFile,
  onNavigate,
}: ComfyModelInstallerViewProps) {
  const { modelInstaller } = config;
  const [scriptTab, setScriptTab] = useState<ScriptTab>('python');
  const [copiedScript, setCopiedScript] = useState(false);
  const [showScriptPreview, setShowScriptPreview] = useState(false);
  const [expandedFileCard, setExpandedFileCard] = useState<ComfyModelId | null>(null);
  const [installProgress, setInstallProgress] = useState<ActiveInstallProgress | null>(null);
  const [verifyingModelId, setVerifyingModelId] = useState<ComfyModelId | null>(null);
  const [verifyResults, setVerifyResults] = useState<
    Partial<Record<ComfyModelId, HfVerifyResult>>
  >({});

  const installTimerRef = useRef<number | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    return () => {
      if (installTimerRef.current !== null) {
        window.clearInterval(installTimerRef.current);
      }
    };
  }, []);

  const selectedModel = getComfyModelSpec(modelInstaller.selectedModelId);
  const selectedVariantId = modelInstaller.selectedVariants[selectedModel.id] ?? 'balanced_40gb';
  const selectedVariant = getComfyModelVariant(selectedModel.id, selectedVariantId);
  const resolvedPaths = useMemo(
    () => resolveModelStoragePaths(config, selectedModel.id, modelInstaller.installTarget),
    [config, selectedModel.id, modelInstaller.installTarget]
  );

  const generatedScript = useMemo(() => {
    if (scriptTab === 'bash') {
      return generateAcceleratedModelBashScript(
        selectedModel.id,
        selectedVariantId,
        modelInstaller.installTarget,
        config
      );
    }
    if (scriptTab === 'colab') {
      return generateColabModelInstallSnippet(
        selectedModel.id,
        selectedVariantId,
        modelInstaller.installTarget,
        config
      );
    }
    return generateAcceleratedModelPythonScript(
      selectedModel.id,
      selectedVariantId,
      modelInstaller.installTarget,
      config
    );
  }, [scriptTab, selectedModel.id, selectedVariantId, modelInstaller.installTarget, config]);

  function updateInstaller(patch: Partial<AutomationConfig['modelInstaller']>) {
    onUpdateConfig({
      ...config,
      modelInstaller: {
        ...modelInstaller,
        ...patch,
      },
    });
  }

  function handleSelectTarget(nextTarget: ModelStorageTarget) {
    const synced = applyModelToAutomationConfig(
      config,
      modelInstaller.selectedModelId,
      selectedVariantId,
      nextTarget
    );
    onUpdateConfig(synced);
  }

  function handleSelectVariant(modelId: ComfyModelId, variantId: ModelVariantId) {
    const nextConfig: AutomationConfig = {
      ...config,
      modelInstaller: {
        ...modelInstaller,
        selectedVariants: {
          ...modelInstaller.selectedVariants,
          [modelId]: variantId,
        },
      },
    };
    if (modelId === modelInstaller.selectedModelId) {
      onUpdateConfig(
        applyModelToAutomationConfig(nextConfig, modelId, variantId, modelInstaller.installTarget)
      );
    } else {
      onUpdateConfig(nextConfig);
    }
  }

  function handleActivateModelForPipeline(modelId: ComfyModelId) {
    const variantId = modelInstaller.selectedVariants[modelId] ?? 'balanced_40gb';
    onUpdateConfig(
      applyModelToAutomationConfig(config, modelId, variantId, modelInstaller.installTarget)
    );
  }

  function handleStartOneClickInstall(modelId: ComfyModelId, target: ModelStorageTarget) {
    if (installTimerRef.current !== null) {
      window.clearInterval(installTimerRef.current);
      installTimerRef.current = null;
    }

    const variantId = modelInstaller.selectedVariants[modelId] ?? 'balanced_40gb';
    const spec = getComfyModelSpec(modelId);
    const variant = getComfyModelVariant(modelId, variantId);
    const targetPaths = resolveModelStoragePaths(config, modelId, target);

    const syncedConfig = applyModelToAutomationConfig(config, modelId, variantId, target);
    onUpdateConfig(syncedConfig);

    const stages: { pct: number; label: string }[] = [
      {
        pct: 18,
        label: syncedConfig.modelInstaller.useUvAcceleration
          ? 'uv pip ortamı hazırlanıyor...'
          : 'pip ortamı hazırlanıyor...',
      },
      {
        pct: 48,
        label: syncedConfig.enableHfTransfer
          ? `hf_transfer ile ${variant.files[0]?.label ?? spec.name} indiriliyor...`
          : `${variant.files[0]?.label ?? spec.name} indiriliyor...`,
      },
      {
        pct: 80,
        label: `${
          target === 'drive' ? 'Drive önbelleğine' : 'oturum NVMe diskine'
        } yazılıyor...`,
      },
    ];

    let stepIndex = 0;
    setInstallProgress({
      modelId,
      target,
      variantId,
      pct: stages[0].pct,
      stageLabel: stages[0].label,
    });

    installTimerRef.current = window.setInterval(() => {
      stepIndex += 1;
      if (stepIndex < stages.length) {
        const nextStage = stages[stepIndex];
        setInstallProgress({
          modelId,
          target,
          variantId,
          pct: nextStage.pct,
          stageLabel: nextStage.label,
        });
        return;
      }

      if (installTimerRef.current !== null) {
        window.clearInterval(installTimerRef.current);
        installTimerRef.current = null;
      }

      const latest = configRef.current;
      const record: InstalledModelRecord = {
        modelId,
        variantId,
        target,
        installPath: targetPaths.activeDownloadDir,
        installedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
        acceleratedWithUv: latest.modelInstaller.useUvAcceleration,
        acceleratedWithHfTransfer: latest.enableHfTransfer,
      };

      onUpdateConfig({
        ...applyModelToAutomationConfig(latest, modelId, variantId, target),
        modelInstaller: {
          ...latest.modelInstaller,
          selectedModelId: modelId,
          installTarget: target,
          selectedVariants: {
            ...latest.modelInstaller.selectedVariants,
            [modelId]: variantId,
          },
          installedModels: {
            ...latest.modelInstaller.installedModels,
            [modelId]: record,
          },
        },
      });
      setInstallProgress(null);
    }, 220);
  }

  function handleClearInstalledModel(modelId: ComfyModelId) {
    const nextInstalled = { ...modelInstaller.installedModels };
    delete nextInstalled[modelId];
    updateInstaller({ installedModels: nextInstalled });
  }

  async function handleVerifyRepo(modelId: ComfyModelId, repoId: string) {
    setVerifyingModelId(modelId);
    try {
      const res = await fetch('/api/hf/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoId }),
      });
      const data = (await res.json()) as HfVerifyResult;
      setVerifyResults((prev) => ({ ...prev, [modelId]: data }));
    } catch (err) {
      setVerifyResults((prev) => ({
        ...prev,
        [modelId]: {
          ok: false,
          status: 0,
          repoId,
          error: err instanceof Error ? err.message : 'Bağlantı hatası',
        },
      }));
    } finally {
      setVerifyingModelId(null);
    }
  }

  async function handleCopyScript() {
    try {
      await navigator.clipboard.writeText(generatedScript);
      setCopiedScript(true);
      window.setTimeout(() => setCopiedScript(false), 1800);
    } catch {
      // Clipboard ignored
    }
  }

  function handleDownloadScript() {
    const slug = selectedModel.id.replace(/[^a-z0-9]/gi, '_');
    const filename =
      scriptTab === 'bash'
        ? `install_${slug}_${modelInstaller.installTarget}_uv_hf.sh`
        : `install_${slug}_${modelInstaller.installTarget}_uv_hf.py`;
    onDownloadFile(filename, generatedScript, 'text/plain;charset=utf-8');
  }

  const installedCount = Object.keys(modelInstaller.installedModels).length;

  return (
    <div className="space-y-6 min-w-0 text-[#F5F5F7]">
      {/* Calm Header & Storage / Speed Toolbar */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#141417] p-6 space-y-5 min-w-0">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-medium text-[#0A84FF]">
              Video Modelleri · {installedCount}/3 hazır
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#F5F5F7]">
              Ana Video Modellerini Kurun
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              MiniMax-H3, Wan 2.2 ve LTX 2.3 modellerini <code className="text-zinc-200">uv</code> ve{' '}
              <code className="text-zinc-200">hf_transfer</code> hızlandırmasıyla tek tıkla hazırlayın.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {modelInstaller.installTarget === 'drive' && !driveAccessToken && (
              <GoogleSignInButton
                onClick={onConnectDrive}
                disabled={isSigningIn}
                label={isSigningIn ? 'Bağlanıyor...' : 'Google Drive Bağla'}
              />
            )}
            <button
              type="button"
              onClick={() => onNavigate('colab')}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#0A84FF] px-4 py-2 text-xs font-semibold text-white transition-colors hover:brightness-110 whitespace-nowrap"
            >
              <span>Üretime Geç</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Clean Storage Target + Apple Toggles */}
        <div className="flex flex-col gap-4 border-t border-white/[0.06] pt-4 lg:flex-row lg:items-center lg:justify-between">
          <div
            role="group"
            aria-label="Model kurulum depolama hedefi"
            className="inline-flex rounded-xl border border-white/[0.06] bg-[#0E0E11] p-1 self-start"
          >
            <button
              type="button"
              aria-pressed={modelInstaller.installTarget === 'nvme'}
              onClick={() => handleSelectTarget('nvme')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                modelInstaller.installTarget === 'nvme'
                  ? 'bg-white/[0.12] text-[#F5F5F7]'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Zap className="h-3.5 w-3.5 text-[#0A84FF]" aria-hidden="true" />
              Oturum NVMe Diski
            </button>
            <button
              type="button"
              aria-pressed={modelInstaller.installTarget === 'drive'}
              onClick={() => handleSelectTarget('drive')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                modelInstaller.installTarget === 'drive'
                  ? 'bg-white/[0.12] text-[#F5F5F7]'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <HardDrive className="h-3.5 w-3.5 text-[#30D158]" aria-hidden="true" />
              Google Drive (Kalıcı)
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-xs text-zinc-300">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <ApplePillSwitch
                checked={config.enableHfTransfer}
                onChange={(next) => onUpdateConfig({ ...config, enableHfTransfer: next })}
                label="hf_transfer hızlandırmasını aç"
              />
              <span>hf_transfer</span>
            </label>

            <label className="inline-flex items-center gap-2 cursor-pointer">
              <ApplePillSwitch
                checked={modelInstaller.useUvAcceleration}
                onChange={(next) => updateInstaller({ useUvAcceleration: next })}
                label="uv hızlandırıcı kurulumu aç"
              />
              <span>uv Kurulumu</span>
            </label>

            <label className="inline-flex items-center gap-2 cursor-pointer">
              <ApplePillSwitch
                checked={modelInstaller.installRecommendedNodes}
                onChange={(next) => updateInstaller({ installRecommendedNodes: next })}
                label="Önerilen ComfyUI düğümlerini kur"
              />
              <span>Özel Düğümler</span>
            </label>

            <label className="inline-flex items-center gap-2 cursor-pointer">
              <ApplePillSwitch
                checked={modelInstaller.createDriveSymlinks}
                onChange={(next) => updateInstaller({ createDriveSymlinks: next })}
                label="Drive için sembolik bağ oluştur"
              />
              <span>Drive Symlink</span>
            </label>
          </div>
        </div>
      </section>

      {/* Airy 3-Column Core Models Grid */}
      <section aria-label="ComfyUI Ana Modelleri" className="grid gap-5 lg:grid-cols-3 min-w-0">
        {COMFY_MODEL_CATALOG.map((model) => {
          const variantId = modelInstaller.selectedVariants[model.id] ?? 'balanced_40gb';
          const variant = model.variants[variantId];
          const isSelectedForPipeline = modelInstaller.selectedModelId === model.id;
          const installed = modelInstaller.installedModels[model.id];
          const isInstallingThis = installProgress?.modelId === model.id;
          const verifyState = verifyResults[model.id];
          const filesOpen = expandedFileCard === model.id;

          return (
            <article
              key={model.id}
              data-testid={`model-card-${model.id}`}
              className={`flex min-w-0 flex-col justify-between rounded-2xl border bg-[#141417] p-6 transition-colors ${
                isSelectedForPipeline ? 'border-[#0A84FF]/60' : 'border-white/[0.08]'
              }`}
            >
              <div className="space-y-4 min-w-0">
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold text-[#F5F5F7]">{model.name}</h2>
                    {installed ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#30D158]/15 px-2.5 py-0.5 text-[11px] font-medium text-[#30D158] shrink-0">
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                        {installed.target === 'drive' ? 'Drive’da Hazır' : 'NVMe’de Hazır'}
                      </span>
                    ) : isSelectedForPipeline ? (
                      <span className="rounded-full bg-[#0A84FF]/15 px-2.5 py-0.5 text-[11px] font-medium text-[#0A84FF] shrink-0">
                        Aktif
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">{model.summary}</p>
                </div>

                {/* Clean Variant Segmented Toggle */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-zinc-500 tabular-nums">
                    <span>Sürüm Seçimi</span>
                    <span>
                      {variant.totalSizeGb} GB · Min {variant.minVramGb} GB VRAM
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-white/[0.06] bg-[#0E0E11] p-1">
                    {(['balanced_40gb', 'quality_80gb'] as ModelVariantId[]).map((vId) => {
                      const vSpec = model.variants[vId];
                      const active = variantId === vId;
                      return (
                        <button
                          key={vId}
                          type="button"
                          aria-pressed={active}
                          onClick={() => handleSelectVariant(model.id, vId)}
                          className={`rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                            active
                              ? 'bg-white/[0.12] font-medium text-[#F5F5F7]'
                              : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          <div className="truncate">{vSpec.label}</div>
                          <div className="text-[10px] text-zinc-500 tabular-nums">
                            {vSpec.totalSizeGb} GB
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Collapsible File List */}
                <div className="rounded-xl border border-white/[0.06] bg-[#0E0E11]">
                  <button
                    type="button"
                    onClick={() => setExpandedFileCard(filesOpen ? null : model.id)}
                    className="flex w-full items-center justify-between px-3.5 py-2 text-xs text-zinc-400 hover:text-zinc-200"
                  >
                    <span>Dosya Detayları ({variant.files.length} dosya)</span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${filesOpen ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                  {filesOpen && (
                    <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
                      {variant.files.map((file) => (
                        <div
                          key={file.id}
                          className="flex items-center justify-between gap-2 px-3.5 py-2 text-[11px]"
                        >
                          <span className="truncate text-zinc-300">{file.label}</span>
                          <span className="text-zinc-500 tabular-nums shrink-0">
                            {file.sizeGb.toFixed(1)} GB
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions Footer */}
              <div className="mt-5 space-y-3 border-t border-white/[0.06] pt-4">
                {isInstallingThis && installProgress && (
                  <div
                    data-testid={`model-progress-${model.id}`}
                    className="space-y-1.5 rounded-xl border border-[#0A84FF]/30 bg-[#0A84FF]/10 p-3"
                  >
                    <div className="flex items-center justify-between text-xs font-medium text-blue-200 tabular-nums">
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden="true" />
                        {installProgress.target === 'drive'
                          ? 'Drive’a Kuruluyor'
                          : 'NVMe’ye Kuruluyor'}
                      </span>
                      <span>%{installProgress.pct}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/40">
                      <div
                        className="h-full rounded-full bg-[#0A84FF] transition-all duration-150"
                        style={{ width: `${installProgress.pct}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-blue-200/80">{installProgress.stageLabel}</p>
                  </div>
                )}

                {installed && !isInstallingThis && (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-[#30D158]/25 bg-[#30D158]/10 px-3 py-2 text-xs text-emerald-100">
                    <span className="truncate">
                      {installed.target === 'drive'
                        ? 'Google Drive + Symlink Hazır'
                        : 'Oturum NVMe Hazır'}
                    </span>
                    <button
                      type="button"
                      aria-label={`${model.name} kurulum kaydını temizle`}
                      onClick={() => handleClearInstalledModel(model.id)}
                      className="rounded-full p-1 text-emerald-300 hover:bg-black/20 hover:text-[#FF453A] shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                )}

                {verifyState && (
                  <div
                    className={`flex items-center gap-1.5 text-xs ${
                      verifyState.ok ? 'text-[#30D158]' : 'text-[#FF453A]'
                    }`}
                  >
                    {verifyState.ok ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    )}
                    <span className="truncate">
                      {verifyState.ok
                        ? `Doğrulandı (${verifyState.fileCount ?? 0} dosya)`
                        : verifyState.error || `Hata (${verifyState.status})`}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={Boolean(installProgress)}
                    onClick={() => handleStartOneClickInstall(model.id, 'nvme')}
                    aria-label={`${model.name} modelini NVMe diskine kur`}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-40 whitespace-nowrap ${
                      modelInstaller.installTarget === 'nvme'
                        ? 'bg-[#0A84FF] text-white hover:brightness-110'
                        : 'border border-white/[0.08] bg-[#1C1C20] text-zinc-200 hover:bg-white/[0.08]'
                    }`}
                  >
                    <Zap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    NVMe’ye Kur
                  </button>

                  <button
                    type="button"
                    disabled={Boolean(installProgress)}
                    onClick={() => handleStartOneClickInstall(model.id, 'drive')}
                    aria-label={`${model.name} modelini Google Drive'a kur`}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-40 whitespace-nowrap ${
                      modelInstaller.installTarget === 'drive'
                        ? 'bg-[#0A84FF] text-white hover:brightness-110'
                        : 'border border-white/[0.08] bg-[#1C1C20] text-zinc-200 hover:bg-white/[0.08]'
                    }`}
                  >
                    <HardDrive className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    Drive’a Kur
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs pt-0.5">
                  <button
                    type="button"
                    onClick={() => handleActivateModelForPipeline(model.id)}
                    className={`font-medium transition-colors ${
                      isSelectedForPipeline
                        ? 'text-[#0A84FF]'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {isSelectedForPipeline ? 'Aktif Model' : 'Aktif Yap'}
                  </button>

                  <button
                    type="button"
                    disabled={verifyingModelId === model.id}
                    onClick={() => handleVerifyRepo(model.id, model.repoId)}
                    className="text-zinc-400 hover:text-white"
                  >
                    {verifyingModelId === model.id ? 'Kontrol ediliyor…' : 'Erişimi Doğrula'}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {/* Bottom: Compact Download & Collapsible Script Preview */}
      <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#141417]">
        <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => setShowScriptPreview((v) => !v)}
            className="flex items-center gap-2.5 text-left"
          >
            <Terminal className="h-4 w-4 text-[#0A84FF] shrink-0" aria-hidden="true" />
            <div>
              <div className="text-sm font-medium text-[#F5F5F7]">
                Kurulum Scripti ({selectedModel.name} ·{' '}
                {modelInstaller.installTarget === 'drive' ? 'Drive' : 'NVMe'})
              </div>
              <div className="text-xs text-zinc-500">
                {selectedVariant.totalSizeGb} GB ·{' '}
                {modelInstaller.installTarget === 'drive'
                  ? resolvedPaths.driveModelDir
                  : resolvedPaths.nvmeModelsDir}
              </div>
            </div>
            <ChevronDown
              className={`ml-1 h-4 w-4 text-zinc-500 transition-transform ${
                showScriptPreview ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </button>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyScript}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-[#1C1C20] px-3.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.08]"
            >
              {copiedScript ? (
                <>
                  <Check className="h-3.5 w-3.5 text-[#30D158]" aria-hidden="true" />
                  Kopyalandı
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  Kopyala
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleDownloadScript}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#0A84FF] px-4 py-1.5 text-xs font-semibold text-white hover:brightness-110"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Kurulum Scripti İndir
            </button>
          </div>
        </div>

        {showScriptPreview && (
          <div className="border-t border-white/[0.06] bg-[#0E0E11] p-5 space-y-3">
            <div
              role="tablist"
              aria-label="Kurulum script formatı"
              className="inline-flex rounded-lg border border-white/[0.06] bg-[#141417] p-0.5"
            >
              {[
                { id: 'python' as ScriptTab, label: 'Python (.py)' },
                { id: 'bash' as ScriptTab, label: 'Bash (.sh)' },
                { id: 'colab' as ScriptTab, label: 'Colab Hücresi' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={scriptTab === tab.id}
                  onClick={() => setScriptTab(tab.id)}
                  className={`rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap ${
                    scriptTab === tab.id
                      ? 'bg-white/[0.12] text-white'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <pre
              data-testid="model-installer-script-preview"
              className="max-h-72 overflow-auto rounded-xl border border-white/[0.06] bg-[#141417] p-4 font-mono text-[11px] leading-relaxed text-zinc-300"
            >
              {generatedScript}
            </pre>
          </div>
        )}
      </section>
    </div>
  );
}
