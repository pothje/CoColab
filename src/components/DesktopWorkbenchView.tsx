import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type MouseEvent,
} from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Columns2,
  Copy,
  ExternalLink,
  FileCode2,
  FileText,
  Film,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Layers,
  Loader2,
  Pause,
  Play,
  Plus,
  Repeat,
  SkipBack,
  Trash2,
  Upload,
  Workflow,
} from 'lucide-react';
import {
  AssetKind,
  AuditFinding,
  AutomationConfig,
  BatchQueueItem,
  ColabProject,
  DeliveryPresetId,
  MediaRole,
  OutputRenderItem,
  ProjectAssetFile,
  RevisionFeedbackNote,
  TelemetrySnapshot,
  WorkspaceTab,
} from '../types/automation';
import type { BridgeRuntimePreset } from '../hooks/useColabTelemetry';
import {
  buildStackRelativePath,
  buildTargetColabPath,
  classifyProjectFiles,
  formatBytes,
  type RawFileInput,
} from '../utils/guardrailEngine';
import { filesToRawInputs, readDroppedEntryFiles } from '../utils/fileImport';
import {
  DELIVERY_PRESETS,
  inspectProjectPipelineReadiness,
} from '../utils/claudeBundle';
import { buildClaudeRevisionBrief } from '../utils/claudeGenerators';
import {
  generateColabNotebookJson,
  generateManifestJson,
  generatePreflightPython,
} from '../utils/codeGenerators';
import { buildAutomationZipBundle } from '../utils/zipBundle';
import {
  buildStudioTimelineModel,
  computeTimelineClipStyle,
  formatTimecode,
  stepFrameTime,
  type CompareTargetLayer,
  type MonitorViewMode,
  type TimelineClipItem,
} from '../utils/studioTimeline';
import {
  DriveSyncPlan,
  DriveSyncResult,
  executeDriveSync,
  prepareDriveSyncPlan,
} from '../services/driveSync';
import {
  getFallbackPreviewForAsset,
  getSeedVisualForProject,
} from '../data/studioVisuals';
import { GoogleSignInButton } from './GoogleSignInButton';
import { ComfyUiConfigPanel } from './ComfyUiConfigPanel';
import { BlenderRenderPanel } from './BlenderRenderPanel';

interface DesktopWorkbenchViewProps {
  projects: ColabProject[];
  activeProjectId: string;
  batchQueue: BatchQueueItem[];
  config: AutomationConfig;
  onUpdateConfig: (next: AutomationConfig) => void;
  findings: AuditFinding[];
  driveUserEmail: string | null;
  driveAccessToken: string | null;
  isSigningIn: boolean;
  telemetry: TelemetrySnapshot;
  wsStatus: 'connecting' | 'connected' | 'disconnected';
  ingestToken: string;
  pingSending: boolean;
  onSelectProject: (id: string) => void;
  onCreateProject: (
    name: string,
    description: string,
    deliveryPreset?: DeliveryPresetId
  ) => void;
  onImportClaudeBundle?: (
    rawFiles: RawFileInput[],
    options?: { openInStudio?: boolean; autoQueueEtsyAndReels?: boolean }
  ) => ColabProject | null;
  onUpdateProjectDeliveryPreset?: (
    projectId: string,
    preset: DeliveryPresetId
  ) => void;
  onDeleteProject: (id: string) => void;
  onUpdateProjectAssets: (projectId: string, assets: ProjectAssetFile[]) => void;
  onUpdateAssetContent: (projectId: string, assetId: string, nextText: string) => void;
  onMoveAssetToFolder: (projectId: string, assetId: string, targetKind: AssetKind) => void;
  onAddOutputToProject: (projectId: string, output: OutputRenderItem) => void;
  onAddRevisionFeedback: (
    projectId: string,
    outputId: string,
    note: RevisionFeedbackNote
  ) => void;
  onAddToBatchQueue: (
    projectId: string,
    sceneLabel: string,
    deliveryPreset?: DeliveryPresetId
  ) => void;
  onAddEtsyAndSocialPair?: (projectId: string) => void;
  onReorderBatchJob: (index: number, direction: 'up' | 'down') => void;
  onRemoveBatchJob: (jobId: string) => void;
  onConnectDrive: () => Promise<void>;
  onSendBridgePing: (preset?: BridgeRuntimePreset) => Promise<void>;
  onResetTelemetry: () => Promise<void>;
  onDownloadFile: (filename: string, content: string | Blob, mime: string) => void;
  onNavigate: (tab: WorkspaceTab) => void;
}

type InspectorTab = 'settings' | 'media' | 'notes';
type StageViewMode = 'visual_studio' | 'item_detail';
type SelectedRef =
  | { type: 'asset'; id: string }
  | { type: 'output'; id: string };

const STUDIO_FPS = 24;

const KIND_LABELS: Record<AssetKind, string> = {
  schema: 'Proje Haritası',
  prompts: 'Sahne Tarifi',
  comfyui_workflow: 'Video Motoru Akışı',
  settings: 'Kalite & Stil Ayarı',
  reference_media: 'Referans Medya',
  blender_graybox: '3D Blender Graybox',
  other: 'Diğer Dosya',
};

function isEditableTextAsset(asset: ProjectAssetFile): boolean {
  return (
    asset.mimeType.startsWith('text/') ||
    asset.mimeType === 'application/json' ||
    /\.(json|ya?ml|txt|md|toml|py|cfg|ini)$/i.test(asset.name)
  );
}

function isVideoNameOrMime(name: string, mime: string): boolean {
  return mime.startsWith('video/') || /\.(mp4|mov|webm|mkv)$/i.test(name);
}

export function DesktopWorkbenchView({
  projects,
  activeProjectId,
  batchQueue,
  config,
  onUpdateConfig,
  findings,
  driveUserEmail,
  driveAccessToken,
  isSigningIn,
  ingestToken,
  onSelectProject,
  onCreateProject,
  onImportClaudeBundle,
  onUpdateProjectDeliveryPreset,
  onDeleteProject,
  onUpdateProjectAssets,
  onUpdateAssetContent,
  onMoveAssetToFolder,
  onAddOutputToProject,
  onAddRevisionFeedback,
  onAddToBatchQueue,
  onAddEtsyAndSocialPair,
  onReorderBatchJob,
  onRemoveBatchJob,
  onConnectDrive,
  onDownloadFile,
  onNavigate,
}: DesktopWorkbenchViewProps) {
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const claudeBundleFolderRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const outputUploadRef = useRef<HTMLInputElement | null>(null);
  const grayboxReplaceRef = useRef<HTMLInputElement | null>(null);
  const styleReplaceRef = useRef<HTMLInputElement | null>(null);
  const firstFrameUploadRef = useRef<HTMLInputElement | null>(null);
  const lastFrameUploadRef = useRef<HTMLInputElement | null>(null);
  const blendUploadRef = useRef<HTMLInputElement | null>(null);
  const monitorVideoRef = useRef<HTMLVideoElement | null>(null);

  const activeProject =
    projects.find((p) => p.id === activeProjectId) ?? projects[0];

  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('settings');
  const [stageMode, setStageMode] = useState<StageViewMode>('visual_studio');
  const [monitorMode, setMonitorMode] = useState<MonitorViewMode>('final');
  const [compareLayer, setCompareLayer] = useState<CompareTargetLayer>('graybox');
  const [wipePct, setWipePct] = useState<number>(50);
  const [playheadSec, setPlayheadSec] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(true);

  const [selectedRef, setSelectedRef] = useState<SelectedRef | null>(null);
  const [showTechFiles, setShowTechFiles] = useState<boolean>(false);
  const [showNegativePrompt, setShowNegativePrompt] = useState<boolean>(false);

  const [creatingNew, setCreatingNew] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [newDesc, setNewDesc] = useState<string>('');
  const [newDeliveryPreset, setNewDeliveryPreset] = useState<DeliveryPresetId>('etsy_4_3');
  const [osDropActive, setOsDropActive] = useState<boolean>(false);

  const [feedbackText, setFeedbackText] = useState<string>('');
  const [feedbackSeverity, setFeedbackSeverity] = useState<'dusuk' | 'orta' | 'yuksek'>(
    'orta'
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [zipLoading, setZipLoading] = useState<boolean>(false);
  const [syncStage, setSyncStage] = useState<'idle' | 'scanning' | 'confirm' | 'uploading'>(
    'idle'
  );
  const [syncResult, setSyncResult] = useState<DriveSyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<DriveSyncPlan | null>(null);

  const readiness = useMemo(
    () => inspectProjectPipelineReadiness(activeProject, config.blenderRender),
    [activeProject, config.blenderRender]
  );

  const timelineModel = useMemo(
    () => buildStudioTimelineModel(activeProject, batchQueue, STUDIO_FPS),
    [activeProject, batchQueue]
  );

  const seedVisuals = useMemo(
    () => getSeedVisualForProject(activeProject.id),
    [activeProject.id]
  );

  const masterPromptAsset = useMemo(
    () =>
      activeProject.assets.find((a) => a.name === 'master_prompt.txt') ??
      activeProject.assets.find((a) => a.kind === 'prompts') ??
      null,
    [activeProject.assets]
  );

  const negativePromptAsset = useMemo(
    () => activeProject.assets.find((a) => a.name === 'negative_prompt.txt') ?? null,
    [activeProject.assets]
  );

  const grayboxImageAsset = useMemo(
    () =>
      activeProject.assets.find(
        (a) => a.kind === 'blender_graybox' && !isVideoNameOrMime(a.name, a.mimeType)
      ) ??
      activeProject.assets.find((a) => a.kind === 'blender_graybox') ??
      null,
    [activeProject.assets]
  );

  const styleRefAsset = useMemo(
    () =>
      activeProject.assets.find(
        (a) => a.kind === 'reference_media' && !isVideoNameOrMime(a.name, a.mimeType)
      ) ??
      activeProject.assets.find((a) => a.kind === 'reference_media') ??
      null,
    [activeProject.assets]
  );

  const latestOutput = activeProject.outputs[0] ?? null;
  const hasRealVideoOutput = Boolean(
    latestOutput?.objectUrl &&
      isVideoNameOrMime(latestOutput.fileName, latestOutput.mimeType)
  );

  const resolvedActiveAsset = useMemo(() => {
    if (selectedRef?.type === 'asset') {
      return activeProject.assets.find((a) => a.id === selectedRef.id) ?? null;
    }
    return null;
  }, [activeProject.assets, selectedRef]);

  const resolvedActiveOutput = useMemo(() => {
    if (selectedRef?.type === 'output') {
      return activeProject.outputs.find((o) => o.id === selectedRef.id) ?? null;
    }
    return null;
  }, [activeProject.outputs, selectedRef]);

  const mediaAssets = useMemo(
    () =>
      activeProject.assets.filter(
        (a) => a.kind === 'blender_graybox' || a.kind === 'reference_media'
      ),
    [activeProject.assets]
  );

  const telemetryOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  useEffect(() => {
    if (playheadSec > timelineModel.totalDurationSec) {
      setPlayheadSec(0);
    }
  }, [timelineModel.totalDurationSec, playheadSec]);

  useEffect(() => {
    if (!isPlaying) return;
    if (monitorMode === 'final' && hasRealVideoOutput && monitorVideoRef.current) {
      void monitorVideoRef.current.play().catch(() => {});
      return;
    }
    const intervalMs = Math.round(1000 / STUDIO_FPS);
    const timer = window.setInterval(() => {
      setPlayheadSec((prev) => {
        const next = prev + 1 / STUDIO_FPS;
        if (next >= timelineModel.totalDurationSec) {
          if (isLooping) return 0;
          setIsPlaying(false);
          return timelineModel.totalDurationSec;
        }
        return Number(next.toFixed(4));
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [isPlaying, isLooping, timelineModel.totalDurationSec, monitorMode, hasRealVideoOutput]);

  useEffect(() => {
    if (!isPlaying && monitorVideoRef.current) {
      monitorVideoRef.current.pause();
    }
  }, [isPlaying]);

  function selectItem(ref: SelectedRef) {
    setSelectedRef(ref);
    setStageMode('item_detail');
  }

  function handleProjectSwitch(nextId: string) {
    onSelectProject(nextId);
    setSelectedRef(null);
    setStageMode('visual_studio');
    setIsPlaying(false);
    setPlayheadSec(0);
  }

  function seekPlayhead(nextSec: number) {
    const clamped = Math.max(0, Math.min(timelineModel.totalDurationSec, nextSec));
    setPlayheadSec(Number(clamped.toFixed(4)));
    if (monitorVideoRef.current) {
      monitorVideoRef.current.currentTime = clamped;
    }
  }

  function handleTimelineRulerClick(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekPlayhead(ratio * timelineModel.totalDurationSec);
  }

  function handleTimelineClipClick(clip: TimelineClipItem) {
    seekPlayhead(clip.startSec);
    setStageMode('visual_studio');
    if (monitorMode !== 'compare') {
      setMonitorMode(clip.targetMonitorMode);
    } else if (clip.targetMonitorMode === 'graybox' || clip.targetMonitorMode === 'style') {
      setCompareLayer(clip.targetMonitorMode);
    }
  }

  function mergeRawInputsIntoProject(rawInputs: RawFileInput[], forcedKind?: AssetKind) {
    if (rawInputs.length === 0) return;
    const classified = classifyProjectFiles(rawInputs, config.workspaceRoot).map((item) => {
      if (!forcedKind) return item;
      return {
        ...item,
        kind: forcedKind,
        relativePath: buildStackRelativePath(forcedKind, item.name),
        targetColabPath: buildTargetColabPath(config.workspaceRoot, forcedKind, item.name),
      };
    });

    const existingMap = new Map(activeProject.assets.map((a) => [a.name, a]));
    for (const item of classified) {
      existingMap.set(item.name, item);
    }
    onUpdateProjectAssets(activeProject.id, Array.from(existingMap.values()));
    if (classified[0]) {
      selectItem({ type: 'asset', id: classified[0].id });
    }
  }

  async function handleFolderOrFileInput(e: ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const rawInputs = await filesToRawInputs(fileList);
    mergeRawInputsIntoProject(rawInputs);
    e.target.value = '';
  }

  async function handleWorkspaceOsDrop(e: DragEvent<HTMLDivElement>, forcedKind?: AssetKind) {
    e.preventDefault();
    e.stopPropagation();
    setOsDropActive(false);

    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      const rawInputs: RawFileInput[] = [];
      const entries: FileSystemEntry[] = [];
      for (const item of Array.from(items)) {
        const entry = item.webkitGetAsEntry?.();
        if (entry) entries.push(entry);
      }
      if (entries.length > 0) {
        const collected = await Promise.all(
          entries.map((entry) => readDroppedEntryFiles(entry))
        );
        rawInputs.push(...collected.flat());
      } else if (e.dataTransfer.files.length > 0) {
        rawInputs.push(...(await filesToRawInputs(e.dataTransfer.files)));
      }
      mergeRawInputsIntoProject(rawInputs, forcedKind);
    } else if (e.dataTransfer.files.length > 0) {
      const rawInputs = await filesToRawInputs(e.dataTransfer.files);
      mergeRawInputsIntoProject(rawInputs, forcedKind);
    }
  }

  function handleOutputFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    const nextOutput: OutputRenderItem = {
      id: `out-${Date.now()}`,
      title: file.name,
      fileName: file.name,
      relativeOutputPath: `05_outputs/renders/${file.name}`,
      createdAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      gpuUsed: 'A100 80GB',
      durationSec: 5.0,
      resolution: '1280x720',
      status: 'tamamlandi',
      objectUrl,
      mimeType: file.type || 'video/mp4',
      notes: [],
    };
    onAddOutputToProject(activeProject.id, nextOutput);
    setStageMode('visual_studio');
    setMonitorMode('final');
    e.target.value = '';
  }

  function handleReplaceMediaAsset(asset: ProjectAssetFile, file: File) {
    const objectUrl = URL.createObjectURL(file);
    onUpdateProjectAssets(
      activeProject.id,
      activeProject.assets.map((a) =>
        a.id === asset.id
          ? {
              ...a,
              name: file.name,
              sizeBytes: file.size,
              mimeType: file.type || a.mimeType,
              objectUrl,
              rawFile: file,
              previewText: `${file.name} · ${formatBytes(file.size)}`,
            }
          : a
      )
    );
  }

  function handleQuickReplaceKind(
    kind: AssetKind,
    file: File,
    forcedRole?: MediaRole
  ) {
    const existing = forcedRole
      ? activeProject.assets.find((a) => a.mediaRole === forcedRole)
      : activeProject.assets.find((a) => a.kind === kind);

    if (existing) {
      const objectUrl = URL.createObjectURL(file);
      onUpdateProjectAssets(
        activeProject.id,
        activeProject.assets.map((a) =>
          a.id === existing.id
            ? {
                ...a,
                name: file.name,
                sizeBytes: file.size,
                mimeType: file.type || a.mimeType,
                mediaRole: forcedRole ?? a.mediaRole,
                objectUrl,
                rawFile: file,
                previewText: `${file.name} · ${formatBytes(file.size)}`,
              }
            : a
        )
      );
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const added = classifyProjectFiles(
      [
        {
          name: file.name,
          relativePath: file.name,
          sizeBytes: file.size,
          mimeType: file.type,
          previewText: `${file.name} · ${formatBytes(file.size)}`,
          objectUrl,
          rawFile: file,
        },
      ],
      config.workspaceRoot
    )[0];
    if (added) {
      onUpdateProjectAssets(activeProject.id, [
        ...activeProject.assets,
        {
          ...added,
          kind,
          mediaRole: forcedRole ?? added.mediaRole,
          relativePath: buildStackRelativePath(kind, file.name),
          targetColabPath: buildTargetColabPath(config.workspaceRoot, kind, file.name),
        },
      ]);
    }
  }

  async function handleClaudeBundleFolderImport(e: ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0 || !onImportClaudeBundle) return;
    const rawInputs = await filesToRawInputs(fileList);
    onImportClaudeBundle(rawInputs, { openInStudio: true });
    e.target.value = '';
  }

  function handleEvaluateWithClaude(output: OutputRenderItem) {
    if (!feedbackText.trim()) return;
    const brief = buildClaudeRevisionBrief(activeProject, output, feedbackText);
    const note: RevisionFeedbackNote = {
      id: `rev-${Date.now()}`,
      outputId: output.id,
      createdAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      status: 'claude_yetkilendirildi',
      severity: feedbackSeverity,
      note: feedbackText.trim(),
      generatedBrief: brief,
    };
    onAddRevisionFeedback(activeProject.id, output.id, note);
    setFeedbackText('');
  }

  async function handleCopyText(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1600);
    } catch {
      // Clipboard ignored
    }
  }

  async function handleDownloadZip() {
    setZipLoading(true);
    try {
      const blob = await buildAutomationZipBundle(
        config,
        activeProject.assets,
        findings,
        activeProject,
        batchQueue,
        projects,
        telemetryOrigin,
        ingestToken
      );
      onDownloadFile(`${activeProject.id}_studyo_paketi.zip`, blob, 'application/zip');
    } finally {
      setZipLoading(false);
    }
  }

  async function runDriveUpload(plan: DriveSyncPlan) {
    if (!driveAccessToken) return;
    setSyncStage('uploading');
    setSyncError(null);
    try {
      const nbJson = generateColabNotebookJson(
        config,
        activeProject.assets,
        findings,
        batchQueue,
        projects,
        telemetryOrigin,
        ingestToken
      );
      const manifestJson = generateManifestJson(config, activeProject.assets);
      const preflightPy = generatePreflightPython(config, findings);
      const res = await executeDriveSync(
        driveAccessToken,
        plan,
        nbJson,
        manifestJson,
        preflightPy,
        activeProject.assets
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
        `${config.driveFolderName || 'ColabForge_Projects'}_${activeProject.id}`,
        activeProject.assets
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

  function renderFileIcon(asset: ProjectAssetFile) {
    if (asset.kind === 'comfyui_workflow') {
      return <Workflow className="h-3.5 w-3.5 text-[#0A84FF] shrink-0" aria-hidden="true" />;
    }
    if (isVideoNameOrMime(asset.name, asset.mimeType)) {
      return <Film className="h-3.5 w-3.5 text-[#FF9F0A] shrink-0" aria-hidden="true" />;
    }
    if (asset.mimeType.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(asset.name)) {
      return <ImageIcon className="h-3.5 w-3.5 text-[#30D158] shrink-0" aria-hidden="true" />;
    }
    if (asset.kind === 'prompts') {
      return <FileText className="h-3.5 w-3.5 text-zinc-300 shrink-0" aria-hidden="true" />;
    }
    return <FileCode2 className="h-3.5 w-3.5 text-zinc-400 shrink-0" aria-hidden="true" />;
  }

  const finalRenderImageSrc = latestOutput?.objectUrl || seedVisuals.finalPreview;
  const grayboxVisualSrc =
    (grayboxImageAsset && !isVideoNameOrMime(grayboxImageAsset.name, grayboxImageAsset.mimeType)
      ? grayboxImageAsset.objectUrl
      : undefined) || seedVisuals.grayboxPreview;
  const styleVisualSrc =
    (styleRefAsset && !isVideoNameOrMime(styleRefAsset.name, styleRefAsset.mimeType)
      ? styleRefAsset.objectUrl
      : undefined) || seedVisuals.stylePreview;

  const compareOverlaySrc = compareLayer === 'graybox' ? grayboxVisualSrc : styleVisualSrc;
  const playheadPct = Math.min(
    100,
    Math.max(0, (playheadSec / Math.max(1, timelineModel.totalDurationSec)) * 100)
  );
  const scrubZoomScale =
    1 + Math.sin((playheadSec / Math.max(1, timelineModel.totalDurationSec)) * Math.PI) * 0.04;

  const rulerMarkers = useMemo(() => {
    const step = timelineModel.totalDurationSec <= 16 ? 2 : 4;
    const marks: number[] = [];
    for (let s = 0; s <= timelineModel.totalDurationSec; s += step) {
      marks.push(s);
    }
    return marks;
  }, [timelineModel.totalDurationSec]);

  return (
    <div
      className="min-h-[calc(100vh-57px)] bg-[#09090B] text-[#F5F5F7]"
      onDragOver={(e) => {
        e.preventDefault();
        setOsDropActive(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setOsDropActive(false);
      }}
      onDrop={(e) => void handleWorkspaceOsDrop(e)}
    >
      {/* Hidden native inputs */}
      <input
        ref={folderInputRef}
        type="file"
        multiple
        // @ts-expect-error webkitdirectory is supported in Chromium/WebKit
        webkitdirectory=""
        className="hidden"
        onChange={handleFolderOrFileInput}
      />
      <input
        ref={claudeBundleFolderRef}
        type="file"
        multiple
        // @ts-expect-error webkitdirectory is supported in Chromium/WebKit
        webkitdirectory=""
        className="hidden"
        onChange={handleClaudeBundleFolderImport}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFolderOrFileInput}
      />
      <input
        ref={outputUploadRef}
        type="file"
        accept="video/*,image/*"
        className="hidden"
        onChange={handleOutputFileUpload}
      />
      <input
        ref={grayboxReplaceRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleQuickReplaceKind('blender_graybox', f);
          e.target.value = '';
        }}
      />
      <input
        ref={styleReplaceRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleQuickReplaceKind('reference_media', f);
          e.target.value = '';
        }}
      />
      <input
        ref={firstFrameUploadRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleQuickReplaceKind('reference_media', f, 'first_frame');
          e.target.value = '';
        }}
      />
      <input
        ref={lastFrameUploadRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleQuickReplaceKind('reference_media', f, 'last_frame');
          e.target.value = '';
        }}
      />
      <input
        ref={blendUploadRef}
        type="file"
        accept=".blend,.blend1"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleQuickReplaceKind('blender_graybox', f, 'blender_scene');
          e.target.value = '';
        }}
      />

      {/* Calm Studio Toolbar */}
      <div className="border-b border-white/[0.07] bg-[#0E0E11]">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-8">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/[0.09] hover:text-white whitespace-nowrap"
            >
              ← Projeler
            </button>

            <select
              aria-label="Aktif proje seçimi"
              value={activeProject.id}
              onChange={(e) => handleProjectSwitch(e.target.value)}
              className="rounded-full border border-white/[0.1] bg-[#141417] px-3.5 py-1.5 text-xs font-semibold text-[#F5F5F7] focus:border-[#0A84FF] focus:outline-none"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setCreatingNew((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.09] whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Yeni</span>
            </button>

            {projects.length > 1 && (
              <button
                type="button"
                aria-label={`${activeProject.name} projesini sil`}
                onClick={() => onDeleteProject(activeProject.id)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-[#FF453A]/15 hover:text-[#FF453A]"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!driveAccessToken ? (
              <GoogleSignInButton
                onClick={onConnectDrive}
                disabled={isSigningIn}
                label={isSigningIn ? 'Bağlanıyor...' : 'Drive Bağla'}
              />
            ) : (
              <button
                type="button"
                onClick={handleStartDriveSync}
                disabled={syncStage === 'scanning' || syncStage === 'uploading'}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.05] px-3.5 py-1.5 text-xs font-medium text-[#F5F5F7] hover:bg-white/[0.1] disabled:opacity-50 whitespace-nowrap"
              >
                {syncStage === 'scanning' || syncStage === 'uploading' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <CloudUpload className="h-3.5 w-3.5 text-[#0A84FF]" aria-hidden="true" />
                )}
                {driveUserEmail ? 'Drive’a Gönder' : 'Drive’a Aktar'}
              </button>
            )}

            <button
              type="button"
              onClick={handleDownloadZip}
              disabled={zipLoading}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.05] px-3.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.1] whitespace-nowrap"
            >
              <Archive className="h-3.5 w-3.5" aria-hidden="true" />
              {zipLoading ? 'Paketleniyor...' : 'Paket (.zip)'}
            </button>

            {onAddEtsyAndSocialPair && (
              <button
                type="button"
                data-testid="studio-etsy-reels-pair-btn"
                onClick={() => onAddEtsyAndSocialPair(activeProject.id)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#30D158]/35 bg-[#30D158]/10 px-3.5 py-1.5 text-xs font-medium text-[#30D158] hover:bg-[#30D158]/20 whitespace-nowrap"
              >
                <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Etsy + Reels Çift Sıra</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                const n =
                  batchQueue.filter((j) => j.projectId === activeProject.id).length + 1;
                onAddToBatchQueue(
                  activeProject.id,
                  `${activeProject.name} · Sahne ${String(n).padStart(2, '0')}`,
                  activeProject.deliveryPreset
                );
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#0A84FF] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#2494FF] whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Sıraya Ekle</span>
            </button>
          </div>
        </div>

        {creatingNew && (
          <div className="mx-auto max-w-[1440px] border-t border-white/[0.07] px-4 py-3 lg:px-8">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <input
                type="text"
                placeholder="Yeni proje adı"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="flex-1 rounded-xl border border-white/[0.1] bg-[#141417] px-3.5 py-2 text-xs text-[#F5F5F7] placeholder:text-zinc-500 focus:border-[#0A84FF] focus:outline-none"
              />
              <input
                type="text"
                placeholder="Kısa sahne açıklaması"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="flex-1 rounded-xl border border-white/[0.1] bg-[#141417] px-3.5 py-2 text-xs text-[#F5F5F7] placeholder:text-zinc-500 focus:border-[#0A84FF] focus:outline-none"
              />
              <select
                aria-label="Yeni proje formatı"
                value={newDeliveryPreset}
                onChange={(e) => setNewDeliveryPreset(e.target.value as DeliveryPresetId)}
                className="rounded-xl border border-white/[0.1] bg-[#141417] px-3 py-2 text-xs text-[#F5F5F7] focus:border-[#0A84FF] focus:outline-none"
              >
                {Object.values(DELIVERY_PRESETS).map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setCreatingNew(false)}
                  className="rounded-full border border-white/[0.1] px-3.5 py-1.5 text-xs text-zinc-300 hover:text-white"
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!newName.trim()) return;
                    onCreateProject(
                      newName.trim(),
                      newDesc.trim() || 'Video üretim projesi',
                      newDeliveryPreset
                    );
                    setNewName('');
                    setNewDesc('');
                    setCreatingNew(false);
                  }}
                  className="rounded-full bg-[#0A84FF] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#2494FF]"
                >
                  Oluştur
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Container */}
      <div className="mx-auto max-w-[1440px] px-4 py-6 space-y-6 lg:px-8">
        {(syncError || syncResult) && (
          <div>
            {syncError && (
              <div className="rounded-2xl border border-[#FF453A]/40 bg-[#FF453A]/10 px-4 py-3 text-xs text-rose-200">
                {syncError}
              </div>
            )}
            {syncResult && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#30D158]/40 bg-[#30D158]/10 px-4 py-3 text-xs text-emerald-200">
                <span>
                  <strong>{syncResult.uploadedCount} dosya</strong> Google Drive’a aktarıldı.
                </span>
                <a
                  href={syncResult.colabLaunchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#30D158] px-3.5 py-1.5 text-xs font-semibold text-black hover:opacity-90"
                >
                  Colab’ı Aç
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </div>
            )}
          </div>
        )}

        {/* Focused 2-Column Apple Final Cut Pro Stage */}
        <div className="grid gap-6 lg:grid-cols-12 items-start">
          {/* LEFT 8 COLS: CINEMA MONITOR + TRANSPORT + PROMPT */}
          <div className="space-y-4 lg:col-span-8">
            {stageMode === 'visual_studio' ? (
              <>
                <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#141417]">
                  {/* Clean Monitor Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-3">
                    <h1 className="truncate text-sm font-semibold text-[#F5F5F7]">
                      {latestOutput?.title ?? `${activeProject.name} · Önizleme`}
                    </h1>

                    <div className="flex flex-wrap items-center gap-2">
                      <div
                        role="group"
                        aria-label="Monitör görünüm katmanı"
                        className="inline-flex items-center rounded-full border border-white/[0.08] bg-[#0E0E11] p-0.5"
                      >
                        {(
                          [
                            { id: 'final', label: 'Final' },
                            { id: 'graybox', label: '3D Graybox' },
                            { id: 'style', label: 'Stil Ref' },
                            { id: 'compare', label: 'Karşılaştır' },
                          ] as const
                        ).map((mode) => {
                          const active = monitorMode === mode.id;
                          return (
                            <button
                              key={mode.id}
                              type="button"
                              aria-pressed={active}
                              onClick={() => setMonitorMode(mode.id)}
                              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                                active
                                  ? 'bg-[#0A84FF] text-white font-semibold'
                                  : 'text-zinc-400 hover:text-[#F5F5F7]'
                              }`}
                            >
                              {mode.id === 'compare' && (
                                <Columns2 className="h-3 w-3" aria-hidden="true" />
                              )}
                              <span>{mode.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        onClick={() => outputUploadRef.current?.click()}
                        className="rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-zinc-200 hover:bg-white/[0.1] whitespace-nowrap"
                      >
                        + Çıktı Yükle
                      </button>
                    </div>
                  </div>

                  {/* Pure Cinema Monitor Frame */}
                  <div className="relative aspect-video w-full overflow-hidden bg-black select-none">
                    {monitorMode === 'final' && hasRealVideoOutput && latestOutput?.objectUrl ? (
                      <video
                        ref={monitorVideoRef}
                        src={latestOutput.objectUrl}
                        loop={isLooping}
                        onTimeUpdate={(e) => setPlayheadSec(e.currentTarget.currentTime)}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                        className="h-full w-full object-contain"
                      />
                    ) : monitorMode === 'compare' ? (
                      <>
                        <img
                          src={finalRenderImageSrc}
                          alt="Final render"
                          style={{ transform: `scale(${scrubZoomScale})` }}
                          className="h-full w-full object-cover transition-transform duration-100"
                        />

                        <div
                          className="absolute inset-0 overflow-hidden"
                          style={{ clipPath: `inset(0 0 0 ${wipePct}%)` }}
                        >
                          <img
                            src={compareOverlaySrc}
                            alt={
                              compareLayer === 'graybox'
                                ? '3D Graybox katmanı'
                                : 'Stil referans katmanı'
                            }
                            style={{ transform: `scale(${scrubZoomScale})` }}
                            className="h-full w-full object-cover transition-transform duration-100"
                          />
                        </div>

                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-[#0A84FF]"
                          style={{ left: `${wipePct}%` }}
                        >
                          <div className="absolute top-1/2 -left-3 -translate-y-1/2 rounded-full border border-[#0A84FF] bg-[#141417] px-1.5 py-0.5 text-[10px] font-bold text-[#409CFF]">
                            ↔
                          </div>
                        </div>

                        <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur-md">
                          Final
                        </span>
                        <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur-md">
                          {compareLayer === 'graybox' ? '3D Graybox' : 'Stil Referansı'}
                        </span>
                      </>
                    ) : (
                      <img
                        src={
                          monitorMode === 'graybox'
                            ? grayboxVisualSrc
                            : monitorMode === 'style'
                              ? styleVisualSrc
                              : finalRenderImageSrc
                        }
                        alt={
                          monitorMode === 'graybox'
                            ? '3D Graybox önizleme'
                            : monitorMode === 'style'
                              ? 'Stil referans önizleme'
                              : 'Final video önizleme'
                        }
                        style={{ transform: `scale(${scrubZoomScale})` }}
                        className="h-full w-full object-cover transition-transform duration-100"
                      />
                    )}
                  </div>

                  {/* Wipe Bar when Compare Active */}
                  {monitorMode === 'compare' && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] bg-[#0E0E11] px-5 py-2.5 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-zinc-400">Sağ Katman:</span>
                        <button
                          type="button"
                          aria-pressed={compareLayer === 'graybox'}
                          onClick={() => setCompareLayer('graybox')}
                          className={`rounded-full px-3 py-1 text-[11px] font-medium ${
                            compareLayer === 'graybox'
                              ? 'bg-[#0A84FF] text-white'
                              : 'bg-white/[0.06] text-zinc-300 hover:text-white'
                          }`}
                        >
                          3D Graybox
                        </button>
                        <button
                          type="button"
                          aria-pressed={compareLayer === 'style'}
                          onClick={() => setCompareLayer('style')}
                          className={`rounded-full px-3 py-1 text-[11px] font-medium ${
                            compareLayer === 'style'
                              ? 'bg-[#0A84FF] text-white'
                              : 'bg-white/[0.06] text-zinc-300 hover:text-white'
                          }`}
                        >
                          Stil Referansı
                        </button>
                      </div>

                      <div className="flex flex-1 items-center gap-3 min-w-[180px] max-w-xs">
                        <label htmlFor="studio-wipe-range" className="text-[11px] text-zinc-400 shrink-0">
                          Bölme
                        </label>
                        <input
                          id="studio-wipe-range"
                          data-testid="studio-wipe-slider"
                          type="range"
                          min={5}
                          max={95}
                          value={wipePct}
                          onChange={(e) => setWipePct(Number(e.target.value))}
                          className="w-full accent-[#0A84FF] cursor-pointer"
                        />
                        <span className="font-mono text-[11px] text-zinc-300 tabular-nums w-8 text-right">
                          %{wipePct}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Minimalist Apple Transport Bar */}
                  <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.07] bg-[#141417] px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label="Başa sar"
                        onClick={() => {
                          setIsPlaying(false);
                          seekPlayhead(0);
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.05] text-zinc-300 hover:bg-white/[0.1] hover:text-white"
                      >
                        <SkipBack className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>

                      <button
                        type="button"
                        aria-label="Bir kare geri"
                        onClick={() =>
                          seekPlayhead(
                            stepFrameTime(
                              playheadSec,
                              -1,
                              timelineModel.totalDurationSec,
                              STUDIO_FPS
                            )
                          )
                        }
                        className="inline-flex h-8 items-center rounded-full bg-white/[0.05] px-2.5 text-[11px] text-zinc-300 hover:bg-white/[0.1] hover:text-white"
                      >
                        <ChevronLeft className="h-3 w-3" aria-hidden="true" />
                        <span>1f</span>
                      </button>

                      <button
                        type="button"
                        data-testid="studio-play-toggle"
                        aria-label={isPlaying ? 'Duraklat' : 'Oynat'}
                        onClick={() => setIsPlaying((p) => !p)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#0A84FF] px-4 text-xs font-semibold text-white hover:bg-[#2494FF]"
                      >
                        {isPlaying ? (
                          <Pause className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                        ) : (
                          <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                        )}
                        <span>{isPlaying ? 'Duraklat' : 'Oynat'}</span>
                      </button>

                      <button
                        type="button"
                        aria-label="Bir kare ileri"
                        onClick={() =>
                          seekPlayhead(
                            stepFrameTime(
                              playheadSec,
                              1,
                              timelineModel.totalDurationSec,
                              STUDIO_FPS
                            )
                          )
                        }
                        className="inline-flex h-8 items-center rounded-full bg-white/[0.05] px-2.5 text-[11px] text-zinc-300 hover:bg-white/[0.1] hover:text-white"
                      >
                        <span>1f</span>
                        <ChevronRight className="h-3 w-3" aria-hidden="true" />
                      </button>

                      <button
                        type="button"
                        aria-label="Döngü oynatma"
                        aria-pressed={isLooping}
                        onClick={() => setIsLooping((l) => !l)}
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                          isLooping
                            ? 'bg-[#0A84FF]/20 text-[#409CFF]'
                            : 'bg-white/[0.05] text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="flex-1 min-w-[120px]">
                      <input
                        type="range"
                        data-testid="studio-transport-scrubber"
                        aria-label="Video zaman çizgisi konumu"
                        min={0}
                        max={timelineModel.totalDurationSec}
                        step={1 / STUDIO_FPS}
                        value={playheadSec}
                        onChange={(e) => seekPlayhead(Number(e.target.value))}
                        className="w-full accent-[#0A84FF] cursor-pointer"
                      />
                    </div>

                    <div
                      data-testid="studio-timecode-readout"
                      className="font-mono text-xs font-medium text-zinc-300 tabular-nums shrink-0"
                    >
                      {formatTimecode(playheadSec, STUDIO_FPS)} /{' '}
                      <span className="text-zinc-500">
                        {formatTimecode(timelineModel.totalDurationSec, STUDIO_FPS)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Clean Prompt + Quick Media Swap Bar */}
                <div className="rounded-2xl border border-white/[0.08] bg-[#141417] p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label
                      htmlFor="studio-master-prompt"
                      className="text-xs font-semibold text-[#F5F5F7]"
                    >
                      Sahne Tarifi (Prompt)
                    </label>
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={() => grayboxReplaceRef.current?.click()}
                        className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-zinc-300 hover:bg-white/[0.09] hover:text-white"
                      >
                        3D Graybox Değiştir
                      </button>
                      <button
                        type="button"
                        onClick={() => styleReplaceRef.current?.click()}
                        className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-zinc-300 hover:bg-white/[0.09] hover:text-white"
                      >
                        Stil Ref Değiştir
                      </button>
                      {negativePromptAsset && (
                        <button
                          type="button"
                          onClick={() => setShowNegativePrompt((v) => !v)}
                          className="text-[#0A84FF] hover:text-[#409CFF]"
                        >
                          {showNegativePrompt ? 'Negatifi Gizle' : 'Negatif Prompt'}
                        </button>
                      )}
                    </div>
                  </div>

                  {masterPromptAsset ? (
                    <textarea
                      id="studio-master-prompt"
                      rows={3}
                      value={masterPromptAsset.previewText ?? ''}
                      onChange={(e) =>
                        onUpdateAssetContent(
                          activeProject.id,
                          masterPromptAsset.id,
                          e.target.value
                        )
                      }
                      className="w-full rounded-xl border border-white/[0.08] bg-[#0E0E11] p-3 text-xs leading-relaxed text-[#F5F5F7] placeholder:text-zinc-500 focus:border-[#0A84FF] focus:outline-none"
                    />
                  ) : (
                    <div className="rounded-xl border border-dashed border-white/[0.1] bg-[#0E0E11] p-3 text-xs text-zinc-400">
                      Bu projede henüz sahne tarifi dosyası yok.
                    </div>
                  )}

                  {showNegativePrompt && negativePromptAsset && (
                    <textarea
                      id="studio-negative-prompt"
                      aria-label="Videoda İstenmeyen Detaylar"
                      rows={2}
                      value={negativePromptAsset.previewText ?? ''}
                      onChange={(e) =>
                        onUpdateAssetContent(
                          activeProject.id,
                          negativePromptAsset.id,
                          e.target.value
                        )
                      }
                      className="w-full rounded-xl border border-white/[0.08] bg-[#0E0E11] p-3 text-xs text-zinc-300 focus:border-[#0A84FF] focus:outline-none"
                    />
                  )}
                </div>
              </>
            ) : (
              /* Clean File/Media Detail Viewer with 1-Click Return to Monitor */
              <div className="rounded-2xl border border-white/[0.08] bg-[#141417] p-5 space-y-4">
                {resolvedActiveOutput ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h2 className="text-sm font-semibold text-[#F5F5F7]">
                          {resolvedActiveOutput.title}
                        </h2>
                        <div className="text-xs text-zinc-400">
                          {resolvedActiveOutput.resolution} · {resolvedActiveOutput.durationSec} sn
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setStageMode('visual_studio')}
                        className="rounded-full bg-white/[0.08] px-3.5 py-1.5 text-xs font-medium text-[#F5F5F7] hover:bg-white/[0.14]"
                      >
                        ← Monitöre Dön
                      </button>
                    </div>
                    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
                      {resolvedActiveOutput.objectUrl &&
                      isVideoNameOrMime(
                        resolvedActiveOutput.fileName,
                        resolvedActiveOutput.mimeType
                      ) ? (
                        <video
                          controls
                          src={resolvedActiveOutput.objectUrl}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <img
                          src={resolvedActiveOutput.objectUrl || seedVisuals.finalPreview}
                          alt={resolvedActiveOutput.title}
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                  </>
                ) : resolvedActiveAsset ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-semibold text-[#F5F5F7]">
                          {resolvedActiveAsset.name}
                        </h2>
                        <div className="text-xs text-zinc-400">
                          {KIND_LABELS[resolvedActiveAsset.kind]} ·{' '}
                          {formatBytes(resolvedActiveAsset.sizeBytes)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          aria-label="Klasör kategorisi değiştir"
                          value={resolvedActiveAsset.kind}
                          onChange={(e) =>
                            onMoveAssetToFolder(
                              activeProject.id,
                              resolvedActiveAsset.id,
                              e.target.value as AssetKind
                            )
                          }
                          className="rounded-full border border-white/[0.1] bg-[#0E0E11] px-3 py-1.5 text-xs text-[#F5F5F7]"
                        >
                          {Object.entries(KIND_LABELS).map(([k, lbl]) => (
                            <option key={k} value={k}>
                              {lbl}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setStageMode('visual_studio')}
                          className="rounded-full bg-[#0A84FF] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#2494FF]"
                        >
                          ← Monitöre Dön
                        </button>
                      </div>
                    </div>

                    {isEditableTextAsset(resolvedActiveAsset) ? (
                      <textarea
                        aria-label={`${resolvedActiveAsset.name} içeriği`}
                        value={resolvedActiveAsset.previewText ?? ''}
                        onChange={(e) =>
                          onUpdateAssetContent(
                            activeProject.id,
                            resolvedActiveAsset.id,
                            e.target.value
                          )
                        }
                        rows={14}
                        className="w-full rounded-xl border border-white/[0.08] bg-[#0E0E11] p-3.5 font-mono text-xs leading-relaxed text-[#F5F5F7] focus:border-[#0A84FF] focus:outline-none"
                      />
                    ) : (
                      <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
                        {resolvedActiveAsset.objectUrl &&
                        isVideoNameOrMime(
                          resolvedActiveAsset.name,
                          resolvedActiveAsset.mimeType
                        ) ? (
                          <video
                            controls
                            src={resolvedActiveAsset.objectUrl}
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <img
                            src={
                              resolvedActiveAsset.objectUrl ||
                              getFallbackPreviewForAsset(
                                resolvedActiveAsset.name,
                                resolvedActiveAsset.kind,
                                activeProject.id
                              ) ||
                              seedVisuals.finalPreview
                            }
                            alt={resolvedActiveAsset.name}
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setStageMode('visual_studio')}
                    className="rounded-full bg-white/[0.08] px-4 py-2 text-xs text-white"
                  >
                    Monitöre Dön
                  </button>
                )}
              </div>
            )}
          </div>

          {/* RIGHT 4 COLS: SEGMENTED APPLE INSPECTOR (Ayarlar | Medya | Notlar) */}
          <aside className="space-y-4 lg:col-span-4">
            {/* Inspector Mode Switcher */}
            <div
              role="tablist"
              aria-label="Denetçi sekmeleri"
              className="grid grid-cols-3 rounded-full border border-white/[0.08] bg-[#141417] p-1"
            >
              {(
                [
                  { id: 'settings', label: 'Ayarlar' },
                  { id: 'media', label: `Medya (${mediaAssets.length})` },
                  { id: 'notes', label: 'Notlar' },
                ] as const
              ).map((tab) => {
                const active = inspectorTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setInspectorTab(tab.id)}
                    className={`rounded-full py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-white/[0.12] text-[#F5F5F7] font-semibold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {inspectorTab === 'settings' && (
              <div className="space-y-4">
                {/* Etsy & Social Media Delivery Format */}
                <section
                  aria-labelledby="studio-delivery-format-heading"
                  className="rounded-2xl border border-white/[0.08] bg-[#141417] p-4 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2
                      id="studio-delivery-format-heading"
                      className="text-xs font-semibold text-[#F5F5F7]"
                    >
                      Etsy &amp; Sosyal Medya Formatı
                    </h2>
                    <span className="font-mono text-[11px] text-zinc-400 tabular-nums">
                      {readiness.deliveryPreset.width}×{readiness.deliveryPreset.height}
                    </span>
                  </div>
                  <div
                    role="group"
                    aria-label="Hedef yayın formatı"
                    className="grid grid-cols-2 gap-1.5"
                  >
                    {Object.values(DELIVERY_PRESETS).map((preset) => {
                      const active = readiness.deliveryPreset.id === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() =>
                            onUpdateProjectDeliveryPreset?.(activeProject.id, preset.id)
                          }
                          className={`flex items-center justify-between rounded-xl px-3 py-2 text-left text-[11px] font-medium transition-colors ${
                            active
                              ? 'bg-[#0A84FF] text-white'
                              : 'bg-[#0E0E11] text-zinc-300 hover:bg-white/[0.06]'
                          }`}
                        >
                          <span className="truncate">{preset.shortLabel}</span>
                          <span
                            className={`font-mono text-[10px] tabular-nums ${
                              active ? 'text-white/85' : 'text-zinc-500'
                            }`}
                          >
                            {preset.aspectLabel}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <ComfyUiConfigPanel
                  config={config}
                  onUpdateConfig={onUpdateConfig}
                  onNavigate={onNavigate}
                />

                <BlenderRenderPanel
                  project={activeProject}
                  config={config}
                  onUpdateConfig={onUpdateConfig}
                  onDownloadFile={onDownloadFile}
                />

                {/* Calm 1-Card Zero-Config Readiness Status */}
                <section className="rounded-2xl border border-white/[0.08] bg-[#141417] p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#F5F5F7]">
                      Sahne Hazırlığı
                    </span>
                    <span
                      className={`text-xs font-semibold ${
                        readiness.zeroConfigReady
                          ? 'text-[#30D158]'
                          : 'text-[#FF9F0A]'
                      }`}
                    >
                      {readiness.zeroConfigReady ? 'Hazır' : 'Eksik Var'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-400">
                    {[
                      { label: 'İlk Kare', ok: readiness.hasFirstFrame },
                      { label: 'Son Kare', ok: readiness.hasLastFrame },
                      {
                        label: readiness.hasPreRenderedScene
                          ? 'Blender Hazır'
                          : readiness.requiresColabBlenderRender
                            ? 'Colab .blend'
                            : '3D Sahne',
                        ok:
                          readiness.hasPreRenderedScene ||
                          readiness.requiresColabBlenderRender,
                      },
                      { label: 'Sahne Tarifi', ok: readiness.hasPrompt },
                      { label: 'Motor Akışı', ok: readiness.hasWorkflow },
                      { label: 'Ayar Dosyası', ok: readiness.hasSettings },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center gap-1.5">
                        <CheckCircle2
                          className={`h-3.5 w-3.5 shrink-0 ${
                            item.ok ? 'text-[#30D158]' : 'text-zinc-600'
                          }`}
                          aria-hidden="true"
                        />
                        <span className={item.ok ? 'text-zinc-200' : 'text-zinc-500'}>
                          {item.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {inspectorTab === 'media' && (
              <div className="space-y-4">
                {/* First / Last Frame & .blend Key Slots */}
                <section
                  data-testid="studio-keyframes-panel"
                  className="rounded-2xl border border-white/[0.08] bg-[#141417] p-4 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-semibold text-[#F5F5F7]">
                      İlk / Son Kare &amp; .blend Sahnesi
                    </h2>
                    <span className="text-[11px] text-zinc-400">
                      {readiness.hasKeyframesPair ? 'Kare Çifti Tamam' : 'Opsiyonel'}
                    </span>
                  </div>

                  <div className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] bg-[#0E0E11]">
                    <div className="flex items-center justify-between gap-2 px-3 py-2.5 text-xs">
                      <div className="min-w-0">
                        <div className="font-medium text-[#F5F5F7]">İlk Kare</div>
                        <div className="truncate text-[11px] text-zinc-400">
                          {readiness.firstFrameAsset?.name ?? 'Henüz seçilmedi'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => firstFrameUploadRef.current?.click()}
                        className="shrink-0 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-zinc-200 hover:bg-white/[0.12]"
                      >
                        {readiness.firstFrameAsset ? 'Değiştir' : 'Yükle'}
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2 px-3 py-2.5 text-xs">
                      <div className="min-w-0">
                        <div className="font-medium text-[#F5F5F7]">Son Kare</div>
                        <div className="truncate text-[11px] text-zinc-400">
                          {readiness.lastFrameAsset?.name ?? 'Henüz seçilmedi'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => lastFrameUploadRef.current?.click()}
                        className="shrink-0 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-zinc-200 hover:bg-white/[0.12]"
                      >
                        {readiness.lastFrameAsset ? 'Değiştir' : 'Yükle'}
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2 px-3 py-2.5 text-xs">
                      <div className="min-w-0">
                        <div className="font-medium text-[#F5F5F7]">Blender (.blend)</div>
                        <div className="truncate text-[11px] text-zinc-400">
                          {readiness.unrenderedBlendAssets[0]?.name ??
                            readiness.renderedGrayboxAssets[0]?.name ??
                            readiness.blenderStatusLabel}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => blendUploadRef.current?.click()}
                        className="shrink-0 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-zinc-200 hover:bg-white/[0.12]"
                      >
                        {readiness.hasUnrenderedBlend ? 'Değiştir' : '.blend Ekle'}
                      </button>
                    </div>
                  </div>
                </section>

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOsDropActive(true);
                  }}
                  onDrop={(e) => void handleWorkspaceOsDrop(e)}
                  className={`rounded-2xl border border-dashed p-4 text-center transition-colors ${
                    osDropActive
                      ? 'border-[#0A84FF] bg-[#0A84FF]/10'
                      : 'border-white/[0.12] bg-[#141417]'
                  }`}
                >
                  <Upload className="mx-auto h-4 w-4 text-[#0A84FF]" aria-hidden="true" />
                  <div className="mt-1.5 text-xs font-semibold text-[#F5F5F7]">
                    Medya veya Klasör Yükle
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-[#F5F5F7] hover:bg-white/[0.1]"
                    >
                      <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                      Dosya Seç
                    </button>
                    <button
                      type="button"
                      onClick={() => folderInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-[#F5F5F7] hover:bg-white/[0.1]"
                    >
                      <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                      Klasör Seç
                    </button>
                  </div>
                  {onImportClaudeBundle && (
                    <button
                      type="button"
                      onClick={() => claudeBundleFolderRef.current?.click()}
                      className="mt-2 w-full rounded-full border border-[#0A84FF]/30 bg-[#0A84FF]/10 px-3 py-1.5 text-[11px] font-medium text-[#409CFF] hover:bg-[#0A84FF]/20"
                    >
                      Claude Klasöründen Yeni Proje Aç
                    </button>
                  )}
                </div>

                <section className="rounded-2xl border border-white/[0.08] bg-[#141417] p-4 space-y-3">
                  <h2 className="text-xs font-semibold text-[#F5F5F7]">
                    Medya Havuzu ({mediaAssets.length})
                  </h2>

                  {mediaAssets.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/[0.1] bg-[#0E0E11] px-3 py-4 text-center text-[11px] text-zinc-400">
                      Henüz medya klibi eklenmedi. Yukarıdan graybox veya stil görseli yükleyin.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2.5">
                      {mediaAssets.map((asset) => {
                        const thumb =
                          asset.objectUrl ||
                          getFallbackPreviewForAsset(asset.name, asset.kind, activeProject.id);
                        const isVideo = isVideoNameOrMime(asset.name, asset.mimeType);
                        return (
                          <button
                            key={asset.id}
                            type="button"
                            onClick={() => selectItem({ type: 'asset', id: asset.id })}
                            className="group overflow-hidden rounded-xl border border-white/[0.08] bg-[#0E0E11] text-left hover:border-[#0A84FF]/60"
                          >
                            <div className="relative aspect-video w-full overflow-hidden bg-black">
                              {thumb ? (
                                <img
                                  src={thumb}
                                  alt={asset.name}
                                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center text-zinc-500">
                                  <Film className="h-4 w-4" aria-hidden="true" />
                                </div>
                              )}
                              {isVideo && (
                                <span
                                  aria-hidden="true"
                                  className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/75 text-white"
                                >
                                  <Play className="h-2.5 w-2.5 fill-current" />
                                </span>
                              )}
                            </div>
                            <div className="p-2">
                              <div className="truncate text-[11px] font-medium text-[#F5F5F7]">
                                {asset.name}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border border-white/[0.08] bg-[#141417]">
                  <button
                    type="button"
                    onClick={() => setShowTechFiles((v) => !v)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-medium text-zinc-200 hover:text-white"
                  >
                    <span className="flex items-center gap-2">
                      <Folder className="h-3.5 w-3.5 text-[#0A84FF]" aria-hidden="true" />
                      <span>Tüm Proje Dosyaları ({activeProject.assets.length})</span>
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-zinc-400 transition-transform ${
                        showTechFiles ? 'rotate-180' : ''
                      }`}
                      aria-hidden="true"
                    />
                  </button>

                  {showTechFiles && (
                    <div className="max-h-56 divide-y divide-white/[0.06] overflow-y-auto border-t border-white/[0.07] px-2 py-1">
                      {activeProject.assets.map((asset) => (
                        <button
                          key={asset.id}
                          type="button"
                          onClick={() => selectItem({ type: 'asset', id: asset.id })}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] text-zinc-300 hover:bg-white/[0.05] hover:text-white"
                        >
                          {renderFileIcon(asset)}
                          <span className="truncate">{asset.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {inspectorTab === 'notes' && (
              <section className="rounded-2xl border border-white/[0.08] bg-[#141417] p-5 space-y-3">
                <h2 className="text-sm font-semibold text-[#F5F5F7]">
                  Videoyu Değerlendir
                </h2>

                {latestOutput ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-white/[0.07] bg-[#0E0E11] px-3.5 py-2.5">
                      <div className="truncate text-xs font-semibold text-[#F5F5F7]">
                        {latestOutput.title}
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-400">
                        {latestOutput.createdAt} · {latestOutput.resolution}
                      </div>
                    </div>

                    <textarea
                      id="studio-feedback-input"
                      aria-label="Düzeltme notunuz"
                      rows={3}
                      placeholder="Örn: Işık biraz daha sıcak olsun..."
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      className="w-full rounded-xl border border-white/[0.1] bg-[#0E0E11] p-3 text-xs text-[#F5F5F7] placeholder:text-zinc-500 focus:border-[#0A84FF] focus:outline-none"
                    />

                    <div className="flex items-center gap-2">
                      <select
                        aria-label="Önem derecesi"
                        value={feedbackSeverity}
                        onChange={(e) =>
                          setFeedbackSeverity(e.target.value as 'dusuk' | 'orta' | 'yuksek')
                        }
                        className="rounded-full border border-white/[0.1] bg-[#0E0E11] px-3 py-1.5 text-xs text-[#F5F5F7]"
                      >
                        <option value="dusuk">Küçük</option>
                        <option value="orta">Orta</option>
                        <option value="yuksek">Öncelikli</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleEvaluateWithClaude(latestOutput)}
                        disabled={!feedbackText.trim()}
                        className="flex-1 rounded-full bg-[#0A84FF] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#2494FF] disabled:opacity-40"
                      >
                        Not Ekle
                      </button>
                    </div>

                    {latestOutput.notes.length > 0 && (
                      <div className="space-y-2 border-t border-white/[0.07] pt-3">
                        {latestOutput.notes.slice(0, 2).map((n) => (
                          <div
                            key={n.id}
                            className="rounded-xl border border-white/[0.07] bg-[#0E0E11] p-3 text-xs space-y-1.5"
                          >
                            <p className="text-zinc-200">{n.note}</p>
                            {n.generatedBrief && (
                              <button
                                type="button"
                                onClick={() => handleCopyText(n.id, n.generatedBrief ?? '')}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0A84FF] hover:text-[#409CFF]"
                              >
                                {copiedId === n.id ? (
                                  <>
                                    <Check className="h-3 w-3" aria-hidden="true" />
                                    Kopyalandı
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3 w-3" aria-hidden="true" />
                                    Claude Talimatını Kopyala
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400">
                    İlk videonuz üretildiğinde buradan izleyip revizyon notu ekleyebilirsiniz.
                  </p>
                )}
              </section>
            )}
          </aside>
        </div>

        {/* SLEEK BOTTOM NLE TIMELINE & QUEUE DOCK */}
        <section
          data-testid="studio-timeline-dock"
          aria-labelledby="studio-timeline-heading"
          className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#141417]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] px-5 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#F5F5F7]">
              <Layers className="h-3.5 w-3.5 text-[#0A84FF]" aria-hidden="true" />
              <h2 id="studio-timeline-heading">
                Zaman Çizgisi ({batchQueue.length} iş)
              </h2>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('colab')}
              className="text-xs font-medium text-[#0A84FF] hover:text-[#409CFF]"
            >
              Üretim &amp; Zamanlama →
            </button>
          </div>

          <div className="relative bg-[#0E0E11]">
            {/* Time Ruler */}
            <div className="flex border-b border-white/[0.06]">
              <div className="w-32 shrink-0 border-r border-white/[0.06] px-4 py-1.5 text-[10px] font-medium text-zinc-500 sm:w-40">
                Kanallar
              </div>
              <div
                onClick={handleTimelineRulerClick}
                role="slider"
                tabIndex={0}
                aria-label="Zaman çizgisi cetveli"
                aria-valuemin={0}
                aria-valuemax={timelineModel.totalDurationSec}
                aria-valuenow={Number(playheadSec.toFixed(2))}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight') {
                    seekPlayhead(
                      stepFrameTime(playheadSec, 6, timelineModel.totalDurationSec, STUDIO_FPS)
                    );
                  } else if (e.key === 'ArrowLeft') {
                    seekPlayhead(
                      stepFrameTime(playheadSec, -6, timelineModel.totalDurationSec, STUDIO_FPS)
                    );
                  }
                }}
                className="relative flex-1 cursor-pointer select-none py-1.5"
              >
                {rulerMarkers.map((sec) => {
                  const pct = (sec / timelineModel.totalDurationSec) * 100;
                  return (
                    <span
                      key={sec}
                      style={{ left: `${Math.min(96, pct)}%` }}
                      className="absolute top-1.5 -translate-x-1/2 font-mono text-[10px] text-zinc-500 tabular-nums"
                    >
                      {String(Math.floor(sec / 60)).padStart(2, '0')}:
                      {String(sec % 60).padStart(2, '0')}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Track Lanes */}
            <div className="relative divide-y divide-white/[0.06]">
              <div className="pointer-events-none absolute inset-y-0 left-32 right-0 z-20 sm:left-40">
                <div
                  className="absolute inset-y-0 w-0.5 bg-[#0A84FF]"
                  style={{ left: `${playheadPct}%` }}
                >
                  <div className="-ml-1 h-2 w-2.5 rounded-b bg-[#0A84FF]" />
                </div>
              </div>

              {/* V1 Track */}
              <div className="flex min-h-[48px] items-stretch">
                <div className="flex w-32 shrink-0 items-center border-r border-white/[0.06] bg-[#141417] px-4 text-[11px] font-medium text-[#F5F5F7] sm:w-40">
                  V1 Final
                </div>
                <div className="relative flex-1 p-1.5">
                  {timelineModel.videoClips.map((clip) => {
                    const pos = computeTimelineClipStyle(clip, timelineModel.totalDurationSec);
                    const batchIndex =
                      clip.sourceType === 'batch' && clip.refId
                        ? batchQueue.findIndex((j) => j.id === clip.refId)
                        : -1;
                    const colorCls =
                      clip.status === 'ready'
                        ? 'border-[#30D158]/40 bg-[#30D158]/15 text-emerald-100'
                        : clip.status === 'rendering'
                          ? 'border-[#FF9F0A]/50 bg-[#FF9F0A]/15 text-amber-100'
                          : 'border-[#0A84FF]/40 bg-[#0A84FF]/15 text-blue-100';

                    return (
                      <div
                        key={clip.id}
                        style={{ left: `${pos.leftPct}%`, width: `${pos.widthPct}%` }}
                        className={`absolute top-1.5 bottom-1.5 flex items-center justify-between gap-1 overflow-hidden rounded-lg border px-2.5 ${colorCls}`}
                      >
                        <button
                          type="button"
                          onClick={() => handleTimelineClipClick(clip)}
                          className="min-w-0 flex-1 truncate text-left text-[11px] font-medium"
                        >
                          {clip.label}
                        </button>

                        {batchIndex >= 0 && clip.refId && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              aria-label={`${clip.label} yukarı`}
                              disabled={batchIndex === 0}
                              onClick={() => onReorderBatchJob(batchIndex, 'up')}
                              className="rounded p-0.5 text-zinc-300 hover:bg-black/30 disabled:opacity-30"
                            >
                              <ArrowUp className="h-3 w-3" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              aria-label={`${clip.label} aşağı`}
                              disabled={batchIndex === batchQueue.length - 1}
                              onClick={() => onReorderBatchJob(batchIndex, 'down')}
                              className="rounded p-0.5 text-zinc-300 hover:bg-black/30 disabled:opacity-30"
                            >
                              <ArrowDown className="h-3 w-3" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              aria-label={`${clip.label} sil`}
                              onClick={() => onRemoveBatchJob(clip.refId!)}
                              className="rounded p-0.5 text-zinc-300 hover:text-[#FF453A]"
                            >
                              <Trash2 className="h-3 w-3" aria-hidden="true" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* V2 Track */}
              <div className="flex min-h-[40px] items-stretch">
                <div className="flex w-32 shrink-0 items-center border-r border-white/[0.06] bg-[#141417] px-4 text-[11px] font-medium text-zinc-300 sm:w-40">
                  V2 Graybox
                </div>
                <div className="relative flex-1 p-1.5">
                  {timelineModel.grayboxClips.map((clip) => {
                    const pos = computeTimelineClipStyle(clip, timelineModel.totalDurationSec);
                    return (
                      <button
                        key={clip.id}
                        type="button"
                        onClick={() => handleTimelineClipClick(clip)}
                        style={{ left: `${pos.leftPct}%`, width: `${pos.widthPct}%` }}
                        className="absolute top-1.5 bottom-1.5 overflow-hidden rounded-lg border border-white/[0.1] bg-white/[0.06] px-2.5 text-left text-[11px] text-zinc-200 hover:border-[#0A84FF]"
                      >
                        <span className="block truncate">{clip.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Ref Track */}
              <div className="flex min-h-[40px] items-stretch">
                <div className="flex w-32 shrink-0 items-center border-r border-white/[0.06] bg-[#141417] px-4 text-[11px] font-medium text-zinc-300 sm:w-40">
                  Stil &amp; Tarif
                </div>
                <div className="relative flex-1 p-1.5">
                  {timelineModel.referenceClips.map((clip) => {
                    const pos = computeTimelineClipStyle(clip, timelineModel.totalDurationSec);
                    return (
                      <button
                        key={clip.id}
                        type="button"
                        onClick={() => handleTimelineClipClick(clip)}
                        style={{ left: `${pos.leftPct}%`, width: `${pos.widthPct}%` }}
                        className="absolute top-1.5 bottom-1.5 overflow-hidden rounded-lg border border-[#FF9F0A]/30 bg-[#FF9F0A]/10 px-2.5 text-left text-[11px] text-amber-100 hover:border-[#FF9F0A]"
                      >
                        <span className="block truncate">{clip.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Drive Overwrite Confirm Modal */}
      {syncStage === 'confirm' && pendingPlan && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="workbench-overwrite-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
        >
          <div className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#141417] p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-[#FF9F0A] shrink-0" aria-hidden="true" />
              <div className="space-y-2">
                <h2 id="workbench-overwrite-title" className="text-base font-semibold text-[#F5F5F7]">
                  Mevcut Drive Dosyaları Güncellensin mi?
                </h2>
                <p className="text-xs text-zinc-300">
                  Google Drive’da aynı ada sahip{' '}
                  <strong>{pendingPlan.existingNamesToOverwrite.length}</strong> dosya bulundu.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPendingPlan(null);
                  setSyncStage('idle');
                }}
                className="rounded-full border border-white/[0.1] px-4 py-2 text-xs font-medium text-zinc-200 hover:bg-white/[0.08]"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={() => void runDriveUpload(pendingPlan)}
                className="rounded-full bg-[#0A84FF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2494FF]"
              >
                Üzerine Yaz &amp; Aktar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
