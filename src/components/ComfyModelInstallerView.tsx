import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  HardDrive,
  Link2,
  Loader2,
  RefreshCw,
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
          ? 'uv pip + Torch/NumPy kilidi hazırlanıyor...'
          : 'pip paket ortamı hazırlanıyor...',
      },
      {
        pct: 42,
        label: syncedConfig.enableHfTransfer
          ? `HF_HUB_ENABLE_HF_TRANSFER=1 ile ${variant.files[0]?.label ?? spec.name} çekiliyor...`
          : `${variant.files[0]?.label ?? spec.name} indiriliyor...`,
      },
      {
        pct: 74,
        label: `${variant.files.length} ağırlık dosyası ${
          target === 'drive' ? 'Drive önbelleğine' : 'oturum NVMe diskine'
        } yazılıyor...`,
      },
      {
        pct: 94,
        label:
          target === 'drive' && syncedConfig.modelInstaller.createDriveSymlinks
            ? 'ComfyUI/models klasörüne Drive sembolik bağı (ln -s) oluşturuluyor...'
            : 'ComfyUI/models dizin yapısı doğrulanıyor...',
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
    <div className="space-y-6 min-w-0">
      {/* Header & Global Storage / Acceleration Controls */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 space-y-5 min-w-0">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-blue-600">ComfyUI Model Yükleyici</span>
              <span aria-hidden="true">·</span>
              <span>MiniMax-H3 · Wan 2.2 · LTX 2.3</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{installedCount}/3 model hazırlandı</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 text-balance">
              Ana Video Modellerini Tek Tıkla Drive veya NVMe Diskine Kurun
            </h1>
            <p className="text-xs leading-relaxed text-slate-600 sm:text-sm">
              Seçtiğiniz model ağırlıkları <code className="font-mono text-slate-800">uv</code> ile
              hızlandırılmış bağımlılık kurulumu ve{' '}
              <code className="font-mono text-slate-800">HF_HUB_ENABLE_HF_TRANSFER=1</code> motoruyla
              ister Colab oturum NVMe diskine (<code className="font-mono">/content</code>), ister
              kalıcı Google Drive önbelleğine sembolik bağla indirilir.
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
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap"
            >
              <span>Üretim &amp; GPU’ya Geç</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Storage Target & Acceleration Toolbar */}
        <div className="grid gap-4 border-t border-slate-200 pt-5 lg:grid-cols-12 lg:items-center">
          <div className="space-y-1.5 lg:col-span-5">
            <span className="block text-xs font-semibold text-slate-700">
              Varsayılan Kurulum Hedefi
            </span>
            <div
              role="group"
              aria-label="Model kurulum depolama hedefi"
              className="grid grid-cols-2 gap-1.5 rounded-lg border border-slate-200 bg-slate-100 p-1"
            >
              <button
                type="button"
                aria-pressed={modelInstaller.installTarget === 'nvme'}
                onClick={() => handleSelectTarget('nvme')}
                className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                  modelInstaller.installTarget === 'nvme'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Zap className="h-3.5 w-3.5 text-blue-600 shrink-0" aria-hidden="true" />
                <span>Oturum NVMe Diski</span>
              </button>
              <button
                type="button"
                aria-pressed={modelInstaller.installTarget === 'drive'}
                onClick={() => handleSelectTarget('drive')}
                className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                  modelInstaller.installTarget === 'drive'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <HardDrive className="h-3.5 w-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
                <span>Google Drive (Kalıcı)</span>
              </button>
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:col-span-7 xl:grid-cols-4">
            <label className="flex items-start justify-between gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs cursor-pointer">
              <span>
                <strong className="block text-slate-900">hf_transfer</strong>
                <span className="text-[11px] text-slate-500">Çoklu parça hızı</span>
              </span>
              <input
                type="checkbox"
                aria-label="hf_transfer hızlandırmasını aç"
                checked={config.enableHfTransfer}
                onChange={(e) =>
                  onUpdateConfig({ ...config, enableHfTransfer: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-600 shrink-0"
              />
            </label>

            <label className="flex items-start justify-between gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs cursor-pointer">
              <span>
                <strong className="block text-slate-900">uv Kurulumu</strong>
                <span className="text-[11px] text-slate-500">Hızlı paket motoru</span>
              </span>
              <input
                type="checkbox"
                aria-label="uv hızlandırıcı kurulumu aç"
                checked={modelInstaller.useUvAcceleration}
                onChange={(e) =>
                  updateInstaller({ useUvAcceleration: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-600 shrink-0"
              />
            </label>

            <label className="flex items-start justify-between gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs cursor-pointer">
              <span>
                <strong className="block text-slate-900">Özel Düğümler</strong>
                <span className="text-[11px] text-slate-500">VHS · KJ · LTXVideo</span>
              </span>
              <input
                type="checkbox"
                aria-label="Önerilen ComfyUI düğümlerini kur"
                checked={modelInstaller.installRecommendedNodes}
                onChange={(e) =>
                  updateInstaller({ installRecommendedNodes: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-600 shrink-0"
              />
            </label>

            <label className="flex items-start justify-between gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs cursor-pointer">
              <span>
                <strong className="block text-slate-900">Drive Symlink</strong>
                <span className="text-[11px] text-slate-500">ln -s otomatik bağ</span>
              </span>
              <input
                type="checkbox"
                aria-label="Drive için sembolik bağ oluştur"
                checked={modelInstaller.createDriveSymlinks}
                onChange={(e) =>
                  updateInstaller({ createDriveSymlinks: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-600 shrink-0"
              />
            </label>
          </div>
        </div>

        {/* Active Target Path Summary */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-700 min-w-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
            <span className="font-semibold text-slate-900 shrink-0">Aktif Hedef Dizin:</span>
            <code className="break-all font-mono text-[11px] text-blue-700">
              {resolvedPaths.activeDownloadDir}
            </code>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 tabular-nums">
            <span>Aktif Pipeline Modeli: {selectedModel.name}</span>
            {driveUserEmail && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-700 font-medium">Drive: {driveUserEmail}</span>
              </>
            )}
          </div>
        </div>
      </section>

      {/* 3-Column Core Models Grid: MiniMax-H3, Wan 2.2, LTX 2.3 */}
      <section aria-label="ComfyUI Ana Modelleri" className="grid gap-5 lg:grid-cols-3 min-w-0">
        {COMFY_MODEL_CATALOG.map((model) => {
          const variantId = modelInstaller.selectedVariants[model.id] ?? 'balanced_40gb';
          const variant = model.variants[variantId];
          const isSelectedForPipeline = modelInstaller.selectedModelId === model.id;
          const installed = modelInstaller.installedModels[model.id];
          const isInstallingThis = installProgress?.modelId === model.id;
          const verifyState = verifyResults[model.id];

          return (
            <article
              key={model.id}
              data-testid={`model-card-${model.id}`}
              className={`flex min-w-0 flex-col justify-between rounded-xl border bg-white p-5 transition-colors ${
                isSelectedForPipeline ? 'border-blue-600' : 'border-slate-200'
              }`}
            >
              <div className="space-y-4 min-w-0">
                {/* Card Header */}
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-lg font-bold text-slate-900">{model.name}</h2>
                    {installed ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 shrink-0">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>
                          {installed.target === 'drive' ? 'Drive’da Hazır' : 'NVMe’de Hazır'}
                        </span>
                      </span>
                    ) : isSelectedForPipeline ? (
                      <span className="text-xs font-semibold text-blue-600 shrink-0">
                        Aktif Pipeline
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-slate-500">
                    <span>{model.repoId}</span>
                    <span aria-hidden="true">·</span>
                    <span>{model.recommendedGpu}</span>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-600">{model.summary}</p>
                </div>

                {/* Variant Switcher */}
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-500 tabular-nums">
                    <span className="font-semibold text-slate-700">Sürüm &amp; Nicemleme</span>
                    <span>
                      ~{variant.totalSizeGb} GB · Min {variant.minVramGb} GB VRAM
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 min-w-0">
                    {(['balanced_40gb', 'quality_80gb'] as ModelVariantId[]).map((vId) => {
                      const vSpec = model.variants[vId];
                      const active = variantId === vId;
                      return (
                        <button
                          key={vId}
                          type="button"
                          aria-pressed={active}
                          onClick={() => handleSelectVariant(model.id, vId)}
                          className={`min-w-0 rounded-lg border px-2.5 py-1.5 text-left text-[11px] transition-colors ${
                            active
                              ? 'border-slate-900 bg-slate-900 font-semibold text-white'
                              : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                          }`}
                        >
                          <div className="truncate">{vSpec.label}</div>
                          <div
                            className={`text-[10px] tabular-nums ${
                              active ? 'text-slate-300' : 'text-slate-500'
                            }`}
                          >
                            {vSpec.totalSizeGb} GB
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Component Files List */}
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50">
                  {variant.files.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-[11px]"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-800">{file.label}</div>
                        <div className="truncate font-mono text-[10px] text-slate-500">
                          {file.relativeComfyPath}
                        </div>
                      </div>
                      <span className="font-mono text-[11px] font-semibold text-slate-700 tabular-nums shrink-0">
                        {file.sizeGb.toFixed(1)} GB
                      </span>
                    </div>
                  ))}
                </div>

                {/* Recommended ComfyUI Nodes */}
                <div className="text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-700">ComfyUI Düğümleri: </span>
                  <span>{model.customNodes.map((n) => n.folder).join(' · ')}</span>
                </div>
              </div>

              {/* Status + 1-Click Actions Footer */}
              <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
                {isInstallingThis && installProgress && (
                  <div
                    data-testid={`model-progress-${model.id}`}
                    className="space-y-1.5 rounded-lg border border-blue-200 bg-blue-50 p-3"
                  >
                    <div className="flex items-center justify-between text-[11px] font-semibold text-blue-900 tabular-nums">
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden="true" />
                        <span>
                          {installProgress.target === 'drive'
                            ? 'Drive’a Kuruluyor'
                            : 'NVMe’ye Kuruluyor'}
                        </span>
                      </span>
                      <span>%{installProgress.pct}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-200">
                      <div
                        className="h-full rounded-full bg-blue-600 transition-all duration-150"
                        style={{ width: `${installProgress.pct}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-blue-800">{installProgress.stageLabel}</p>
                  </div>
                )}

                {installed && !isInstallingThis && (
                  <div className="flex items-start justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900">
                    <div className="min-w-0 space-y-0.5">
                      <div className="font-semibold">
                        {installed.target === 'drive'
                          ? 'Google Drive + ComfyUI Symlink Hazır'
                          : 'Oturum NVMe Diskinde Hazır'}
                      </div>
                      <div className="truncate font-mono text-[10px] text-emerald-800">
                        {installed.installPath}
                      </div>
                      <div className="text-[10px] text-emerald-700 tabular-nums">
                        {installed.installedAt}
                        {installed.acceleratedWithHfTransfer ? ' · hf_transfer' : ''}
                        {installed.acceleratedWithUv ? ' · uv' : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={`${model.name} kurulum kaydını temizle`}
                      onClick={() => handleClearInstalledModel(model.id)}
                      className="rounded p-1 text-emerald-700 hover:bg-emerald-100 hover:text-rose-700 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                )}

                {verifyState && (
                  <div
                    className={`flex items-center gap-1.5 text-[11px] ${
                      verifyState.ok ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {verifyState.ok ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    )}
                    <span className="truncate">
                      {verifyState.ok
                        ? `HF Doğrulandı (${verifyState.fileCount ?? 0} dosya)`
                        : verifyState.error || `HF Hatası (${verifyState.status})`}
                    </span>
                  </div>
                )}

                {/* Primary 1-Click Install Buttons: NVMe vs Drive */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={Boolean(installProgress)}
                    onClick={() => handleStartOneClickInstall(model.id, 'nvme')}
                    aria-label={`${model.name} modelini NVMe diskine kur`}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap ${
                      modelInstaller.installTarget === 'nvme'
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <Zap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>NVMe’ye Kur</span>
                  </button>

                  <button
                    type="button"
                    disabled={Boolean(installProgress)}
                    onClick={() => handleStartOneClickInstall(model.id, 'drive')}
                    aria-label={`${model.name} modelini Google Drive'a kur`}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap ${
                      modelInstaller.installTarget === 'drive'
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <HardDrive className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>Drive’a Kur</span>
                  </button>
                </div>

                {/* Secondary Controls: Pipeline Sync + Live Repo Verify */}
                <div className="flex items-center justify-between gap-2 pt-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => handleActivateModelForPipeline(model.id)}
                    className={`inline-flex items-center gap-1 font-semibold transition-colors whitespace-nowrap ${
                      isSelectedForPipeline
                        ? 'text-blue-600'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Cpu className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      {isSelectedForPipeline ? 'Aktif Pipeline Seçili' : 'Aktif Pipeline Yap'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={verifyingModelId === model.id}
                    onClick={() => handleVerifyRepo(model.id, model.repoId)}
                    className="inline-flex items-center gap-1 font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
                  >
                    {verifyingModelId === model.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    ) : (
                      <RefreshCw className="h-3 w-3" aria-hidden="true" />
                    )}
                    <span>Repo Doğrula</span>
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {/* Bottom Section: Accelerated Script Preview (uv + hf_transfer) */}
      <section
        aria-labelledby="model-script-heading"
        className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-blue-600 shrink-0" aria-hidden="true" />
              <h2 id="model-script-heading" className="text-base font-bold text-slate-900">
                Hızlandırılmış Kurulum Scripti ({selectedModel.name} ·{' '}
                {modelInstaller.installTarget === 'drive' ? 'Google Drive + Symlink' : 'NVMe'})
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {selectedVariant.label} · {selectedVariant.totalSizeGb} GB ·{' '}
              {modelInstaller.useUvAcceleration ? 'uv pip aktif' : 'standart pip'} ·{' '}
              {config.enableHfTransfer ? 'HF_HUB_ENABLE_HF_TRANSFER=1' : 'standart HTTP'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyScript}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              {copiedScript ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                  <span>Kopyalandı</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Scripti Kopyala</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleDownloadScript}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{scriptTab === 'bash' ? '.sh İndir' : '.py İndir'}</span>
            </button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-12 items-start">
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs lg:col-span-4">
            <div className="font-bold text-slate-900">Kurulum Özeti &amp; Hız Kazancı</div>
            <div className="space-y-2 text-slate-600">
              <div className="flex items-start justify-between gap-2">
                <span>Tahmini İndirme</span>
                <strong className="font-mono text-slate-900 tabular-nums">
                  ~
                  {modelInstaller.installTarget === 'drive'
                    ? selectedVariant.estimatedDownloadMinDrive
                    : selectedVariant.estimatedDownloadMinNvme}{' '}
                  dk
                </strong>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span>Gerekli Disk Alanı</span>
                <strong className="font-mono text-slate-900 tabular-nums">
                  {selectedVariant.diskRequiredGb} GB
                </strong>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span>ComfyUI Kökü</span>
                <strong className="font-mono text-[11px] text-slate-800 text-right break-all">
                  {resolvedPaths.nvmeModelsDir}
                </strong>
              </div>
              {modelInstaller.installTarget === 'drive' && (
                <div className="flex items-start justify-between gap-2 border-t border-slate-200 pt-2">
                  <span className="inline-flex items-center gap-1 text-slate-700 font-medium">
                    <Link2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
                    <span>Drive Önbellek</span>
                  </span>
                  <strong className="font-mono text-[11px] text-emerald-800 text-right break-all">
                    {resolvedPaths.driveModelDir}
                  </strong>
                </div>
              )}
            </div>
            <p className="border-t border-slate-200 pt-2.5 text-[11px] leading-relaxed text-slate-500">
              Seçili ayarlar aynı zamanda üst menüden indirilen{' '}
              <code className="font-mono text-slate-700">.ipynb</code> defterinin 1, 2 ve 3.
              hücrelerine otomatik işlenir.
            </p>
          </div>

          <div className="space-y-3 lg:col-span-8 min-w-0">
            <div
              role="tablist"
              aria-label="Kurulum script formatı"
              className="inline-flex max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-slate-100 p-1"
            >
              {[
                { id: 'python' as ScriptTab, label: 'Colab Python (.py)' },
                { id: 'bash' as ScriptTab, label: 'Terminal Bash (.sh)' },
                { id: 'colab' as ScriptTab, label: 'Colab Hücre Kodu' },
              ].map((tab) => {
                const active = scriptTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setScriptTab(tab.id)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <pre
              data-testid="model-installer-script-preview"
              className="max-h-80 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-[11px] leading-relaxed text-slate-800"
            >
              {generatedScript}
            </pre>
          </div>
        </div>
      </section>
    </div>
  );
}
