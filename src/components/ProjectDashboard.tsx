import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  CheckCircle2,
  Clock,
  Eye,
  Film,
  FolderOpen,
  Loader2,
  Pencil,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  AutomationConfig,
  BatchQueueItem,
  ColabProject,
  DeliveryPresetId,
  TelemetrySnapshot,
  WorkspaceTab,
} from '../types/automation';
import { getSeedVisualForProject } from '../data/studioVisuals';
import {
  computeProjectProgress,
  filterProjectsForDashboard,
  type DashboardFilterOption,
  type DashboardStageKey,
  type ProjectDetailUpdateInput,
  type ProjectProgressSummary,
} from '../utils/projectProgress';
import {
  createSampleEtsyClaudeBundleRawFiles,
  inspectProjectPipelineReadiness,
} from '../utils/claudeBundle';
import type { RawFileInput } from '../utils/guardrailEngine';
import { filesToRawInputs } from '../utils/fileImport';
import { ProjectEditModal } from './ProjectEditModal';
import {
  ProjectQuickPreviewModal,
  type QuickPreviewLayerKey,
} from './ProjectQuickPreviewModal';
import { RenderThroughputPanel } from './RenderThroughputPanel';

interface ProjectDashboardProps {
  projects: ColabProject[];
  activeProjectId: string;
  batchQueue: BatchQueueItem[];
  config: AutomationConfig;
  telemetry: TelemetrySnapshot;
  onSelectAndOpenProject: (projectId: string) => void;
  onOpenProjectInColab: (projectId: string) => void;
  onCreateProject: (
    name: string,
    description: string,
    deliveryPreset?: DeliveryPresetId
  ) => void;
  onImportClaudeBundle?: (
    rawFiles: RawFileInput[],
    options?: { openInStudio?: boolean; autoQueueEtsyAndReels?: boolean }
  ) => ColabProject | null;
  onUpdateProjectDetails: (
    projectId: string,
    updates: ProjectDetailUpdateInput
  ) => void;
  onDeleteProject: (projectId: string) => void;
  onSetProjectStatus: (projectId: string, nextStatus: DashboardStageKey) => void;
  onNavigate: (tab: WorkspaceTab) => void;
}

type VisualLayerKey = 'final' | 'graybox' | 'style';

const FILTER_OPTIONS: { id: DashboardFilterOption; label: string }[] = [
  { id: 'tumu', label: 'Tümü' },
  { id: 'kuyrukta', label: 'Kuyrukta' },
  { id: 'isleniyor', label: 'İşleniyor' },
  { id: 'tamamlandi', label: 'Tamamlandı' },
];

function isVideoAssetName(name: string, mime: string): boolean {
  return mime.startsWith('video/') || /\.(mp4|mov|webm|mkv)$/i.test(name);
}

function getStageVisual(stageKey: DashboardStageKey) {
  switch (stageKey) {
    case 'tamamlandi':
      return {
        textClass: 'text-[#30D158]',
        barClass: 'bg-[#30D158]',
        icon: <CheckCircle2 className="h-3.5 w-3.5 text-[#30D158] shrink-0" aria-hidden="true" />,
      };
    case 'hazirlaniyor':
      return {
        textClass: 'text-[#FF9F0A]',
        barClass: 'bg-[#FF9F0A]',
        icon: <Sparkles className="h-3.5 w-3.5 text-[#FF9F0A] shrink-0" aria-hidden="true" />,
      };
    case 'isleniyor':
      return {
        textClass: 'text-[#0A84FF]',
        barClass: 'bg-[#0A84FF]',
        icon: (
          <Loader2
            className="h-3.5 w-3.5 text-[#0A84FF] animate-spin motion-reduce:animate-none shrink-0"
            aria-hidden="true"
          />
        ),
      };
    case 'kuyrukta':
    default:
      return {
        textClass: 'text-zinc-400',
        barClass: 'bg-zinc-600',
        icon: <Clock className="h-3.5 w-3.5 text-zinc-400 shrink-0" aria-hidden="true" />,
      };
  }
}

export function ProjectDashboard({
  projects,
  activeProjectId,
  batchQueue,
  config,
  telemetry,
  onSelectAndOpenProject,
  onOpenProjectInColab,
  onCreateProject,
  onImportClaudeBundle,
  onUpdateProjectDetails,
  onDeleteProject,
  onSetProjectStatus,
  onNavigate,
}: ProjectDashboardProps) {
  const bundleFolderInputRef = useRef<HTMLInputElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<DashboardFilterOption>('tumu');
  const [creatingNew, setCreatingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPreset, setNewPreset] = useState<DeliveryPresetId>('etsy_4_3');
  const [formError, setFormError] = useState<string | null>(null);
  const [brokenImageKeys, setBrokenImageKeys] = useState<Record<string, boolean>>({});
  const [activeLayerById, setActiveLayerById] = useState<Record<string, VisualLayerKey>>({});
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<{
    projectId: string;
    layer: QuickPreviewLayerKey;
  } | null>(null);

  const progressById = useMemo(() => {
    const map: Record<string, ProjectProgressSummary> = {};
    for (const project of projects) {
      map[project.id] = computeProjectProgress(project, batchQueue, telemetry);
    }
    return map;
  }, [projects, batchQueue, telemetry]);

  const counts = useMemo(() => {
    const c = { tumu: projects.length, kuyrukta: 0, isleniyor: 0, tamamlandi: 0 };
    for (const project of projects) {
      const s = progressById[project.id]?.status;
      if (s) c[s] += 1;
    }
    return c;
  }, [projects, progressById]);

  const filteredProjects = useMemo(
    () => filterProjectsForDashboard(projects, progressById, searchQuery, statusFilter),
    [projects, progressById, searchQuery, statusFilter]
  );

  const editingProject = useMemo(
    () => projects.find((project) => project.id === editingProjectId) ?? null,
    [projects, editingProjectId]
  );

  const previewProject = useMemo(
    () =>
      previewState
        ? projects.find((project) => project.id === previewState.projectId) ?? null
        : null,
    [projects, previewState]
  );

  function handleStartProject(projectId: string) {
    const summary = progressById[projectId];
    if (summary?.stageKey === 'isleniyor') {
      onOpenProjectInColab(projectId);
      return;
    }
    onSetProjectStatus(projectId, 'isleniyor');
  }

  function handleCreateSubmit() {
    if (!newName.trim()) {
      setFormError('Lütfen proje için kısa bir ad girin.');
      return;
    }
    onCreateProject(
      newName.trim(),
      newDesc.trim() || 'Etsy / Sosyal Medya video üretim projesi',
      newPreset
    );
    setNewName('');
    setNewDesc('');
    setFormError(null);
    setCreatingNew(false);
  }

  async function handleBundleFolderChange(e: ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0 || !onImportClaudeBundle) return;
    const rawInputs = await filesToRawInputs(fileList);
    onImportClaudeBundle(rawInputs);
    setCreatingNew(false);
    e.target.value = '';
  }

  function handleLoadSampleEtsyBundle() {
    if (!onImportClaudeBundle) return;
    onImportClaudeBundle(createSampleEtsyClaudeBundleRawFiles('unrendered_blend'));
    setCreatingNew(false);
  }

  return (
    <section
      aria-labelledby="project-dashboard-heading"
      className="relative mx-auto max-w-[1440px] px-4 py-9 lg:px-8 space-y-8"
    >
      <input
        ref={bundleFolderInputRef}
        type="file"
        multiple
        // @ts-expect-error webkitdirectory is supported in Chromium/WebKit
        webkitdirectory=""
        className="hidden"
        onChange={handleBundleFolderChange}
      />
      {/* Subtle Ambient Depth Behind Glass Cards */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-14 -z-10 h-[540px] bg-[radial-gradient(ellipse_55%_55%_at_18%_12%,rgba(10,132,255,0.11),transparent),radial-gradient(ellipse_45%_50%_at_82%_10%,rgba(191,90,242,0.07),transparent)]"
      />

      {/* Minimalist Apple Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1
            id="project-dashboard-heading"
            className="text-[32px] leading-tight font-medium tracking-[-0.03em] text-white/95 text-balance"
          >
            Projeler
          </h1>
          <p className="text-[14px] font-normal text-white/55">
            Video sahnelerinizi önizleyin, stüdyoda düzenleyin veya üretimi başlatın.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('workbench')}
            className="rounded-full border border-white/[0.1] bg-white/[0.05] px-4 py-2 text-xs font-medium text-white/90 backdrop-blur-xl shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6),inset_0_1px_0_0_rgba(255,255,255,0.08)] transition-all hover:bg-white/[0.1] whitespace-nowrap"
          >
            Stüdyoyu Aç
          </button>

          <button
            type="button"
            onClick={() => {
              setCreatingNew((v) => !v);
              setFormError(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#0A84FF] px-4 py-2 text-xs font-medium text-white shadow-[0_10px_26px_-6px_rgba(10,132,255,0.55),inset_0_1px_0_0_rgba(255,255,255,0.22)] transition-all hover:bg-[#2494FF] whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Yeni Proje</span>
          </button>
        </div>
      </div>

      {/* Inline Create & Claude Bundle Import Bar */}
      {creatingNew && (
        <div className="rounded-[28px] border border-white/[0.1] bg-white/[0.05] p-5 backdrop-blur-2xl shadow-[0_20px_50px_-16px_rgba(0,0,0,0.7),inset_0_1px_0_0_rgba(255,255,255,0.1)] space-y-3.5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <label htmlFor="dashboard-new-project-name" className="sr-only">
                Proje adı
              </label>
              <input
                id="dashboard-new-project-name"
                type="text"
                placeholder="Proje adı (Örn: Seramik Kupa Etsy)"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (formError) setFormError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateSubmit();
                }}
                className="w-full rounded-2xl border border-white/[0.1] bg-black/35 px-4 py-2.5 text-xs text-white/95 placeholder:text-white/35 focus:border-[#0A84FF] focus:outline-none"
              />
            </div>

            <div className="flex-1">
              <label htmlFor="dashboard-new-project-desc" className="sr-only">
                Proje açıklaması
              </label>
              <input
                id="dashboard-new-project-desc"
                type="text"
                placeholder="Kısa açıklama (isteğe bağlı)"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateSubmit();
                }}
                className="w-full rounded-2xl border border-white/[0.1] bg-black/35 px-4 py-2.5 text-xs text-white/95 placeholder:text-white/35 focus:border-[#0A84FF] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="dashboard-new-project-preset" className="sr-only">
                Hedef format
              </label>
              <select
                id="dashboard-new-project-preset"
                value={newPreset}
                onChange={(e) => setNewPreset(e.target.value as DeliveryPresetId)}
                className="w-full rounded-2xl border border-white/[0.1] bg-black/45 px-3.5 py-2.5 text-xs text-white/95 focus:border-[#0A84FF] focus:outline-none sm:w-auto"
              >
                <option value="etsy_4_3">Etsy Vitrin (4:3)</option>
                <option value="etsy_1_1">Etsy Kare (1:1)</option>
                <option value="social_9_16">Sosyal Medya (9:16)</option>
                <option value="cinema_16_9">Yatay Sahne (16:9)</option>
              </select>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setCreatingNew(false);
                  setFormError(null);
                }}
                className="rounded-full border border-white/[0.1] bg-white/[0.05] px-4 py-2 text-xs font-medium text-white/75 hover:text-white whitespace-nowrap"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleCreateSubmit}
                className="rounded-full bg-[#0A84FF] px-4 py-2 text-xs font-medium text-white hover:bg-[#2494FF] whitespace-nowrap"
              >
                Oluştur
              </button>
            </div>
          </div>

          {onImportClaudeBundle && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-3 text-xs">
              <span className="text-white/50">
                Claude klasörü (.blend, ilk/son kare ve prompt) doğrudan otomatik tanınır.
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => bundleFolderInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-white/[0.06] px-3.5 py-1.5 text-xs font-medium text-white/90 hover:bg-white/[0.12] whitespace-nowrap"
                >
                  <FolderOpen className="h-3.5 w-3.5 text-[#0A84FF]" aria-hidden="true" />
                  <span>Claude Klasörü Yükle</span>
                </button>
                <button
                  type="button"
                  data-testid="load-sample-etsy-bundle-btn"
                  onClick={handleLoadSampleEtsyBundle}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#0A84FF]/35 bg-[#0A84FF]/15 px-3.5 py-1.5 text-xs font-medium text-[#64B5FF] hover:bg-[#0A84FF]/25 whitespace-nowrap"
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Örnek Etsy Paketi (.blend)</span>
                </button>
              </div>
            </div>
          )}

          {formError && (
            <p className="mt-1 text-xs font-medium text-[#FF453A]">{formError}</p>
          )}
        </div>
      )}

      {/* Glass Filter & Search Row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="tablist"
          aria-label="Üretim durumu filtresi"
          className="inline-flex w-full overflow-x-auto rounded-full border border-white/[0.1] bg-white/[0.045] p-1 backdrop-blur-2xl shadow-[0_12px_32px_-12px_rgba(0,0,0,0.65),inset_0_1px_0_0_rgba(255,255,255,0.08)] sm:w-auto"
        >
          {FILTER_OPTIONS.map((option) => {
            const isSelected = statusFilter === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => setStatusFilter(option.id)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all whitespace-nowrap shrink-0 ${
                  isSelected
                    ? 'bg-white/[0.14] text-white shadow-[0_2px_10px_-2px_rgba(0,0,0,0.4)]'
                    : 'text-white/55 hover:text-white/85'
                }`}
              >
                <span>{option.label}</span>
                <span className="ml-1.5 text-[11px] text-white/40 tabular-nums">
                  {counts[option.id]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-64">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Projelerde ara"
            placeholder="Proje ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-full border border-white/[0.1] bg-white/[0.045] py-2 pl-9 pr-9 text-xs text-white/95 backdrop-blur-2xl shadow-[0_12px_32px_-12px_rgba(0,0,0,0.65),inset_0_1px_0_0_rgba(255,255,255,0.08)] placeholder:text-white/40 focus:border-[#0A84FF] focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="Aramayı temizle"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-white/45 hover:text-white"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Glassmorphic Apple Card Grid */}
      {filteredProjects.length === 0 ? (
        <div className="rounded-[32px] border border-white/[0.1] bg-white/[0.045] px-6 py-16 text-center backdrop-blur-2xl shadow-[0_24px_56px_-16px_rgba(0,0,0,0.7),inset_0_1px_0_0_rgba(255,255,255,0.1)]">
          <p className="text-sm font-medium text-white/90">
            Seçili filtreyle eşleşen proje bulunamadı.
          </p>
          <p className="mt-1 text-xs text-white/50">
            Filtreyi temizleyebilir veya yeni bir proje oluşturabilirsiniz.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2.5">
            {(searchQuery || statusFilter !== 'tumu') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('tumu');
                }}
                className="rounded-full border border-white/[0.1] bg-white/[0.06] px-4 py-2 text-xs font-medium text-white/85 hover:bg-white/[0.12]"
              >
                Filtreleri Temizle
              </button>
            )}
            <button
              type="button"
              onClick={() => setCreatingNew(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#0A84FF] px-4 py-2 text-xs font-medium text-white hover:bg-[#2494FF]"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Yeni Proje</span>
            </button>
          </div>
        </div>
      ) : (
        <div
          data-testid="project-dashboard-grid"
          className="grid grid-cols-1 gap-7 md:grid-cols-2 xl:grid-cols-3"
        >
          {filteredProjects.map((project) => {
            const summary = progressById[project.id];
            const visual = getStageVisual(summary.stageKey);
            const seedVisuals = getSeedVisualForProject(project.id);
            const readiness = inspectProjectPipelineReadiness(project, config.blenderRender);

            const grayboxAsset = project.assets.find(
              (a) =>
                a.kind === 'blender_graybox' && !isVideoAssetName(a.name, a.mimeType)
            );
            const styleAsset = project.assets.find(
              (a) =>
                a.kind === 'reference_media' && !isVideoAssetName(a.name, a.mimeType)
            );

            const layerUrls: Record<VisualLayerKey, string> = {
              final: project.outputs[0]?.objectUrl || seedVisuals.finalPreview,
              graybox:
                readiness.firstFrameAsset?.objectUrl ||
                grayboxAsset?.objectUrl ||
                seedVisuals.grayboxPreview,
              style:
                readiness.lastFrameAsset?.objectUrl ||
                styleAsset?.objectUrl ||
                seedVisuals.stylePreview,
            };

            const activeLayer = activeLayerById[project.id] ?? 'final';
            const heroUrl = layerUrls[activeLayer];
            const heroBrokenKey = `${project.id}-${activeLayer}`;
            const isSelected = project.id === activeProjectId;
            const barWidthPct =
              summary.stageKey === 'isleniyor' || summary.stageKey === 'hazirlaniyor'
                ? Math.max(summary.progressPct, 14)
                : summary.progressPct;

            const layerSpecs: { key: VisualLayerKey; label: string }[] = [
              { key: 'final', label: 'Final' },
              { key: 'graybox', label: 'Graybox' },
              { key: 'style', label: 'Stil' },
            ];

            return (
              <article
                key={project.id}
                data-testid={`project-card-${project.id}`}
                className={`group/card flex flex-col rounded-[32px] border bg-white/[0.045] p-3 backdrop-blur-2xl backdrop-saturate-150 transition-all duration-300 ease-out hover:-translate-y-0.5 motion-reduce:transform-none ${
                  isSelected
                    ? 'border-[#0A84FF]/45 ring-1 ring-[#0A84FF]/25 shadow-[0_26px_60px_-14px_rgba(10,132,255,0.22),0_18px_40px_-14px_rgba(0,0,0,0.72),inset_0_1px_0_0_rgba(255,255,255,0.16)]'
                    : 'border-white/[0.1] shadow-[0_24px_56px_-16px_rgba(0,0,0,0.68),0_4px_16px_-4px_rgba(0,0,0,0.35),inset_0_1px_0_0_rgba(255,255,255,0.12)] hover:border-white/[0.18] hover:bg-white/[0.06] hover:shadow-[0_30px_64px_-14px_rgba(0,0,0,0.8),inset_0_1px_0_0_rgba(255,255,255,0.16)]'
                }`}
              >
                {/* Ultra-Rounded Inset Cinema Preview */}
                <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[22px] bg-black/60 ring-1 ring-white/[0.09]">
                  <button
                    type="button"
                    onClick={() => onSelectAndOpenProject(project.id)}
                    aria-label={`${project.name} projesini stüdyoda aç`}
                    className="group relative block h-full w-full text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0A84FF]"
                  >
                    {heroUrl && !brokenImageKeys[heroBrokenKey] ? (
                      <img
                        src={heroUrl}
                        alt={`${project.name} — ${activeLayer} önizlemesi`}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setBrokenImageKeys((prev) => ({
                            ...prev,
                            [heroBrokenKey]: true,
                          }))
                        }
                        className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover/card:scale-[1.03] motion-reduce:transform-none"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-black/40 text-white/45">
                        <Film className="h-7 w-7" aria-hidden="true" />
                        <span className="text-xs font-medium">{project.name}</span>
                      </div>
                    )}

                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 via-black/20 to-transparent"
                    />
                  </button>

                  {/* Frosted Glass Layer Switcher Pill */}
                  <div
                    role="group"
                    aria-label={`${project.name} görsel katmanları`}
                    className="absolute bottom-3 left-3 inline-flex items-center rounded-full border border-white/20 bg-black/45 p-0.5 shadow-[0_8px_20px_-4px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
                  >
                    {layerSpecs.map((layer) => {
                      const isLayerActive = activeLayer === layer.key;
                      return (
                        <button
                          key={layer.key}
                          type="button"
                          aria-pressed={isLayerActive}
                          onClick={() =>
                            setActiveLayerById((prev) => ({
                              ...prev,
                              [project.id]: layer.key,
                            }))
                          }
                          className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
                            isLayerActive
                              ? 'bg-white/95 text-black font-semibold shadow-sm'
                              : 'text-white/80 hover:text-white'
                          }`}
                        >
                          {layer.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Minimalist Typography & Airy Card Body */}
                <div className="flex flex-1 flex-col justify-between gap-4 px-3.5 pb-2.5 pt-4">
                  <div className="space-y-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <h2 className="truncate text-[17px] leading-snug font-medium tracking-[-0.02em] text-white/95">
                        {project.name}
                      </h2>
                      <span className="shrink-0 text-[11px] font-medium tracking-wide text-white/40 tabular-nums">
                        {readiness.deliveryPreset.shortLabel}
                        {readiness.requiresColabBlenderRender ? ' · .blend' : ''} ·{' '}
                        {project.targetGpuPolicy === '80GB_ONLY' ? '80GB' : '40/80GB'}
                      </span>
                    </div>
                    <p className="line-clamp-1 text-[13px] font-normal text-white/50">
                      {project.description}
                    </p>
                  </div>

                  {/* Minimalist Status & Slim Progress Line */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span
                        className={`inline-flex items-center gap-1.5 font-medium ${visual.textClass}`}
                      >
                        {visual.icon}
                        <span>{summary.statusLabel}</span>
                      </span>
                      <span className="text-[11px] font-medium text-white/45 tabular-nums">
                        %{summary.progressPct}
                      </span>
                    </div>

                    <div
                      role="progressbar"
                      aria-label={`${project.name} üretim ilerlemesi`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={summary.progressPct}
                      className="h-1 w-full overflow-hidden rounded-full bg-white/[0.08]"
                    >
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${visual.barClass}`}
                        style={{ width: `${barWidthPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Clean Action Pills */}
                  <div
                    role="group"
                    aria-label={`${project.name} aksiyon menüsü`}
                    className="flex items-center justify-between gap-2 pt-0.5"
                  >
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectAndOpenProject(project.id)}
                        className="rounded-full bg-[#0A84FF] px-4 py-1.5 text-xs font-medium text-white shadow-[0_6px_18px_-4px_rgba(10,132,255,0.5),inset_0_1px_0_0_rgba(255,255,255,0.2)] transition-all hover:bg-[#2494FF] whitespace-nowrap"
                      >
                        Stüdyoda Aç
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStartProject(project.id)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.06] px-3.5 py-1.5 text-xs font-medium text-white/90 backdrop-blur-md transition-colors hover:bg-white/[0.12] whitespace-nowrap"
                      >
                        <Play className="h-3 w-3 fill-current" aria-hidden="true" />
                        <span>Başlat</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        aria-label={`${project.name} hızlı izle`}
                        title="Hızlı İzle"
                        onClick={() =>
                          setPreviewState({
                            projectId: project.id,
                            layer: activeLayer,
                          })
                        }
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/45 transition-colors hover:bg-white/[0.09] hover:text-white"
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>

                      <button
                        type="button"
                        aria-label={`${project.name} düzenle`}
                        title="Düzenle"
                        onClick={() => setEditingProjectId(project.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/45 transition-colors hover:bg-white/[0.09] hover:text-white"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>

                      {projects.length > 1 && (
                        <button
                          type="button"
                          aria-label={`${project.name} projesini sil`}
                          title="Sil"
                          onClick={() => onDeleteProject(project.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/45 transition-colors hover:bg-[#FF453A]/15 hover:text-[#FF453A]"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Quiet Render Throughput Analytics Below Gallery */}
      <RenderThroughputPanel
        batchQueue={batchQueue}
        projects={projects}
        config={config}
        telemetry={telemetry}
        onOpenProject={onSelectAndOpenProject}
        onNavigate={onNavigate}
      />

      <ProjectEditModal
        project={editingProject}
        onClose={() => setEditingProjectId(null)}
        onSave={onUpdateProjectDetails}
        onOpenInStudio={onSelectAndOpenProject}
      />

      <ProjectQuickPreviewModal
        project={previewProject}
        summary={previewProject ? progressById[previewProject.id] : null}
        initialLayer={previewState?.layer ?? 'final'}
        onClose={() => setPreviewState(null)}
        onStartProject={handleStartProject}
        onOpenInStudio={onSelectAndOpenProject}
      />
    </section>
  );
}
