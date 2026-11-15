import { useMemo, useState } from 'react';
import {
  Play,
  ShieldAlert,
  ShieldCheck,
  Cpu,
  CheckCircle2,
  XCircle,
  Loader2,
  Send,
  CloudUpload,
  Archive,
  ExternalLink,
  AlertTriangle,
  Copy,
  Check,
  Download,
  ChevronDown,
} from 'lucide-react';
import {
  AuditFinding,
  AutomationConfig,
  BatchQueueItem,
  ColabProject,
  HfVerifyResult,
  TelemetrySnapshot,
} from '../types/automation';
import { GPU_SIMULATION_PRESETS } from '../data/auditFindings';
import { evaluateRuntimeGuardrail } from '../utils/guardrailEngine';
import {
  generateBatchQueueJson,
  generateColabNotebookJson,
  generateManifestJson,
  generatePreflightPython,
} from '../utils/codeGenerators';
import { buildAutomationZipBundle } from '../utils/zipBundle';
import {
  DriveSyncPlan,
  DriveSyncResult,
  executeDriveSync,
  prepareDriveSyncPlan,
} from '../services/driveSync';
import { GoogleSignInButton } from './GoogleSignInButton';
import { BatchQueuePanel } from './BatchQueuePanel';
import { TelemetryBridgePanel } from './TelemetryBridgePanel';

interface ColabConsoleViewProps {
  project: ColabProject;
  projects: ColabProject[];
  batchQueue: BatchQueueItem[];
  config: AutomationConfig;
  onUpdateConfig: (next: AutomationConfig) => void;
  findings: AuditFinding[];
  driveUserEmail: string | null;
  driveAccessToken: string | null;
  isSigningIn: boolean;
  onConnectDrive: () => Promise<void>;
  onDownloadFile: (filename: string, content: string | Blob, mime: string) => void;
  onAddBatchJob: (projectId: string, sceneLabel: string) => void;
  onReorderBatchJob: (index: number, direction: 'up' | 'down') => void;
  onRemoveBatchJob: (jobId: string) => void;
  onClearCompletedBatchJobs: () => void;
  onTriggerScheduledStart: (reason: string) => void;
  telemetry: TelemetrySnapshot;
  wsStatus: 'connecting' | 'connected' | 'disconnected';
  ingestToken: string;
  pingSending: boolean;
  onSendBridgePing: () => Promise<void>;
  onResetTelemetry: () => Promise<void>;
}

const MACRO_PIPELINE_STEPS = [
  {
    step: '01',
    title: 'Donanım Kontrolü',
    est: '~5 sn',
    detail: 'Doğru ekran kartı (A100) ve yüksek bellek kontrol edilir; uyumsuzsa kapatılır.',
  },
  {
    step: '02',
    title: 'Motor Kurulumu',
    est: '~25 sn',
    detail: 'Video üretim motoru ve hızlandırıcı eklentiler güvenli şekilde hazırlanır.',
  },
  {
    step: '03',
    title: 'Model İndirme',
    est: '~1-8 dk',
    detail: 'MiniMax H3 video modelleri HF_HUB_ENABLE_HF_TRANSFER=1 yüksek hızlı transferiyle indirilir.',
  },
  {
    step: '04',
    title: 'Sahne Hazırlığı',
    est: '~30 sn',
    detail: '3D graybox, stil görselleri ve sahne tarifiniz sıraya alınır.',
  },
  {
    step: '05',
    title: 'Video Üretimi',
    est: 'Değişken',
    detail: 'Bellek taşması korumasıyla tüm sahneler art arda MP4’e dönüştürülür.',
  },
  {
    step: '06',
    title: 'Teslim & Kapanış',
    est: '~15 sn',
    detail: 'Videolar bilgisayarınıza alınır, Drive açıksa yedeklenir ve oturum kapanır.',
  },
];

interface ParsedNotebookCell {
  cell_type: string;
  source: string[] | string;
}

export function ColabConsoleView({
  project,
  projects,
  batchQueue,
  config,
  onUpdateConfig,
  findings,
  driveUserEmail,
  driveAccessToken,
  isSigningIn,
  onConnectDrive,
  onDownloadFile,
  onAddBatchJob,
  onReorderBatchJob,
  onRemoveBatchJob,
  onClearCompletedBatchJobs,
  onTriggerScheduledStart,
  telemetry,
  wsStatus,
  ingestToken,
  pingSending,
  onSendBridgePing,
  onResetTelemetry,
}: ColabConsoleViewProps) {
  const [selectedGpuId, setSelectedGpuId] = useState<string>(GPU_SIMULATION_PRESETS[0].id);
  const [simulateHfOk, setSimulateHfOk] = useState<boolean>(true);
  const [hfSessionToken, setHfSessionToken] = useState<string>('');
  const [hfVerifyingTier, setHfVerifyingTier] = useState<'80gb' | '40gb' | null>(null);
  const [hfResults, setHfResults] = useState<{
    '80gb'?: HfVerifyResult;
    '40gb'?: HfVerifyResult;
  }>({});
  const [webhookTesting, setWebhookTesting] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const [runCounter, setRunCounter] = useState<number>(1);
  const [zipLoading, setZipLoading] = useState(false);
  const [copiedNb, setCopiedNb] = useState(false);
  const [activeMacroStep, setActiveMacroStep] = useState<string>('01');

  // Progressive disclosure toggles so customers don't face code walls by default
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showNotebookCode, setShowNotebookCode] = useState(false);
  const [notebookInspectMode, setNotebookInspectMode] = useState<'cells' | 'raw'>('cells');
  const [selectedCellIndex, setSelectedCellIndex] = useState<number>(0);

  // Drive sync states
  const [syncStage, setSyncStage] = useState<'idle' | 'scanning' | 'confirm' | 'uploading'>(
    'idle'
  );
  const [syncProgress, setSyncProgress] = useState<{
    label: string;
    completed: number;
    total: number;
  } | null>(null);
  const [pendingPlan, setPendingPlan] = useState<DriveSyncPlan | null>(null);
  const [syncResult, setSyncResult] = useState<DriveSyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const selectedGpu =
    GPU_SIMULATION_PRESETS.find((g) => g.id === selectedGpuId) ?? GPU_SIMULATION_PRESETS[0];

  const evaluation = useMemo(
    () => evaluateRuntimeGuardrail(selectedGpu, config, project.assets, simulateHfOk),
    [selectedGpu, config, project.assets, simulateHfOk, runCounter]
  );

  const telemetryOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  const notebookJson = useMemo(
    () =>
      generateColabNotebookJson(
        config,
        project.assets,
        findings,
        batchQueue,
        projects,
        telemetryOrigin,
        ingestToken
      ),
    [config, project.assets, findings, batchQueue, projects, telemetryOrigin, ingestToken]
  );

  const parsedCells = useMemo(() => {
    try {
      const parsed = JSON.parse(notebookJson) as { cells?: ParsedNotebookCell[] };
      return (parsed.cells ?? []).map((cell, idx) => {
        const text = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
        const rawLine =
          text
            .split('\n')
            .find((l) => l.trim().startsWith('#'))
            ?.replace(/^#+\s*/, '')
            .replace(/^@title\s*/i, '')
            .replace(/^\d+\.\s*/, '')
            .trim() || `Hücre ${idx + 1}`;
        const conciseTitle = rawLine.length > 26 ? `${rawLine.slice(0, 24)}…` : rawLine;
        return {
          index: idx,
          cellType: cell.cell_type,
          title: conciseTitle,
          code: text,
        };
      });
    } catch {
      return [];
    }
  }, [notebookJson]);

  const manifestJson = useMemo(
    () => generateManifestJson(config, project.assets),
    [config, project.assets]
  );
  const batchQueueJson = useMemo(
    () => generateBatchQueueJson(batchQueue, projects, config),
    [batchQueue, projects, config]
  );
  const preflightPy = useMemo(
    () => generatePreflightPython(config, findings),
    [config, findings]
  );

  const isAbort = evaluation.verdict === 'ABORT_UNASSIGN';
  const currentCell = parsedCells[selectedCellIndex] ?? parsedCells[0];

  async function verifyHuggingFaceRepo(tier: '80gb' | '40gb', repoId: string) {
    setHfVerifyingTier(tier);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (hfSessionToken.trim()) {
        headers['x-hf-token'] = hfSessionToken.trim();
      }
      const res = await fetch('/api/hf/verify', {
        method: 'POST',
        headers,
        body: JSON.stringify({ repoId }),
      });
      const data = (await res.json()) as HfVerifyResult;
      setHfResults((prev) => ({ ...prev, [tier]: data }));
      if (
        (tier === '80gb' && selectedGpu.vramGb >= 75) ||
        (tier === '40gb' && selectedGpu.vramGb >= 38 && selectedGpu.vramGb < 75)
      ) {
        setSimulateHfOk(Boolean(data.ok));
      }
    } catch (err) {
      setHfResults((prev) => ({
        ...prev,
        [tier]: {
          ok: false,
          status: 0,
          repoId,
          error: err instanceof Error ? err.message : 'Bağlantı hatası',
        },
      }));
    } finally {
      setHfVerifyingTier(null);
    }
  }

  async function handleTestWebhook() {
    setWebhookTesting(true);
    setWebhookStatus(null);
    try {
      const res = await fetch('/api/webhook/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl: config.webhookUrlPlaceholder }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      setWebhookStatus(
        data.ok
          ? { ok: true, text: 'Test bildirimi başarıyla gönderildi.' }
          : { ok: false, text: data.error || 'Bildirim gönderilemedi.' }
      );
    } catch {
      setWebhookStatus({ ok: false, text: 'Sunucu ile bağlantı kurulamadı.' });
    } finally {
      setWebhookTesting(false);
    }
  }

  async function handleDownloadZip() {
    setZipLoading(true);
    try {
      const blob = await buildAutomationZipBundle(
        config,
        project.assets,
        findings,
        project,
        batchQueue,
        projects,
        telemetryOrigin,
        ingestToken
      );
      onDownloadFile(`${project.id}_colab_kit.zip`, blob, 'application/zip');
    } finally {
      setZipLoading(false);
    }
  }

  async function runDriveUpload(plan: DriveSyncPlan) {
    if (!driveAccessToken) return;
    setSyncStage('uploading');
    setSyncError(null);
    try {
      const res = await executeDriveSync(
        driveAccessToken,
        plan,
        notebookJson,
        manifestJson,
        preflightPy,
        project.assets,
        (label, completed, total) => setSyncProgress({ label, completed, total })
      );
      setSyncResult(res);
      setPendingPlan(null);
      setSyncStage('idle');
    } catch (err) {
      setSyncError(
        err instanceof Error ? err.message : 'Google Drive yüklemesi başarısız oldu.'
      );
      setSyncStage('idle');
    }
  }

  async function handleStartDriveSync() {
    if (!driveAccessToken) {
      setSyncError('Önce Google hesabınızla giriş yapın.');
      return;
    }
    setSyncError(null);
    setSyncResult(null);
    setSyncStage('scanning');
    try {
      const plan = await prepareDriveSyncPlan(
        driveAccessToken,
        `${config.driveFolderName || 'ColabForge_Projects'}_${project.id}`,
        project.assets
      );
      if (plan.existingNamesToOverwrite.length > 0) {
        setPendingPlan(plan);
        setSyncStage('confirm');
      } else {
        await runDriveUpload(plan);
      }
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Drive klasörü hazırlanamadı.');
      setSyncStage('idle');
    }
  }

  async function handleCopyNotebook() {
    try {
      await navigator.clipboard.writeText(notebookJson);
      setCopiedNb(true);
      setTimeout(() => setCopiedNb(false), 1800);
    } catch {
      // Clipboard ignored
    }
  }

  function renderHfStatus(res?: HfVerifyResult) {
    if (!res) return null;
    if (res.ok) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Doğrulandı ({res.fileCount ?? 0} dosya ·{' '}
            {res.totalSafetensorsGb && res.totalSafetensorsGb > 0
              ? `${res.totalSafetensorsGb} GB`
              : `${res.totalRepoGb ?? 0} GB`}
            )
          </span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 text-xs text-rose-700">
        <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{res.error || `Hata (${res.status})`}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Studio Command & Clean 6-Stage Visual Timeline */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-blue-600">Otomatik Bulut Üretimi</span>
              <span aria-hidden="true">·</span>
              <span>Aktif Proje: {project.name}</span>
            </div>
            <h1 className="mt-1 text-xl font-bold text-slate-900">
              Üretim Başlatma, Sıra Yönetimi &amp; Donanım Kontrolü
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Oturum her zaman yüksek bellekli A100 ekran kartı ister. Uygun kart
              bulunamazsa kredinizi korumak için oturumu otomatik olarak kapatır.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {!driveAccessToken ? (
              <GoogleSignInButton
                onClick={onConnectDrive}
                disabled={isSigningIn}
                label={isSigningIn ? 'Bağlanıyor...' : 'Google ile Bağlan'}
              />
            ) : (
              <button
                type="button"
                onClick={handleStartDriveSync}
                disabled={syncStage === 'scanning' || syncStage === 'uploading'}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
              >
                {syncStage === 'scanning' || syncStage === 'uploading' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <CloudUpload className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {driveUserEmail ? 'Drive’a Gönder & Başlat' : 'Drive’a Aktar'}
              </button>
            )}

            <button
              type="button"
              onClick={handleDownloadZip}
              disabled={zipLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap"
            >
              <Archive className="h-3.5 w-3.5" aria-hidden="true" />
              {zipLoading ? 'Paketleniyor...' : 'Tam Paket (.zip)'}
            </button>
          </div>
        </div>

        {syncStage === 'uploading' && syncProgress && (
          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs text-blue-900">
            Yükleniyor: {syncProgress.label} ({syncProgress.completed}/{syncProgress.total})
          </div>
        )}
        {syncError && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-800">
            {syncError}
          </div>
        )}
        {syncResult && (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-emerald-900">
              <strong>{syncResult.uploadedCount} dosya</strong> aktarıldı. Çalıştırma
              defteriniz yüksek bellekli A100 ayarıyla hazır.
            </div>
            <a
              href={syncResult.colabLaunchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap shrink-0"
            >
              Colab A100 Oturumunu Aç
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        )}

        {/* Interactive 6-Stage Plain-Language Timeline */}
        <div className="mt-6 grid gap-2.5 border-t border-slate-200 pt-5 sm:grid-cols-2 lg:grid-cols-6">
          {MACRO_PIPELINE_STEPS.map((m) => {
            const active = activeMacroStep === m.step;
            return (
              <button
                key={m.step}
                type="button"
                onClick={() => setActiveMacroStep(m.step)}
                className={`rounded-lg border p-3 text-left transition-colors duration-150 space-y-1 ${
                  active
                    ? 'border-blue-600 bg-blue-50/50'
                    : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] tabular-nums">
                  <span className={active ? 'text-blue-600 font-bold' : 'text-slate-500 font-semibold'}>
                    Adım {m.step}
                  </span>
                  <span className="text-slate-400">{m.est}</span>
                </div>
                <div className="text-xs font-bold text-slate-900">{m.title}</div>
                <p className="text-[11px] leading-snug text-slate-600">{m.detail}</p>
              </button>
            );
          })}
        </div>
      </section>

      <TelemetryBridgePanel
        telemetry={telemetry}
        wsStatus={wsStatus}
        ingestToken={ingestToken}
        pingSending={pingSending}
        onSendBridgePing={onSendBridgePing}
        onResetTelemetry={onResetTelemetry}
      />

      <BatchQueuePanel
        queue={batchQueue}
        projects={projects}
        config={config}
        telemetry={telemetry}
        onUpdateConfig={onUpdateConfig}
        onTriggerScheduledStart={onTriggerScheduledStart}
        onAddJob={onAddBatchJob}
        onReorderJob={onReorderBatchJob}
        onRemoveJob={onRemoveBatchJob}
        onClearCompleted={onClearCompletedBatchJobs}
        onDownloadQueueManifest={() =>
          onDownloadFile(
            'batch_queue_manifest.json',
            batchQueueJson,
            'application/json'
          )
        }
      />

      {/* Preferences & Hardware Guardrail Simulator */}
      <div className="grid gap-6 lg:grid-cols-12 items-start">
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Üretim Tercihleri &amp; Korumalar
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Günlük kullanım için temel ayarlar. Değişiklikler otomatik olarak uygulanır.
            </p>
          </div>

          <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-slate-50">
            <label className="flex items-start justify-between gap-3 p-3.5 text-xs cursor-pointer">
              <span>
                <strong className="text-slate-900">Videoları Bilgisayara İndir</strong>
                <span className="mt-0.5 block text-[11px] text-slate-500">
                  Üretilen tüm videolar doğrudan proje çıktı klasörüne alınır.
                </span>
              </span>
              <input
                type="checkbox"
                checked={config.localOutputPrimary}
                onChange={(e) =>
                  onUpdateConfig({ ...config, localOutputPrimary: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-600 shrink-0"
              />
            </label>

            <label className="flex items-start justify-between gap-3 p-3.5 text-xs cursor-pointer">
              <span>
                <strong className="text-slate-900">Google Drive’a Yedekle</strong>
                <span className="mt-0.5 block text-[11px] text-slate-500">
                  Ek güvenlik olarak üretilen videoları Google Drive’a kopyalar.
                </span>
              </span>
              <input
                type="checkbox"
                checked={config.autoSyncOutputsToDrive}
                onChange={(e) =>
                  onUpdateConfig({ ...config, autoSyncOutputsToDrive: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-600 shrink-0"
              />
            </label>

            <label className="flex items-start justify-between gap-3 p-3.5 text-xs cursor-pointer">
              <span>
                <strong className="text-slate-900">Hızlı Model İndirme (hf_transfer)</strong>
                <span className="mt-0.5 block text-[11px] text-slate-500">
                  HF_HUB_ENABLE_HF_TRANSFER=1 bayrağıyla modelleri Colab veri merkezi ağından çoklu bağlantıyla çeker.
                </span>
              </span>
              <input
                type="checkbox"
                checked={config.enableHfTransfer}
                onChange={(e) =>
                  onUpdateConfig({ ...config, enableHfTransfer: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-600 shrink-0"
              />
            </label>

            <label className="flex items-start justify-between gap-3 p-3.5 text-xs cursor-pointer">
              <span>
                <strong className="text-slate-900">Bellek Taşması Koruması</strong>
                <span className="mt-0.5 block text-[11px] text-slate-500">
                  Video birleştirme sırasında sistem çökmesini önlemek için parçalı işler.
                </span>
              </span>
              <input
                type="checkbox"
                checked={config.comfyui.useTiledVaeDecode}
                onChange={(e) =>
                  onUpdateConfig({
                    ...config,
                    comfyui: { ...config.comfyui, useTiledVaeDecode: e.target.checked },
                  })
                }
                className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-600 shrink-0"
              />
            </label>

            <label className="flex items-start justify-between gap-3 p-3.5 text-xs cursor-pointer">
              <span>
                <strong className="text-slate-900">Hızlandırılmış Ön Ayar (Sage + Turbo)</strong>
                <span className="mt-0.5 block text-[11px] text-slate-500">
                  TeaCache ve 8 adımlı hızlı üretim modunu etkinleştirir (uyumlu LoRA gerekir).
                </span>
              </span>
              <input
                type="checkbox"
                checked={config.comfyui.enableTeaCache || config.comfyui.enableTurboLora}
                onChange={(e) =>
                  onUpdateConfig({
                    ...config,
                    comfyui: {
                      ...config.comfyui,
                      enableTeaCache: e.target.checked,
                      enableTurboLora: e.target.checked,
                    },
                  })
                }
                className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-600 shrink-0"
              />
            </label>

            <label className="flex items-start justify-between gap-3 p-3.5 text-xs cursor-pointer">
              <span>
                <strong className="text-slate-900">Yanlış GPU’da Krediyi Koru</strong>
                <span className="mt-0.5 block text-[11px] text-slate-500">
                  A100 dışı bir kart verilirse oturumu boşa kredi yakmadan hemen kapatır.
                </span>
              </span>
              <input
                type="checkbox"
                checked={config.strictKillOnMismatch}
                onChange={(e) =>
                  onUpdateConfig({ ...config, strictKillOnMismatch: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-600 shrink-0"
              />
            </label>

            <label className="flex items-start justify-between gap-3 p-3.5 text-xs cursor-pointer">
              <span>
                <strong className="text-slate-900">Sıra Bitince Oturumu Kapat</strong>
                <span className="mt-0.5 block text-[11px] text-slate-500">
                  Tüm videolar indikten sonra Colab makinesini otomatik serbest bırakır.
                </span>
              </span>
              <input
                type="checkbox"
                checked={config.autoUnassignOnFinish}
                onChange={(e) =>
                  onUpdateConfig({ ...config, autoUnassignOnFinish: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-600 shrink-0"
              />
            </label>
          </div>

          {/* Collapsible Advanced Settings */}
          <div className="rounded-lg border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => setShowAdvancedSettings((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <span>Gelişmiş Model &amp; Bildirim Ayarları</span>
              <ChevronDown
                className={`h-4 w-4 text-slate-400 transition-transform ${
                  showAdvancedSettings ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>

            {showAdvancedSettings && (
              <div className="border-t border-slate-200 p-4 space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="repo-80gb"
                    className="block text-xs font-medium text-slate-700"
                  >
                    80 GB GPU Model Adresi
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="repo-80gb"
                      type="text"
                      value={config.modelMatrix.repo80Gb}
                      onChange={(e) =>
                        onUpdateConfig({
                          ...config,
                          modelMatrix: { ...config.modelMatrix, repo80Gb: e.target.value },
                        })
                      }
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => verifyHuggingFaceRepo('80gb', config.modelMatrix.repo80Gb)}
                      disabled={hfVerifyingTier === '80gb'}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                    >
                      {hfVerifyingTier === '80gb' && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      )}
                      Doğrula
                    </button>
                  </div>
                  {renderHfStatus(hfResults['80gb'])}
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="repo-40gb"
                    className="block text-xs font-medium text-slate-700"
                  >
                    40 GB GPU Model Adresi
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="repo-40gb"
                      type="text"
                      value={config.modelMatrix.repo40Gb}
                      onChange={(e) =>
                        onUpdateConfig({
                          ...config,
                          modelMatrix: { ...config.modelMatrix, repo40Gb: e.target.value },
                        })
                      }
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => verifyHuggingFaceRepo('40gb', config.modelMatrix.repo40Gb)}
                      disabled={hfVerifyingTier === '40gb'}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                    >
                      {hfVerifyingTier === '40gb' && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      )}
                      Doğrula
                    </button>
                  </div>
                  {renderHfStatus(hfResults['40gb'])}
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="hf-session-token"
                    className="block text-xs font-medium text-slate-700"
                  >
                    HuggingFace Anahtarı (İsteğe Bağlı Anlık Test)
                  </label>
                  <input
                    id="hf-session-token"
                    type="password"
                    autoComplete="off"
                    placeholder="hf_..."
                    value={hfSessionToken}
                    onChange={(e) => setHfSessionToken(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <label className="flex items-center justify-between gap-3 text-xs text-slate-700 cursor-pointer">
                  <span>İş bitince Discord/Slack bildirimi gönder</span>
                  <input
                    type="checkbox"
                    checked={config.webhookNotifyOnFailure}
                    onChange={(e) =>
                      onUpdateConfig({ ...config, webhookNotifyOnFailure: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                  />
                </label>

                {config.webhookNotifyOnFailure && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="url"
                        aria-label="HTTPS Webhook URL"
                        placeholder="https://discord.com/api/webhooks/..."
                        value={config.webhookUrlPlaceholder}
                        onChange={(e) =>
                          onUpdateConfig({ ...config, webhookUrlPlaceholder: e.target.value })
                        }
                        className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleTestWebhook}
                        disabled={webhookTesting}
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        <Send className="h-3 w-3" aria-hidden="true" />
                        Test Et
                      </button>
                    </div>
                    {webhookStatus && (
                      <p
                        className={`text-xs ${
                          webhookStatus.ok ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {webhookStatus.text}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Right: Hardware Guardrail Simulator */}
        <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7">
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                GPU Güvenlik Testi (Simülatör)
              </h2>
              <p className="text-xs text-slate-600">
                Colab farklı bir ekran kartı verirse sistemin nasıl karar verdiğini önceden
                test edin.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRunCounter((c) => c + 1)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              Testi Çalıştır
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {GPU_SIMULATION_PRESETS.map((gpu) => {
              const active = selectedGpuId === gpu.id;
              return (
                <button
                  key={gpu.id}
                  type="button"
                  onClick={() => setSelectedGpuId(gpu.id)}
                  className={`flex items-start justify-between rounded-lg border p-3.5 text-left transition-colors duration-150 ${
                    active
                      ? 'border-blue-600 bg-blue-50/50'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <Cpu
                        className={`h-3.5 w-3.5 ${active ? 'text-blue-600' : 'text-slate-400'}`}
                        aria-hidden="true"
                      />
                      {gpu.label}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-slate-500 tabular-nums">
                      {gpu.vramGb} GB VRAM · {gpu.systemRamGb} GB RAM · {gpu.diskFreeGb} GB Disk
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div
            data-testid="guardrail-verdict-banner"
            className={`rounded-xl border p-4 ${
              isAbort
                ? 'border-rose-200 bg-rose-50 text-rose-900'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900'
            }`}
          >
            <div className="flex items-start gap-3">
              {isAbort ? (
                <ShieldAlert className="mt-0.5 h-5 w-5 text-rose-600 shrink-0" aria-hidden="true" />
              ) : (
                <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-600 shrink-0" aria-hidden="true" />
              )}
              <div className="w-full space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold">{evaluation.verdict}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-xs font-semibold">
                    {evaluation.shouldTerminateSession
                      ? 'Kredi Yakmadan Otomatik Kapatılacak'
                      : `Model: ${evaluation.selectedModelRepo}`}
                  </span>
                </div>
                <p className="text-xs leading-relaxed">{evaluation.summary}</p>
                {!evaluation.shouldTerminateSession && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between font-mono text-[11px] tabular-nums">
                      <span>
                        VRAM: {evaluation.estimatedVramUsageGb} GB / {selectedGpu.vramGb} GB
                      </span>
                      <span>Güvenlik Payı: {evaluation.vramHeadroomGb} GB</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-emerald-200">
                      <div
                        className="h-full rounded-full bg-emerald-600 transition-all duration-200"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round((evaluation.estimatedVramUsageGb / selectedGpu.vramGb) * 100)
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-slate-50">
            {evaluation.checks.map((step) => (
              <div key={step.id} className="flex items-start justify-between gap-4 px-4 py-3">
                <div>
                  <div className="text-xs font-bold text-slate-900">{step.label}</div>
                  <div className="mt-0.5 text-xs text-slate-600">{step.detail}</div>
                </div>
                <span
                  className={`text-[11px] font-bold uppercase shrink-0 ${
                    step.status === 'pass'
                      ? 'text-emerald-700'
                      : step.status === 'warn'
                        ? 'text-amber-700'
                        : 'text-rose-700'
                  }`}
                >
                  {step.status === 'pass'
                    ? 'UYGUN'
                    : step.status === 'warn'
                      ? 'UYARLANDI'
                      : 'DURDURULDU'}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Collapsible Notebook Code Inspector (hidden by default for visual simplicity) */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <button
            type="button"
            onClick={() => setShowNotebookCode((v) => !v)}
            className="flex items-center gap-2 text-left"
          >
            <ChevronDown
              className={`h-4 w-4 text-slate-500 transition-transform ${
                showNotebookCode ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Teknik Detay: Oluşturulan Colab Çalıştırma Dosyası (.ipynb)
              </h2>
              <p className="text-xs text-slate-500">
                İsterseniz arka planda otomatik üretilen adımları buradan inceleyebilirsiniz.
              </p>
            </div>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyNotebook}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {copiedNb ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
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
              onClick={() =>
                onDownloadFile(
                  'minimax_h3_colab_automation.ipynb',
                  notebookJson,
                  'application/x-ipynb+json'
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              .ipynb İndir
            </button>
          </div>
        </div>

        {showNotebookCode && (
          <div className="border-t border-slate-200 p-6 space-y-4">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setNotebookInspectMode('cells')}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                  notebookInspectMode === 'cells'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Adım Adım ({parsedCells.length})
              </button>
              <button
                type="button"
                onClick={() => setNotebookInspectMode('raw')}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                  notebookInspectMode === 'raw'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Ham JSON
              </button>
            </div>

            {notebookInspectMode === 'cells' && parsedCells.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 overflow-x-auto rounded-lg border border-slate-200 bg-slate-100 p-1">
                  {parsedCells.map((c) => (
                    <button
                      key={c.index}
                      type="button"
                      onClick={() => setSelectedCellIndex(c.index)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
                        (currentCell?.index ?? 0) === c.index
                          ? 'bg-white text-slate-900 font-semibold shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Adım {c.index + 1} · {c.title}
                    </button>
                  ))}
                </div>
                {currentCell && (
                  <pre className="max-h-80 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-[11px] leading-relaxed text-slate-800">
                    {currentCell.code}
                  </pre>
                )}
              </div>
            ) : (
              <pre className="max-h-80 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-[11px] leading-relaxed text-slate-800">
                {notebookJson}
              </pre>
            )}
          </div>
        )}
      </section>

      {syncStage === 'confirm' && pendingPlan && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="overwrite-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600 shrink-0" aria-hidden="true" />
              <div className="space-y-2">
                <h2 id="overwrite-dialog-title" className="text-base font-bold text-slate-900">
                  Drive’daki Mevcut Dosyalar Güncellensin mi?
                </h2>
                <p className="text-xs leading-relaxed text-slate-600">
                  Aynı ada sahip <strong>{pendingPlan.existingNamesToOverwrite.length}</strong>{' '}
                  dosya bulundu:
                </p>
                <ul className="max-h-36 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-[11px] text-slate-700 space-y-1">
                  {pendingPlan.existingNamesToOverwrite.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setPendingPlan(null);
                  setSyncStage('idle');
                }}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={() => runDriveUpload(pendingPlan)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Onayla ve Güncelle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
