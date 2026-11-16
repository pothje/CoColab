import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Check,
  CheckCircle2,
  ChevronDown,
  CloudUpload,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  Layers,
  Loader2,
  Play,
  Send,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  XCircle,
} from 'lucide-react';
import {
  AuditFinding,
  AutomationConfig,
  BatchQueueItem,
  ColabProject,
  DeliveryPresetId,
  HfVerifyResult,
  TelemetrySnapshot,
} from '../types/automation';
import type { BridgeRuntimePreset } from '../hooks/useColabTelemetry';
import { GPU_SIMULATION_PRESETS } from '../data/auditFindings';
import { evaluateRuntimeGuardrail } from '../utils/guardrailEngine';
import { inspectProjectPipelineReadiness } from '../utils/claudeBundle';
import {
  evaluateGpuHealthCheck,
  type GpuHealthHistoryEntry,
  type HealthCheckTrigger,
} from '../utils/gpuHealthCheck';
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
import { GpuHealthCheckPanel } from './GpuHealthCheckPanel';

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
  onAddBatchJob: (
    projectId: string,
    sceneLabel: string,
    deliveryPreset?: DeliveryPresetId
  ) => void;
  onAddEtsyAndSocialPair?: (projectId: string) => void;
  onReorderBatchJob: (index: number, direction: 'up' | 'down') => void;
  onRemoveBatchJob: (jobId: string) => void;
  onClearCompletedBatchJobs: () => void;
  onTriggerScheduledStart: (reason: string) => void;
  telemetry: TelemetrySnapshot;
  wsStatus: 'connecting' | 'connected' | 'disconnected';
  ingestToken: string;
  pingSending: boolean;
  onSendBridgePing: (preset?: BridgeRuntimePreset) => Promise<void>;
  onResetTelemetry: () => Promise<void>;
  onSelectProject: (projectId: string) => void;
  onUpdateProjectGpuPolicy: (
    projectId: string,
    policy: ColabProject['targetGpuPolicy']
  ) => void;
}

interface ParsedNotebookCell {
  cell_type: string;
  source: string[] | string;
}

function AppleToggle({
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
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#0A84FF]/60 ${
        checked ? 'bg-[#30D158]' : 'bg-zinc-700'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
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
  onAddEtsyAndSocialPair,
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
  onSelectProject,
  onUpdateProjectGpuPolicy,
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

  // GPU Health Check state
  const [healthHistory, setHealthHistory] = useState<GpuHealthHistoryEntry[]>([]);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const prevHealthSnapshotRef = useRef<string>('');

  // Single unified advanced disclosure (keeps primary Üretim view ultra calm)
  const [showAdvancedDrawer, setShowAdvancedDrawer] = useState(false);
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

  const readiness = useMemo(
    () => inspectProjectPipelineReadiness(project, config.blenderRender),
    [project, config.blenderRender]
  );

  const healthResult = useMemo(
    () => evaluateGpuHealthCheck(project, telemetry, config),
    [project, telemetry, config]
  );

  const recordHealthCheckEntry = useCallback(
    (trigger: HealthCheckTrigger) => {
      const checkedAt = new Date().toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      setLastCheckedAt(checkedAt);
      const entry: GpuHealthHistoryEntry = {
        id: `hc-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        checkedAt,
        trigger,
        projectName: project.name,
        gpuName: telemetry.gpuName ?? 'Runtime Bağlı Değil',
        allocatedVramGb: telemetry.vramTotalGb,
        requiredPolicy: project.targetGpuPolicy,
        status: healthResult.status,
        headline: healthResult.headline,
      };
      setHealthHistory((prev) => [entry, ...prev].slice(0, 10));
    },
    [
      project.name,
      project.targetGpuPolicy,
      telemetry.gpuName,
      telemetry.vramTotalGb,
      healthResult.status,
      healthResult.headline,
    ]
  );

  useEffect(() => {
    if (!healthResult.isConnected) {
      prevHealthSnapshotRef.current = `disconnected|${project.id}|${project.targetGpuPolicy}`;
      return;
    }

    const runtimeKey = `${telemetry.sessionId ?? ''}|${telemetry.vramTotalGb ?? ''}|${telemetry.systemRamTotalGb ?? ''}|${telemetry.lastUpdatedAt ?? ''}`;
    const fullKey = `${runtimeKey}|${project.id}|${project.targetGpuPolicy}|${config.requireHighRam}|${config.minHighRamGb}`;

    if (prevHealthSnapshotRef.current === fullKey) {
      return;
    }

    const wasRuntimeSame = prevHealthSnapshotRef.current.startsWith(runtimeKey);
    prevHealthSnapshotRef.current = fullKey;
    recordHealthCheckEntry(wasRuntimeSame ? 'project_switch' : 'auto_connect');
  }, [
    healthResult.isConnected,
    telemetry.sessionId,
    telemetry.vramTotalGb,
    telemetry.systemRamTotalGb,
    telemetry.lastUpdatedAt,
    project.id,
    project.targetGpuPolicy,
    config.requireHighRam,
    config.minHighRamGb,
    recordHealthCheckEntry,
  ]);

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
        <div className="flex items-center gap-1.5 text-xs text-[#30D158]">
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
      <div className="flex items-center gap-1.5 text-xs text-[#FF453A]">
        <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{res.error || `Hata (${res.status})`}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-[#F5F5F7]">
      {/* 1. Calm Launch Card */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#141417] p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-medium text-[#0A84FF]">Bulut Üretim Merkezi</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#F5F5F7]">
              {project.name}
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Drive’a aktarın veya çalışma paketini indirip Google Colab A100 üzerinde çalıştırın.
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
                className="inline-flex items-center gap-2 rounded-full bg-[#0A84FF] px-5 py-2 text-xs font-semibold text-white transition-colors hover:brightness-110 disabled:opacity-50 whitespace-nowrap"
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
              className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-[#1C1C20] px-4 py-2 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/[0.08] whitespace-nowrap"
            >
              <Archive className="h-3.5 w-3.5" aria-hidden="true" />
              {zipLoading ? 'Paketleniyor...' : 'Tam Paket (.zip)'}
            </button>
          </div>
        </div>

        {syncStage === 'uploading' && syncProgress && (
          <div className="mt-4 rounded-xl border border-[#0A84FF]/30 bg-[#0A84FF]/10 px-4 py-2.5 text-xs text-blue-200">
            Yükleniyor: {syncProgress.label} ({syncProgress.completed}/{syncProgress.total})
          </div>
        )}
        {syncError && (
          <div className="mt-4 rounded-xl border border-[#FF453A]/30 bg-[#FF453A]/10 px-4 py-2.5 text-xs text-rose-200">
            {syncError}
          </div>
        )}
        {syncResult && (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-[#30D158]/30 bg-[#30D158]/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-emerald-100">
              <strong>{syncResult.uploadedCount} dosya</strong> aktarıldı. Çalıştırma
              defteriniz A100 ayarıyla hazır.
            </div>
            <a
              href={syncResult.colabLaunchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#30D158] px-4 py-2 text-xs font-semibold text-black hover:brightness-110 whitespace-nowrap shrink-0"
            >
              <span className="sr-only">Colab açılış bağlantısı</span>
              Colab A100 Oturumunu Aç
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        )}

        {/* Zero-Config Pipeline Readiness & 1-Click Etsy+Reels Dual Queue */}
        <div
          data-testid="colab-zero-config-strip"
          className="mt-5 flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-[#0E0E11] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-zinc-300">
            <span className="font-medium text-[#F5F5F7]">
              {readiness.deliveryPreset.label}
            </span>
            <span aria-hidden="true" className="text-zinc-600">·</span>
            <span className="font-mono text-[11px] text-zinc-400 tabular-nums">
              {readiness.deliveryPreset.width}×{readiness.deliveryPreset.height}
            </span>
            <span aria-hidden="true" className="text-zinc-600">·</span>
            <span
              className={
                readiness.blenderStatus === 'pre_rendered'
                  ? 'text-[#30D158]'
                  : readiness.requiresColabBlenderRender
                    ? 'text-[#0A84FF]'
                    : 'text-zinc-400'
              }
            >
              {readiness.blenderStatusLabel}
            </span>
            <span aria-hidden="true" className="text-zinc-600">·</span>
            <span className="text-zinc-400">
              {readiness.hasKeyframesPair
                ? 'İlk + Son Kare Hazır'
                : readiness.hasFirstFrame
                  ? 'İlk Kare Hazır'
                  : 'Referans Opsiyonel'}
            </span>
          </div>

          {onAddEtsyAndSocialPair && (
            <button
              type="button"
              data-testid="colab-etsy-reels-pair-btn"
              onClick={() => onAddEtsyAndSocialPair(project.id)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#30D158]/35 bg-[#30D158]/10 px-3.5 py-1.5 text-xs font-medium text-[#30D158] transition-colors hover:bg-[#30D158]/20 whitespace-nowrap shrink-0"
            >
              <Layers className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Etsy + Reels Kuyruğa Ekle</span>
            </button>
          )}
        </div>
      </section>

      {/* 2. GPU Health Check */}
      <GpuHealthCheckPanel
        project={project}
        projects={projects}
        telemetry={telemetry}
        wsStatus={wsStatus}
        ingestToken={ingestToken}
        pingSending={pingSending}
        healthResult={healthResult}
        lastCheckedAt={lastCheckedAt}
        history={healthHistory}
        onRunManualCheck={() => recordHealthCheckEntry('manual')}
        onSimulateRuntimeConnect={async (preset) => {
          await onSendBridgePing({
            gpuName: preset.gpuName,
            vramTotalGb: preset.vramTotalGb,
            vramUsedGb: preset.vramUsedGb,
            systemRamTotalGb: preset.systemRamTotalGb,
            systemRamUsedGb: preset.systemRamUsedGb,
            diskFreeGb: preset.diskFreeGb,
          });
        }}
        onSelectProject={onSelectProject}
        onRelaxProjectPolicyTo40Gb={(projectId) =>
          onUpdateProjectGpuPolicy(projectId, '80GB_OR_40GB')
        }
        onResetTelemetry={onResetTelemetry}
      />

      {/* 3. Batch Queue + Collapsible Scheduler */}
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

      {/* 4. Single Quiet Disclosure for Advanced Tools, Telemetry, Simulator & Raw Code */}
      <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#141417]">
        <button
          type="button"
          onClick={() => setShowAdvancedDrawer((v) => !v)}
          className="flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-white/[0.02]"
        >
          <span className="inline-flex items-center gap-2.5 text-sm font-medium text-[#F5F5F7]">
            <SlidersHorizontal className="h-4 w-4 text-zinc-400" aria-hidden="true" />
            <span>Gelişmiş Ayarlar, Simülatör ve Kod</span>
          </span>
          <ChevronDown
            className={`h-4 w-4 text-zinc-500 transition-transform ${
              showAdvancedDrawer ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </button>

        {showAdvancedDrawer && (
          <div className="space-y-6 border-t border-white/[0.06] bg-[#0E0E11] p-6">
            <TelemetryBridgePanel
              telemetry={telemetry}
              wsStatus={wsStatus}
              ingestToken={ingestToken}
              pingSending={pingSending}
              onSendBridgePing={() => onSendBridgePing()}
              onResetTelemetry={onResetTelemetry}
            />

            <div className="grid gap-5 lg:grid-cols-12 items-start">
              {/* Preferences with Apple Toggles */}
              <section className="space-y-4 rounded-2xl border border-white/[0.08] bg-[#141417] p-5 lg:col-span-5">
                <h3 className="text-sm font-semibold text-[#F5F5F7]">
                  Üretim Tercihleri &amp; Korumalar
                </h3>

                <div className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] bg-[#0E0E11]">
                  {[
                    {
                      label: 'Videoları Bilgisayara İndir',
                      hint: 'Çıktıları yerel klasöre alır.',
                      checked: config.localOutputPrimary,
                      onChange: (next: boolean) =>
                        onUpdateConfig({ ...config, localOutputPrimary: next }),
                    },
                    {
                      label: 'Google Drive’a Yedekle',
                      hint: 'Videoları otomatik Drive’a kopyalar.',
                      checked: config.autoSyncOutputsToDrive,
                      onChange: (next: boolean) =>
                        onUpdateConfig({ ...config, autoSyncOutputsToDrive: next }),
                    },
                    {
                      label: 'Hızlı Model İndirme (hf_transfer)',
                      hint: 'Çoklu bağlantıyla model indirir.',
                      checked: config.enableHfTransfer,
                      onChange: (next: boolean) =>
                        onUpdateConfig({ ...config, enableHfTransfer: next }),
                    },
                    {
                      label: 'Bellek Taşması Koruması',
                      hint: 'Parçalı VAE decode ile çökmeyi önler.',
                      checked: config.comfyui.useTiledVaeDecode,
                      onChange: (next: boolean) =>
                        onUpdateConfig({
                          ...config,
                          comfyui: { ...config.comfyui, useTiledVaeDecode: next },
                        }),
                    },
                    {
                      label: 'Yanlış GPU’da Krediyi Koru',
                      hint: 'Uyumsuz kartta oturumu hemen kapatır.',
                      checked: config.strictKillOnMismatch,
                      onChange: (next: boolean) =>
                        onUpdateConfig({ ...config, strictKillOnMismatch: next }),
                    },
                    {
                      label: 'Sıra Bitince Oturumu Kapat',
                      hint: 'İş bitince Colab makinesini kapatır.',
                      checked: config.autoUnassignOnFinish,
                      onChange: (next: boolean) =>
                        onUpdateConfig({ ...config, autoUnassignOnFinish: next }),
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between gap-4 px-4 py-3 text-xs"
                    >
                      <div>
                        <div className="font-medium text-[#F5F5F7]">{item.label}</div>
                        <div className="text-[11px] text-zinc-500">{item.hint}</div>
                      </div>
                      <AppleToggle
                        checked={item.checked}
                        onChange={item.onChange}
                        label={item.label}
                      />
                    </div>
                  ))}
                </div>

                {/* HuggingFace Repos + Webhook */}
                <div className="space-y-3 pt-1">
                  <div className="space-y-1">
                    <label htmlFor="repo-80gb" className="block text-xs text-zinc-400">
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
                        className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-[#0E0E11] px-3 py-1.5 font-mono text-xs text-[#F5F5F7] focus:border-[#0A84FF] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => verifyHuggingFaceRepo('80gb', config.modelMatrix.repo80Gb)}
                        disabled={hfVerifyingTier === '80gb'}
                        className="rounded-full border border-white/[0.08] bg-[#1C1C20] px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.08] whitespace-nowrap"
                      >
                        Doğrula
                      </button>
                    </div>
                    {renderHfStatus(hfResults['80gb'])}
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="repo-40gb" className="block text-xs text-zinc-400">
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
                        className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-[#0E0E11] px-3 py-1.5 font-mono text-xs text-[#F5F5F7] focus:border-[#0A84FF] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => verifyHuggingFaceRepo('40gb', config.modelMatrix.repo40Gb)}
                        disabled={hfVerifyingTier === '40gb'}
                        className="rounded-full border border-white/[0.08] bg-[#1C1C20] px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.08] whitespace-nowrap"
                      >
                        Doğrula
                      </button>
                    </div>
                    {renderHfStatus(hfResults['40gb'])}
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="hf-session-token" className="block text-xs text-zinc-400">
                      HuggingFace Token (İsteğe Bağlı)
                    </label>
                    <input
                      id="hf-session-token"
                      type="password"
                      autoComplete="off"
                      placeholder="hf_..."
                      value={hfSessionToken}
                      onChange={(e) => setHfSessionToken(e.target.value)}
                      className="w-full rounded-xl border border-white/[0.08] bg-[#0E0E11] px-3 py-1.5 font-mono text-xs text-[#F5F5F7] placeholder:text-zinc-600 focus:border-[#0A84FF] focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1 text-xs">
                    <span className="text-zinc-300">Discord / Slack Bildirimi</span>
                    <AppleToggle
                      checked={config.webhookNotifyOnFailure}
                      onChange={(next) =>
                        onUpdateConfig({ ...config, webhookNotifyOnFailure: next })
                      }
                      label="İş bitince bildirim gönder"
                    />
                  </div>

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
                          className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-[#0E0E11] px-3 py-1.5 font-mono text-xs text-[#F5F5F7] focus:border-[#0A84FF] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleTestWebhook}
                          disabled={webhookTesting}
                          className="inline-flex items-center gap-1 rounded-full bg-[#0A84FF] px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          <Send className="h-3 w-3" aria-hidden="true" />
                          Test Et
                        </button>
                      </div>
                      {webhookStatus && (
                        <p
                          className={`text-xs ${
                            webhookStatus.ok ? 'text-[#30D158]' : 'text-[#FF453A]'
                          }`}
                        >
                          {webhookStatus.text}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {/* Guardrail Simulator */}
              <section className="space-y-4 rounded-2xl border border-white/[0.08] bg-[#141417] p-5 lg:col-span-7">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[#F5F5F7]">
                      GPU Güvenlik Simülatörü
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Farklı ekran kartı senaryolarında otomatik karar davranışını test edin.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRunCounter((c) => c + 1)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#0A84FF] px-4 py-1.5 text-xs font-semibold text-white hover:brightness-110 whitespace-nowrap"
                  >
                    <Play className="h-3 w-3" aria-hidden="true" />
                    Testi Çalıştır
                  </button>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2">
                  {GPU_SIMULATION_PRESETS.map((gpu) => {
                    const active = selectedGpuId === gpu.id;
                    return (
                      <button
                        key={gpu.id}
                        type="button"
                        onClick={() => setSelectedGpuId(gpu.id)}
                        className={`rounded-xl border p-3 text-left transition-colors ${
                          active
                            ? 'border-[#0A84FF] bg-[#0A84FF]/15'
                            : 'border-white/[0.06] bg-[#0E0E11] hover:bg-white/[0.03]'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#F5F5F7]">
                          <Cpu
                            className={`h-3.5 w-3.5 ${
                              active ? 'text-[#0A84FF]' : 'text-zinc-500'
                            }`}
                            aria-hidden="true"
                          />
                          {gpu.label}
                        </div>
                        <div className="mt-1 text-[11px] text-zinc-400 tabular-nums">
                          {gpu.vramGb} GB VRAM · {gpu.systemRamGb} GB RAM
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div
                  data-testid="guardrail-verdict-banner"
                  className={`rounded-xl border p-4 ${
                    isAbort
                      ? 'border-[#FF453A]/30 bg-[#FF453A]/10 text-rose-100'
                      : 'border-[#30D158]/30 bg-[#30D158]/10 text-emerald-100'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {isAbort ? (
                      <ShieldAlert className="mt-0.5 h-4 w-4 text-[#FF453A] shrink-0" aria-hidden="true" />
                    ) : (
                      <ShieldCheck className="mt-0.5 h-4 w-4 text-[#30D158] shrink-0" aria-hidden="true" />
                    )}
                    <div className="w-full space-y-1.5 text-xs">
                      <div className="font-semibold">
                        {evaluation.verdict} ·{' '}
                        {evaluation.shouldTerminateSession
                          ? 'Oturum Otomatik Kapatılacak'
                          : evaluation.selectedModelRepo}
                      </div>
                      <p className="opacity-85">{evaluation.summary}</p>
                    </div>
                  </div>
                </div>

                <div className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] bg-[#0E0E11]">
                  {evaluation.checks.map((step) => (
                    <div key={step.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-xs">
                      <div>
                        <div className="font-medium text-[#F5F5F7]">{step.label}</div>
                        <div className="text-[11px] text-zinc-500">{step.detail}</div>
                      </div>
                      <span
                        className={`text-[11px] font-semibold shrink-0 ${
                          step.status === 'pass'
                            ? 'text-[#30D158]'
                            : step.status === 'warn'
                              ? 'text-amber-400'
                              : 'text-[#FF453A]'
                        }`}
                      >
                        {step.status === 'pass'
                          ? 'Uygun'
                          : step.status === 'warn'
                            ? 'Uyarlandı'
                            : 'Durduruldu'}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* Notebook Code Inspector */}
            <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#141417]">
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <button
                  type="button"
                  onClick={() => setShowNotebookCode((v) => !v)}
                  className="flex items-center gap-2 text-left text-xs font-semibold text-[#F5F5F7]"
                >
                  <ChevronDown
                    className={`h-4 w-4 text-zinc-400 transition-transform ${
                      showNotebookCode ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                  <span>Oluşturulan Colab Çalıştırma Dosyası (.ipynb)</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyNotebook}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-[#1C1C20] px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.08]"
                  >
                    {copiedNb ? (
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
                    onClick={() =>
                      onDownloadFile(
                        'minimax_h3_colab_automation.ipynb',
                        notebookJson,
                        'application/x-ipynb+json'
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#0A84FF] px-3.5 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    .ipynb İndir
                  </button>
                </div>
              </div>

              {showNotebookCode && (
                <div className="border-t border-white/[0.06] p-5 space-y-4">
                  <div className="inline-flex rounded-lg border border-white/[0.06] bg-[#0E0E11] p-0.5">
                    <button
                      type="button"
                      onClick={() => setNotebookInspectMode('cells')}
                      className={`rounded-md px-3 py-1 text-xs font-medium ${
                        notebookInspectMode === 'cells'
                          ? 'bg-white/[0.12] text-white'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Hücreler ({parsedCells.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setNotebookInspectMode('raw')}
                      className={`rounded-md px-3 py-1 text-xs font-medium ${
                        notebookInspectMode === 'raw'
                          ? 'bg-white/[0.12] text-white'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Ham JSON
                    </button>
                  </div>

                  {notebookInspectMode === 'cells' && parsedCells.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-white/[0.06] bg-[#0E0E11] p-1">
                        {parsedCells.map((c) => (
                          <button
                            key={c.index}
                            type="button"
                            onClick={() => setSelectedCellIndex(c.index)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
                              (currentCell?.index ?? 0) === c.index
                                ? 'bg-white/[0.12] text-white'
                                : 'text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            {c.index + 1}. {c.title}
                          </button>
                        ))}
                      </div>
                      {currentCell && (
                        <pre className="max-h-72 overflow-auto rounded-xl border border-white/[0.06] bg-[#0E0E11] p-4 font-mono text-[11px] leading-relaxed text-zinc-300">
                          {currentCell.code}
                        </pre>
                      )}
                    </div>
                  ) : (
                    <pre className="max-h-72 overflow-auto rounded-xl border border-white/[0.06] bg-[#0E0E11] p-4 font-mono text-[11px] leading-relaxed text-zinc-300">
                      {notebookJson}
                    </pre>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </section>

      {syncStage === 'confirm' && pendingPlan && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="overwrite-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
        >
          <div className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#141417] p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-400 shrink-0" aria-hidden="true" />
              <div className="space-y-2">
                <h2 id="overwrite-dialog-title" className="text-base font-semibold text-[#F5F5F7]">
                  Drive’daki Mevcut Dosyalar Güncellensin mi?
                </h2>
                <p className="text-xs leading-relaxed text-zinc-400">
                  Aynı ada sahip <strong>{pendingPlan.existingNamesToOverwrite.length}</strong>{' '}
                  dosya bulundu:
                </p>
                <ul className="max-h-36 overflow-auto rounded-xl border border-white/[0.06] bg-[#0E0E11] p-3 font-mono text-[11px] text-zinc-300 space-y-1">
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
                className="rounded-full border border-white/[0.08] bg-[#1C1C20] px-4 py-2 text-xs font-medium text-zinc-200 hover:bg-white/[0.08]"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={() => runDriveUpload(pendingPlan)}
                className="rounded-full bg-[#0A84FF] px-4 py-2 text-xs font-semibold text-white hover:brightness-110"
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
