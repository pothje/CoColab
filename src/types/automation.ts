export type WorkspaceTab = 'dashboard' | 'workbench' | 'models' | 'colab' | 'kurulum' | 'claude' | 'denetim';

export type ComfyModelId = 'minimax-h3' | 'wan-2.2' | 'ltx-2.3';

export type ModelStorageTarget = 'nvme' | 'drive';

export type ModelVariantId = 'balanced_40gb' | 'quality_80gb';

export interface InstalledModelRecord {
  modelId: ComfyModelId;
  variantId: ModelVariantId;
  target: ModelStorageTarget;
  installPath: string;
  installedAt: string;
  acceleratedWithUv: boolean;
  acceleratedWithHfTransfer: boolean;
}

export interface ModelInstallerConfig {
  selectedModelId: ComfyModelId;
  installTarget: ModelStorageTarget;
  selectedVariants: Record<ComfyModelId, ModelVariantId>;
  useUvAcceleration: boolean;
  installRecommendedNodes: boolean;
  createDriveSymlinks: boolean;
  installedModels: Partial<Record<ComfyModelId, InstalledModelRecord>>;
}

export type AuditCategory = 'kritik_hata' | 'optimizasyon' | 'yeni_ozellik';

export type ArchitectureVerdict = 'uygulandi' | 'kosullu' | 'reddedildi';

export interface AuditFinding {
  id: string;
  title: string;
  category: AuditCategory;
  verdict?: ArchitectureVerdict;
  affectedStep: string;
  problem: string;
  solution: string;
  codeImpactLabel: string;
  enabledInExport: boolean;
}

export type AssetKind =
  | 'schema'
  | 'prompts'
  | 'settings'
  | 'comfyui_workflow'
  | 'reference_media'
  | 'blender_graybox'
  | 'other';

export interface ProjectAssetFile {
  id: string;
  name: string;
  relativePath: string;
  sizeBytes: number;
  mimeType: string;
  kind: AssetKind;
  targetColabPath: string;
  previewText?: string;
  objectUrl?: string;
  rawFile?: File;
  included: boolean;
}

export interface RevisionFeedbackNote {
  id: string;
  outputId: string;
  createdAt: string;
  status: 'bekliyor' | 'claude_yetkilendirildi' | 'cozuldu';
  severity: 'dusuk' | 'orta' | 'yuksek';
  note: string;
  generatedBrief?: string;
}

export interface OutputRenderItem {
  id: string;
  title: string;
  fileName: string;
  relativeOutputPath: string;
  createdAt: string;
  gpuUsed: 'A100 80GB' | 'A100 40GB';
  durationSec: number;
  resolution: string;
  status: 'tamamlandi' | 'revizyon_gerekli';
  objectUrl?: string;
  mimeType: string;
  notes: RevisionFeedbackNote[];
}

export interface ColabProject {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  targetGpuPolicy: '80GB_ONLY' | '80GB_OR_40GB';
  assets: ProjectAssetFile[];
  outputs: OutputRenderItem[];
}

export type BatchJobStatus =
  | 'kuyrukta'
  | 'hazirlaniyor'
  | 'isleniyor'
  | 'tamamlandi'
  | 'hata';

export interface BatchQueueItem {
  id: string;
  projectId: string;
  projectName: string;
  sceneLabel: string;
  status: BatchJobStatus;
  addedAt: string;
  estimatedRenderMin: number;
}

export type BatchScheduleMode = 'time' | 'low_load' | 'time_and_low_load';

export type BatchScheduleRecurrence = 'once' | 'daily' | 'weekdays';

export interface BatchScheduleConfig {
  enabled: boolean;
  mode: BatchScheduleMode;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // HH:MM
  recurrence: BatchScheduleRecurrence;
  maxVramLoadPct: number;
  maxRamLoadPct: number;
  loadSource: 'telemetry' | 'simulated';
  simulatedLoadPct: number;
  lastTriggeredAt: string | null;
  lastTriggerReason: string | null;
}

export interface OnboardingState {
  colabPlanConfirmed: boolean;
  hfAccountReady: boolean;
  hfTokenVerified: boolean;
  mcpInstalledConfirmed: boolean;
  preferredOs: 'windows' | 'macos_linux';
}

export interface GpuProfileSpec {
  id: string;
  label: string;
  nvidiaSmiName: string;
  vramGb: number;
  systemRamGb: number;
  diskFreeGb: number;
  cudaVersion: string;
}

export interface ModelTierConfig {
  repo80Gb: string;
  quant80Gb: string;
  repo40Gb: string;
  quant40Gb: string;
  allow24GbFallback: boolean;
  repo24Gb: string;
  quant24Gb: string;
}

export type ComfyMcpControlMode = 'in_vm_agent' | 'remote_comfy_mcp';

export interface ComfyUiConfig {
  installComfyUi: boolean;
  comfyRepoUrl: string;
  comfyRootDir: string;
  comfyPort: number;
  enableManager: boolean;
  enableVideoHelperSuite: boolean;
  enableKjNodes: boolean;
  enableSageAttention: boolean;
  enableUvInstaller: boolean;
  pinTorchNumpyConstraints: boolean;
  enableTeaCache: boolean;
  enableTurboLora: boolean;
  turboLoraFile: string;
  turboSteps: number;
  useTiledVaeDecode: boolean;
  vaeTileSize: number;
  freeMemoryEveryNVideos: number;
  wsStallTimeoutSec: number;
  deadManSwitchMinutes: number;
  controlMode: ComfyMcpControlMode;
  comfyMcpEndpoint: string;
  headlessFlags: string;
  diffusionModel80Gb: string;
  diffusionModel40Gb: string;
  textEncoder80Gb: string;
  textEncoder40Gb: string;
  videoVaeFile: string;
  audioVaeFile: string;
}

export interface AutomationConfig {
  workspaceRoot: string;
  driveFolderName: string;
  driveBackupDir: string;
  minDiskFreeGb: number;
  requireHighRam: boolean;
  minHighRamGb: number;
  strictKillOnMismatch: boolean;
  autoUnassignOnFinish: boolean;
  enableHfTransfer: boolean;
  localOutputPrimary: boolean;
  autoSyncOutputsToDrive: boolean;
  setupMinutesEstimate: number;
  webhookNotifyOnFailure: boolean;
  webhookUrlPlaceholder: string;
  hfTokenEnvVar: string;
  modelMatrix: ModelTierConfig;
  comfyui: ComfyUiConfig;
  modelInstaller: ModelInstallerConfig;
  batchSchedule: BatchScheduleConfig;
}

export interface GuardrailCheckStep {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

export interface GuardrailEvaluationResult {
  verdict: 'PASS_80GB' | 'PASS_40GB_ADAPTIVE' | 'PASS_24GB_FALLBACK' | 'ABORT_UNASSIGN';
  shouldTerminateSession: boolean;
  selectedModelRepo: string | null;
  selectedQuantization: string | null;
  estimatedVramUsageGb: number;
  vramHeadroomGb: number;
  checks: GuardrailCheckStep[];
  summary: string;
}

export interface HfVerifyResult {
  ok: boolean;
  status: number;
  repoId: string;
  sha?: string | null;
  private?: boolean;
  gated?: boolean;
  pipelineTag?: string | null;
  fileCount?: number;
  totalSafetensorsGb?: number;
  totalRepoGb?: number;
  error?: string;
}

export type TelemetryStage =
  | 'idle'
  | 'preflight'
  | 'downloading'
  | 'injecting'
  | 'rendering'
  | 'saving_local'
  | 'backing_up_drive'
  | 'completed'
  | 'aborted';

export interface TelemetryLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

export interface TelemetrySnapshot {
  sessionId: string | null;
  stage: TelemetryStage;
  gpuName: string | null;
  vramUsedGb: number | null;
  vramTotalGb: number | null;
  systemRamUsedGb: number | null;
  systemRamTotalGb: number | null;
  gpuTempC: number | null;
  diskFreeGb: number | null;
  downloadProgressPct: number | null;
  activeProjectId: string | null;
  activeBatchJobId: string | null;
  batchIndex: number;
  batchTotal: number;
  currentStepLabel: string;
  lastUpdatedAt: string | null;
  logs: TelemetryLogEntry[];
}
