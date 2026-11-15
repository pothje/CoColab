import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CloudUpload,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  Film,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Layers,
  Loader2,
  MessageSquarePlus,
  Network,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  Workflow,
  AlertTriangle,
} from 'lucide-react';
import {
  AuditFinding,
  AssetKind,
  AutomationConfig,
  BatchQueueItem,
  ColabProject,
  OutputRenderItem,
  ProjectAssetFile,
  RevisionFeedbackNote,
  TelemetrySnapshot,
  WorkspaceTab,
} from '../types/automation';
import {
  buildStackRelativePath,
  buildTargetColabPath,
  calculateBatchTimeSavings,
  classifyProjectFiles,
  formatBytes,
  validateAssetsCompleteness,
  type RawFileInput,
} from '../utils/guardrailEngine';
import { buildClaudeRevisionBrief } from '../utils/claudeGenerators';
import {
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
import {
  getFallbackPreviewForAsset,
  getSeedVisualForProject,
} from '../data/studioVisuals';
import { GoogleSignInButton } from './GoogleSignInButton';
import { ComfyUiConfigPanel } from './ComfyUiConfigPanel';

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
  onCreateProject: (name: string, description: string) => void;
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
  onAddToBatchQueue: (projectId: string, sceneLabel: string) => void;
  onReorderBatchJob: (index: number, direction: 'up' | 'down') => void;
  onRemoveBatchJob: (jobId: string) => void;
  onConnectDrive: () => Promise<void>;
  onSendBridgePing: () => Promise<void>;
  onResetTelemetry: () => Promise<void>;
  onDownloadFile: (filename: string, content: string | Blob, mime: string) => void;
  onNavigate: (tab: WorkspaceTab) => void;
}

type StageViewMode = 'visual_studio' | 'item_detail' | 'pipeline';
type SelectedRef =
  | { type: 'asset'; id: string }
  | { type: 'output'; id: string };

interface FolderNodeSpec {
  id: string;
  label: string;
  acceptKind: AssetKind;
  matchKinds: AssetKind[];
}

const FOLDER_TREE: FolderNodeSpec[] = [
  {
    id: 'folder-graybox',
    label: '3D Blender Graybox',
    acceptKind: 'blender_graybox',
    matchKinds: ['blender_graybox'],
  },
  {
    id: 'folder-refs',
    label: 'Stil & Hareket Referansı',
    acceptKind: 'reference_media',
    matchKinds: ['reference_media'],
  },
  {
    id: 'folder-prompts',
    label: 'Sahne Tarifleri (Prompt)',
    acceptKind: 'prompts',
    matchKinds: ['prompts'],
  },
  {
    id: 'folder-settings',
    label: 'Motor & Kalite Ayarları',
    acceptKind: 'comfyui_workflow',
    matchKinds: ['comfyui_workflow', 'settings'],
  },
  {
    id: 'folder-schema',
    label: 'Proje Haritası',
    acceptKind: 'schema',
    matchKinds: ['schema'],
  },
];

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

async function readDroppedEntryFiles(
  entry: FileSystemEntry,
  prefix = ''
): Promise<RawFileInput[]> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await new Promise<File>((resolve, reject) =>
      fileEntry.file(resolve, reject)
    );
    const rel = prefix ? `${prefix}/${file.name}` : file.name;
    const isText =
      file.type.startsWith('text/') ||
      file.type === 'application/json' ||
      /\.(json|ya?ml|txt|md|toml|py|cfg|ini)$/i.test(file.name);
    const previewText =
      isText && file.size <= 300_000
        ? await file.text()
        : `${file.type || 'binary'} · ${formatBytes(file.size)}`;
    const objectUrl =
      file.type.startsWith('image/') || file.type.startsWith('video/')
        ? URL.createObjectURL(file)
        : undefined;
    return [
      {
        name: file.name,
        relativePath: rel,
        sizeBytes: file.size,
        mimeType: file.type,
        previewText,
        objectUrl,
        rawFile: file,
      },
    ];
  }
  if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const reader = dirEntry.createReader();
    const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      const all: FileSystemEntry[] = [];
      const readBatch = () => {
        reader.readEntries((batch) => {
          if (batch.length === 0) {
            resolve(all);
          } else {
            all.push(...batch);
            readBatch();
          }
        }, reject);
      };
      readBatch();
    });
    const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
    const nested = await Promise.all(
      entries.map((child) => readDroppedEntryFiles(child, nextPrefix))
    );
    return nested.flat();
  }
  return [];
}

async function filesToRawInputs(fileList: FileList): Promise<RawFileInput[]> {
  return Promise.all(
    Array.from(fileList).map(async (file) => {
      const isText =
        file.type.startsWith('text/') ||
        file.type === 'application/json' ||
        /\.(json|ya?ml|txt|md|toml|py|cfg|ini)$/i.test(file.name);
      const previewText =
        isText && file.size <= 300_000
          ? await file.text()
          : `${file.type || 'binary'} · ${formatBytes(file.size)}`;
      const objectUrl =
        file.type.startsWith('image/') || file.type.startsWith('video/')
          ? URL.createObjectURL(file)
          : undefined;
      const rel =
        (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      return {
        name: file.name,
        relativePath: rel,
        sizeBytes: file.size,
        mimeType: file.type,
        previewText,
        objectUrl,
        rawFile: file,
      };
    })
  );
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
  wsStatus,
  ingestToken,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
  onUpdateProjectAssets,
  onUpdateAssetContent,
  onMoveAssetToFolder,
  onAddOutputToProject,
  onAddRevisionFeedback,
  onAddToBatchQueue,
  onReorderBatchJob,
  onRemoveBatchJob,
  onConnectDrive,
  onDownloadFile,
  onNavigate,
}: DesktopWorkbenchViewProps) {
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const outputUploadRef = useRef<HTMLInputElement | null>(null);
  const grayboxReplaceRef = useRef<HTMLInputElement | null>(null);
  const styleReplaceRef = useRef<HTMLInputElement | null>(null);

  const activeProject =
    projects.find((p) => p.id === activeProjectId) ?? projects[0];

  const [stageMode, setStageMode] = useState<StageViewMode>('visual_studio');
  const [selectedRef, setSelectedRef] = useState<SelectedRef | null>(null);
  const [showTechFiles, setShowTechFiles] = useState<boolean>(false);
  const [showNegativePrompt, setShowNegativePrompt] = useState<boolean>(false);

  const [creatingNew, setCreatingNew] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [newDesc, setNewDesc] = useState<string>('');
  const [osDropActive, setOsDropActive] = useState<boolean>(false);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [draggingAssetId, setDraggingAssetId] = useState<string | null>(null);

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

  const completeness = useMemo(
    () => validateAssetsCompleteness(activeProject.assets),
    [activeProject.assets]
  );

  const savings = useMemo(
    () => calculateBatchTimeSavings(batchQueue, config.setupMinutesEstimate),
    [batchQueue, config.setupMinutesEstimate]
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

  function selectItem(ref: SelectedRef) {
    setSelectedRef(ref);
    setStageMode('item_detail');
  }

  function handleProjectSwitch(nextId: string) {
    onSelectProject(nextId);
    setSelectedRef(null);
    setStageMode('visual_studio');
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
    setDragOverFolderId(null);

    const internalAssetId = e.dataTransfer.getData('application/x-colabforge-asset-id');
    if (internalAssetId && forcedKind) {
      onMoveAssetToFolder(activeProject.id, internalAssetId, forcedKind);
      setDraggingAssetId(null);
      return;
    }

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
    selectItem({ type: 'output', id: nextOutput.id });
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

  function handleQuickReplaceKind(kind: AssetKind, file: File) {
    const existing = activeProject.assets.find((a) => a.kind === kind);
    if (existing) {
      handleReplaceMediaAsset(existing, file);
    } else {
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
            relativePath: buildStackRelativePath(kind, file.name),
            targetColabPath: buildTargetColabPath(config.workspaceRoot, kind, file.name),
          },
        ]);
      }
    }
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
      return <Workflow className="h-3.5 w-3.5 text-blue-600 shrink-0" aria-hidden="true" />;
    }
    if (isVideoNameOrMime(asset.name, asset.mimeType)) {
      return <Film className="h-3.5 w-3.5 text-amber-600 shrink-0" aria-hidden="true" />;
    }
    if (asset.mimeType.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(asset.name)) {
      return <ImageIcon className="h-3.5 w-3.5 text-emerald-600 shrink-0" aria-hidden="true" />;
    }
    if (asset.kind === 'prompts') {
      return <FileText className="h-3.5 w-3.5 text-slate-600 shrink-0" aria-hidden="true" />;
    }
    return <FileCode2 className="h-3.5 w-3.5 text-slate-500 shrink-0" aria-hidden="true" />;
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

  return (
    <div
      className="min-h-[calc(100vh-57px)] bg-[#F8F9FB]"
      onDragOver={(e) => {
        if (!draggingAssetId) {
          e.preventDefault();
          setOsDropActive(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) {
          setOsDropActive(false);
        }
      }}
      onDrop={(e) => {
        if (!draggingAssetId) {
          void handleWorkspaceOsDrop(e);
        }
      }}
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

      {/* Clean Studio Action Bar */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-6">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 whitespace-nowrap"
            >
              <span>← Projeler</span>
            </button>

            <select
              aria-label="Aktif proje seçimi"
              value={activeProject.id}
              onChange={(e) => handleProjectSwitch(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 focus:border-blue-600 focus:outline-none"
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
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Yeni Proje
            </button>

            {projects.length > 1 && (
              <button
                type="button"
                aria-label={`${activeProject.name} projesini sil`}
                onClick={() => onDeleteProject(activeProject.id)}
                className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}

            <span className="hidden text-xs text-slate-500 md:inline">
              · {activeProject.assets.length} dosya hazır
              {wsStatus === 'connected' ? ' · Canlı Bağlantı Açık' : ''}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!driveAccessToken ? (
              <GoogleSignInButton
                onClick={onConnectDrive}
                disabled={isSigningIn}
                label={isSigningIn ? 'Bağlanıyor...' : 'Google Drive Bağla'}
              />
            ) : (
              <button
                type="button"
                onClick={handleStartDriveSync}
                disabled={syncStage === 'scanning' || syncStage === 'uploading'}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
              >
                {syncStage === 'scanning' || syncStage === 'uploading' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <CloudUpload className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
                )}
                {driveUserEmail ? 'Drive’a Gönder' : 'Drive’a Aktar'}
              </button>
            )}

            <button
              type="button"
              onClick={handleDownloadZip}
              disabled={zipLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <Archive className="h-3.5 w-3.5" aria-hidden="true" />
              {zipLoading ? 'Paketleniyor...' : 'Tam Paket (.zip)'}
            </button>

            <button
              type="button"
              onClick={() => {
                const n =
                  batchQueue.filter((j) => j.projectId === activeProject.id).length + 1;
                onAddToBatchQueue(
                  activeProject.id,
                  `${activeProject.name} · Sahne ${String(n).padStart(2, '0')}`
                );
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Üretim Sırasına Ekle
            </button>
          </div>
        </div>

        {creatingNew && (
          <div className="mx-auto max-w-[1600px] border-t border-slate-200 bg-slate-50 px-4 py-3 lg:px-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="text"
                placeholder="Yeni proje adı (Örn: Mağaza Vitrini Tanıtımı)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
              />
              <input
                type="text"
                placeholder="Kısa sahne açıklaması"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
              />
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setCreatingNew(false)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!newName.trim()) return;
                    onCreateProject(
                      newName.trim(),
                      newDesc.trim() || 'Görsel video üretim projesi'
                    );
                    setNewName('');
                    setNewDesc('');
                    setCreatingNew(false);
                  }}
                  className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  Proje Oluştur
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main 3-Column Visual Studio Grid */}
      <div className="mx-auto max-w-[1600px] px-4 py-5 lg:px-6">
        {(syncError || syncResult) && (
          <div className="mb-4">
            {syncError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800">
                {syncError}
              </div>
            )}
            {syncResult && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900">
                <span>
                  <strong>{syncResult.uploadedCount} dosya</strong> Google Drive’a aktarıldı ve
                  çalıştırmaya hazır.
                </span>
                <a
                  href={syncResult.colabLaunchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                >
                  Colab Oturumunu Aç
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-12 items-start">
          {/* LEFT RAIL: VISUAL MEDIA LIBRARY & DRAG-DROP */}
          <aside className="space-y-4 lg:col-span-3">
            {/* Visual Drop Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setOsDropActive(true);
              }}
              onDrop={(e) => void handleWorkspaceOsDrop(e)}
              className={`rounded-xl border border-dashed p-4 text-center transition-colors ${
                osDropActive
                  ? 'border-blue-500 bg-blue-50 text-blue-800'
                  : 'border-slate-300 bg-white text-slate-600'
              }`}
            >
              <Upload className="mx-auto h-5 w-5 text-blue-600" aria-hidden="true" />
              <div className="mt-2 text-xs font-semibold text-slate-900">
                Dosya veya Klasör Sürükleyin
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">
                3D video, referans görsel veya tüm proje klasörünü bırakın
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-100 whitespace-nowrap"
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  Dosya Seç
                </button>
                <button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-100 whitespace-nowrap"
                >
                  <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  Klasör Seç
                </button>
              </div>
            </div>

            {/* Visual Media Cards */}
            <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-slate-900">
                  Sahne Medyaları ({mediaAssets.length})
                </h2>
                <button
                  type="button"
                  onClick={() => outputUploadRef.current?.click()}
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                >
                  + Render Ekle
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {mediaAssets.map((asset) => {
                  const thumb =
                    asset.objectUrl ||
                    getFallbackPreviewForAsset(asset.name, asset.kind, activeProject.id);
                  const isVideo = isVideoNameOrMime(asset.name, asset.mimeType);
                  const isSelected =
                    stageMode === 'item_detail' &&
                    selectedRef?.type === 'asset' &&
                    selectedRef.id === asset.id;
                  const cardTitle =
                    asset.kind === 'blender_graybox'
                      ? isVideo
                        ? '3D Kamera Videosu'
                        : '3D Graybox Kare'
                      : isVideo
                        ? 'Hareket Videosu'
                        : 'Stil Görseli';

                  return (
                    <button
                      key={asset.id}
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-colabforge-asset-id', asset.id);
                        setDraggingAssetId(asset.id);
                      }}
                      onDragEnd={() => {
                        setDraggingAssetId(null);
                        setDragOverFolderId(null);
                      }}
                      onClick={() => selectItem({ type: 'asset', id: asset.id })}
                      className={`group overflow-hidden rounded-lg border text-left transition-colors ${
                        isSelected
                          ? 'border-blue-600 ring-1 ring-blue-600'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="relative aspect-video w-full overflow-hidden bg-slate-100">
                        {thumb ? (
                          <img
                            src={thumb}
                            alt={asset.name}
                            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-slate-400">
                            <Film className="h-5 w-5" aria-hidden="true" />
                          </div>
                        )}
                        {isVideo && (
                          <span
                            aria-hidden="true"
                            className="absolute bottom-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/75 text-white"
                          >
                            <Play className="h-2.5 w-2.5 fill-current" />
                          </span>
                        )}
                      </div>
                      <div className="p-2">
                        <div className="truncate text-[11px] font-semibold text-slate-900">
                          {cardTitle}
                        </div>
                        <div className="truncate text-[10px] text-slate-500">
                          {asset.name}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Collapsible Project Files & Folders (for moving or advanced inspection) */}
            <section className="rounded-xl border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setShowTechFiles((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-bold text-slate-800 hover:bg-slate-50"
              >
                <span className="flex items-center gap-2">
                  <Folder className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
                  <span>Tüm Proje Dosyaları ({activeProject.assets.length})</span>
                </span>
                {showTechFiles ? (
                  <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                )}
              </button>

              {showTechFiles && (
                <div className="border-t border-slate-200 p-2.5 space-y-2 max-h-80 overflow-y-auto">
                  {FOLDER_TREE.map((folder) => {
                    const items = activeProject.assets.filter((a) =>
                      folder.matchKinds.includes(a.kind)
                    );
                    const isDropTarget = dragOverFolderId === folder.id;
                    return (
                      <div
                        key={folder.id}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOverFolderId(folder.id);
                        }}
                        onDragLeave={() => {
                          if (dragOverFolderId === folder.id) setDragOverFolderId(null);
                        }}
                        onDrop={(e) => void handleWorkspaceOsDrop(e, folder.acceptKind)}
                        className={`rounded-lg p-1.5 ${
                          isDropTarget ? 'bg-blue-50 ring-1 ring-blue-300' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between px-1.5 py-1 text-[11px] font-semibold text-slate-500">
                          <span>{folder.label}</span>
                          <span className="tabular-nums">{items.length}</span>
                        </div>
                        <div className="space-y-0.5">
                          {items.map((asset) => {
                            const isSelected =
                              stageMode === 'item_detail' &&
                              selectedRef?.type === 'asset' &&
                              selectedRef.id === asset.id;
                            return (
                              <div
                                key={asset.id}
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData(
                                    'application/x-colabforge-asset-id',
                                    asset.id
                                  );
                                  setDraggingAssetId(asset.id);
                                }}
                                onDragEnd={() => {
                                  setDraggingAssetId(null);
                                  setDragOverFolderId(null);
                                }}
                                onClick={() => selectItem({ type: 'asset', id: asset.id })}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    selectItem({ type: 'asset', id: asset.id });
                                  }
                                }}
                                className={`flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1 text-xs ${
                                  isSelected
                                    ? 'bg-blue-50 text-blue-700 font-semibold'
                                    : 'text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <span className="flex items-center gap-1.5 min-w-0">
                                  {renderFileIcon(asset)}
                                  <span className="truncate">{asset.name}</span>
                                </span>
                                <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                                  {formatBytes(asset.sizeBytes)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </aside>

          {/* CENTER STAGE: VISUAL-FIRST STUDIO CANVAS */}
          <section className="space-y-4 lg:col-span-6 min-w-0">
            {/* Stage Switcher Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setStageMode('visual_studio')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                    stageMode === 'visual_studio'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
                  Görsel Stüdyo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedRef && activeProject.assets[0]) {
                      setSelectedRef({ type: 'asset', id: activeProject.assets[0].id });
                    }
                    setStageMode('item_detail');
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                    stageMode === 'item_detail'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  Dosya Önizleme
                </button>
                <button
                  type="button"
                  onClick={() => setStageMode('pipeline')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                    stageMode === 'pipeline'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Network className="h-3.5 w-3.5" aria-hidden="true" />
                  Üretim Akışı
                </button>
              </div>

              <span className="text-xs text-slate-500 truncate max-w-xs">
                {activeProject.description}
              </span>
            </div>

            {stageMode === 'visual_studio' && (
              <div className="space-y-4">
                {/* HERO 16:9 FINAL RENDER SHOWCASE */}
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                    <div>
                      <h1 className="text-sm font-bold text-slate-900">
                        {latestOutput ? latestOutput.title : `${activeProject.name} · Sahne Önizleme`}
                      </h1>
                      <p className="text-[11px] text-slate-500">
                        {latestOutput
                          ? `${latestOutput.resolution} · ${latestOutput.durationSec} sn · ${latestOutput.gpuUsed}`
                          : 'Örnek final video görünümü · Üretim tamamlandığında gerçek çıktı burada oynatılır'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => outputUploadRef.current?.click()}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-100 whitespace-nowrap"
                    >
                      + Çıktı Yükle
                    </button>
                  </div>

                  <div className="aspect-video max-h-[340px] w-full bg-slate-100 overflow-hidden">
                    {latestOutput?.objectUrl &&
                    isVideoNameOrMime(latestOutput.fileName, latestOutput.mimeType) ? (
                      <video
                        controls
                        src={latestOutput.objectUrl}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <img
                        src={finalRenderImageSrc}
                        alt={`${activeProject.name} final sahne önizlemesi`}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                </div>

                {/* 2-CARD VISUAL INPUT COMPARISON (GRAYBOX + STYLE REF) */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <div className="flex items-center justify-between border-b border-slate-200 px-3.5 py-2.5">
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          3D Kamera &amp; Graybox
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[180px]">
                          {grayboxImageAsset?.name ?? 'cam01_graybox_clay.png'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => grayboxReplaceRef.current?.click()}
                        className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Değiştir
                      </button>
                    </div>
                    <div className="aspect-video w-full bg-slate-100 overflow-hidden">
                      <img
                        src={grayboxVisualSrc}
                        alt="3D Blender graybox kamera kılavuzu"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <div className="flex items-center justify-between border-b border-slate-200 px-3.5 py-2.5">
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          Stil &amp; Materyal Referansı
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[180px]">
                          {styleRefAsset?.name ?? 'style_ref_lobby.png'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => styleReplaceRef.current?.click()}
                        className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Değiştir
                      </button>
                    </div>
                    <div className="aspect-video w-full bg-slate-100 overflow-hidden">
                      <img
                        src={styleVisualSrc}
                        alt="Stil ve doku referans görseli"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  </div>
                </div>

                {/* PLAIN-LANGUAGE PROMPT COMPOSER */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label
                        htmlFor="studio-master-prompt"
                        className="block text-xs font-bold text-slate-900"
                      >
                        Sahne Tarifi — Videoda Ne Oluşturulsun?
                      </label>
                      <p className="text-[11px] text-slate-500">
                        Yazdığınız tarif otomatik olarak projeye kaydedilir ve video motoruna
                        gönderilir.
                      </p>
                    </div>
                    {negativePromptAsset && (
                      <button
                        type="button"
                        onClick={() => setShowNegativePrompt((v) => !v)}
                        className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                      >
                        {showNegativePrompt ? 'Hariç Tutulanları Gizle' : 'Hariç Tutulan Detaylar'}
                      </button>
                    )}
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
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 p-3 text-xs leading-relaxed text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
                    />
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500">
                      Bu projede henüz sahne tarifi dosyası yok.
                    </div>
                  )}

                  {showNegativePrompt && negativePromptAsset && (
                    <div className="space-y-1 pt-1">
                      <label
                        htmlFor="studio-negative-prompt"
                        className="block text-[11px] font-semibold text-slate-700"
                      >
                        Videoda İstenmeyen / Kaçınılacak Detaylar
                      </label>
                      <textarea
                        id="studio-negative-prompt"
                        rows={2}
                        value={negativePromptAsset.previewText ?? ''}
                        onChange={(e) =>
                          onUpdateAssetContent(
                            activeProject.id,
                            negativePromptAsset.id,
                            e.target.value
                          )
                        }
                        className="w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-xs text-slate-800 focus:border-blue-600 focus:bg-white focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {stageMode === 'item_detail' && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                {resolvedActiveOutput ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                      <div>
                        <h2 className="text-sm font-bold text-slate-900">
                          {resolvedActiveOutput.title}
                        </h2>
                        <div className="text-xs text-slate-500">
                          {resolvedActiveOutput.resolution} · {resolvedActiveOutput.durationSec}{' '}
                          sn · {resolvedActiveOutput.gpuUsed}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setStageMode('visual_studio')}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Stüdyoya Dön
                      </button>
                    </div>
                    <div className="aspect-video w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                      {resolvedActiveOutput.objectUrl &&
                      isVideoNameOrMime(
                        resolvedActiveOutput.fileName,
                        resolvedActiveOutput.mimeType
                      ) ? (
                        <video
                          controls
                          src={resolvedActiveOutput.objectUrl}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <img
                          src={resolvedActiveOutput.objectUrl || seedVisuals.finalPreview}
                          alt={resolvedActiveOutput.title}
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                  </div>
                ) : resolvedActiveAsset ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                      <div>
                        <h2 className="text-sm font-bold text-slate-900">
                          {resolvedActiveAsset.name}
                        </h2>
                        <div className="text-xs text-slate-500">
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
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-600 focus:outline-none"
                        >
                          {Object.entries(KIND_LABELS).map(([k, lbl]) => (
                            <option key={k} value={k}>
                              {lbl}
                            </option>
                          ))}
                        </select>
                        {resolvedActiveAsset.previewText && (
                          <button
                            type="button"
                            onClick={() =>
                              handleCopyText(
                                resolvedActiveAsset.id,
                                resolvedActiveAsset.previewText ?? ''
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            {copiedId === resolvedActiveAsset.id ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            Kopyala
                          </button>
                        )}
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
                        className="w-full rounded-lg border border-slate-300 bg-slate-50 p-3.5 font-mono text-xs leading-relaxed text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
                      />
                    ) : (
                      <div className="space-y-3">
                        <div className="aspect-video w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                          {resolvedActiveAsset.objectUrl &&
                          isVideoNameOrMime(
                            resolvedActiveAsset.name,
                            resolvedActiveAsset.mimeType
                          ) ? (
                            <video
                              controls
                              src={resolvedActiveAsset.objectUrl}
                              className="h-full w-full object-cover"
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
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700">
                          <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                          Yeni Dosya ile Değiştir
                          <input
                            type="file"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleReplaceMediaAsset(resolvedActiveAsset, file);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-12 text-center text-xs text-slate-500">
                    Soldaki sahne medyasından veya proje dosyalarından bir öge seçin.
                  </div>
                )}
              </div>
            )}

            {stageMode === 'pipeline' && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
                <div className="border-b border-slate-200 pb-3">
                  <h2 className="text-sm font-bold text-slate-900">
                    Otomatik Video Üretim Akışı (ComfyUI + MiniMax H3)
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-600">
                    Yüklediğiniz sahne dosyaları aşağıdaki sırayla otomatik işlenerek videoya
                    dönüştürülür.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-1">
                    <div className="text-xs font-bold text-blue-600">1. Girdiler Alınır</div>
                    <p className="text-xs text-slate-600">
                      3D kamera hareketi, stil referansı ve sahne tarifiniz otomatik olarak
                      video motoruna aktarılır.
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-1">
                    <div className="text-xs font-bold text-emerald-700">
                      2. MiniMax H3 Üretimi
                    </div>
                    <p className="text-xs text-slate-600">
                      Yüksek bellekli GPU üzerinde bellek taşması korumalı kare üretimi ve
                      hızlandırma uygulanır.
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-1">
                    <div className="text-xs font-bold text-slate-900">3. Teslim &amp; Yedek</div>
                    <p className="text-xs text-slate-600">
                      Final MP4 videosu bilgisayarınıza iner; açıksa Google Drive’a da
                      yedeklenir.
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs text-slate-700">
                  <div className="font-bold text-slate-900">Aktif Ön Ayarlı Özellikler</div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    <div>
                      · Video Birleştirici:{' '}
                      <strong>
                        {config.comfyui.enableVideoHelperSuite ? 'Açık' : 'Kapalı'}
                      </strong>
                    </div>
                    <div>
                      · Bellek Taşması Koruması:{' '}
                      <strong>
                        {config.comfyui.useTiledVaeDecode ? 'Açık (512px)' : 'Kapalı'}
                      </strong>
                    </div>
                    <div>
                      · Dikkat Hızlandırma (Sage):{' '}
                      <strong>
                        {config.comfyui.enableSageAttention ? 'Açık' : 'Kapalı'}
                      </strong>
                    </div>
                    <div>
                      · TeaCache:{' '}
                      <strong>
                        {config.comfyui.enableTeaCache ? 'Açık' : 'Kapalı'}
                      </strong>
                    </div>
                    <div>
                      · Hızlı Mod ({config.comfyui.turboSteps} Adım Turbo LoRA):{' '}
                      <strong>
                        {config.comfyui.enableTurboLora ? 'Açık' : 'Kapalı'}
                      </strong>
                    </div>
                    <div className="sm:col-span-2">
                      · Başlatma Bayrakları:{' '}
                      <strong className="font-mono text-[11px]">
                        {config.comfyui.headlessFlags}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* RIGHT RAIL: CHECKLIST, VIDEO REVIEW & QUEUE SUMMARY */}
          <aside className="space-y-4 lg:col-span-3">
            {/* Readiness Checklist */}
            <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-slate-900">Proje Hazırlık Durumu</h2>
                <span
                  className={`text-xs font-bold ${
                    completeness.missingCritical.length === 0
                      ? 'text-emerald-700'
                      : 'text-amber-700'
                  }`}
                >
                  {completeness.missingCritical.length === 0 ? 'Üretime Hazır' : 'Eksik Var'}
                </span>
              </div>

              <div className="space-y-2">
                {[
                  { label: 'Sahne Tarifi (Prompt)', ok: completeness.hasPrompts },
                  { label: '3D Kamera / Graybox', ok: completeness.hasGraybox },
                  { label: 'Stil Referansı', ok: Boolean(styleRefAsset) },
                  { label: 'Motor & Kalite Ayarı', ok: completeness.hasComfyWorkflow },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between text-xs text-slate-700"
                  >
                    <span>{item.label}</span>
                    {item.ok ? (
                      <CheckCircle2
                        className="h-4 w-4 text-emerald-600 shrink-0"
                        aria-hidden="true"
                      />
                    ) : (
                      <span className="text-[11px] font-medium text-amber-700">Bekliyor</span>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* ComfyUI Configuration Section */}
            <ComfyUiConfigPanel
              config={config}
              onUpdateConfig={onUpdateConfig}
              onNavigate={onNavigate}
            />

            {/* Video Review & Claude Revision */}
            <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                <MessageSquarePlus className="h-4 w-4 text-blue-600" aria-hidden="true" />
                <span>Videoyu Değerlendir &amp; Düzenle</span>
              </div>

              {latestOutput ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                    <div className="truncate text-xs font-semibold text-slate-900">
                      {latestOutput.title}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {latestOutput.createdAt} · {latestOutput.resolution}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="studio-feedback-input"
                      className="block text-[11px] font-medium text-slate-600"
                    >
                      Beğenmediğiniz bir detay varsa yazın:
                    </label>
                    <textarea
                      id="studio-feedback-input"
                      rows={3}
                      placeholder="Örn: Işık biraz daha sıcak olsun, kamera geçişi son 2 saniyede yavaşlasın..."
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      aria-label="Önem derecesi"
                      value={feedbackSeverity}
                      onChange={(e) =>
                        setFeedbackSeverity(e.target.value as 'dusuk' | 'orta' | 'yuksek')
                      }
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-800 focus:border-blue-600 focus:outline-none"
                    >
                      <option value="dusuk">Küçük Düzeltme</option>
                      <option value="orta">Orta</option>
                      <option value="yuksek">Öncelikli</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleEvaluateWithClaude(latestOutput)}
                      disabled={!feedbackText.trim()}
                      className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
                    >
                      Yeniden Düzenle
                    </button>
                  </div>

                  {latestOutput.notes.length > 0 && (
                    <div className="space-y-2 border-t border-slate-200 pt-2.5">
                      <div className="text-[11px] font-semibold text-slate-500">
                        Son Düzeltme Talepleri ({latestOutput.notes.length})
                      </div>
                      {latestOutput.notes.slice(0, 2).map((n) => (
                        <div
                          key={n.id}
                          className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs space-y-1.5"
                        >
                          <p className="text-slate-800">{n.note}</p>
                          {n.generatedBrief && (
                            <button
                              type="button"
                              onClick={() => handleCopyText(n.id, n.generatedBrief ?? '')}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                            >
                              {copiedId === n.id ? (
                                <>
                                  <Check className="h-3 w-3" aria-hidden="true" />
                                  Talimat Kopyalandı
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
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500">
                  İlk videonuz üretildiğinde buradan izleyip revizyon isteyebilirsiniz.
                </div>
              )}
            </section>

            {/* Compact Batch Queue Summary */}
            <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <Layers className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
                  <span>Üretim Sırası ({batchQueue.length})</span>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('colab')}
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                >
                  Zamanla &amp; Ayarla →
                </button>
              </div>

              <div className="text-[11px] text-slate-500">
                Tek oturumda ~{savings.singleSessionTotalMin} dk ·{' '}
                <span className="font-semibold text-emerald-700">
                  {savings.savedSetupMin} dk tasarruf
                </span>
              </div>

              <div className="text-[11px] text-slate-600">
                Zamanlanmış Başlatma:{' '}
                <span
                  className={`font-semibold ${
                    config.batchSchedule.enabled ? 'text-blue-700' : 'text-slate-500'
                  }`}
                >
                  {config.batchSchedule.enabled
                    ? config.batchSchedule.mode === 'low_load'
                      ? `Düşük yük (≤%${config.batchSchedule.maxVramLoadPct})`
                      : `${config.batchSchedule.scheduledDate} ${config.batchSchedule.scheduledTime}`
                    : 'Kapalı'}
                </span>
              </div>

              <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-slate-50">
                {batchQueue.length === 0 ? (
                  <div className="p-3 text-center text-[11px] text-slate-500">
                    Sıra boş. Yukarıdan &ldquo;Üretim Sırasına Ekle&rdquo;ye basın.
                  </div>
                ) : (
                  batchQueue.map((job, idx) => (
                    <div
                      key={job.id}
                      className="flex items-center justify-between gap-2 px-2.5 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-900">
                          {job.sceneLabel}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          ~{job.estimatedRenderMin} dk
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          aria-label={`${job.sceneLabel} yukarı`}
                          disabled={idx === 0}
                          onClick={() => onReorderBatchJob(idx, 'up')}
                          className="rounded border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                        >
                          <ArrowUp className="h-3 w-3" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={`${job.sceneLabel} aşağı`}
                          disabled={idx === batchQueue.length - 1}
                          onClick={() => onReorderBatchJob(idx, 'down')}
                          className="rounded border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                        >
                          <ArrowDown className="h-3 w-3" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={`${job.sceneLabel} sil`}
                          onClick={() => onRemoveBatchJob(job.id)}
                          className="rounded border border-slate-200 bg-white p-1 text-slate-500 hover:text-rose-600"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>

      {/* Drive Overwrite Confirm Modal */}
      {syncStage === 'confirm' && pendingPlan && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="workbench-overwrite-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600 shrink-0" aria-hidden="true" />
              <div className="space-y-2">
                <h2 id="workbench-overwrite-title" className="text-base font-bold text-slate-900">
                  Mevcut Drive Dosyaları Güncellensin mi?
                </h2>
                <p className="text-xs text-slate-600">
                  Google Drive’da aynı ada sahip{' '}
                  <strong>{pendingPlan.existingNamesToOverwrite.length}</strong> dosya
                  bulundu:
                </p>
                <ul className="max-h-32 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-[11px] text-slate-700 space-y-1">
                  {pendingPlan.existingNamesToOverwrite.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
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
