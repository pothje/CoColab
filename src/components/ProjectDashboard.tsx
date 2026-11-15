import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  Film,
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
  BatchQueueItem,
  ColabProject,
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
import { ProjectEditModal } from './ProjectEditModal';
import {
  ProjectQuickPreviewModal,
  type QuickPreviewLayerKey,
} from './ProjectQuickPreviewModal';

interface ProjectDashboardProps {
  projects: ColabProject[];
  activeProjectId: string;
  batchQueue: BatchQueueItem[];
  telemetry: TelemetrySnapshot;
  onSelectAndOpenProject: (projectId: string) => void;
  onOpenProjectInColab: (projectId: string) => void;
  onCreateProject: (name: string, description: string) => void;
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

const PIPELINE_STEPS: {
  key: DashboardStageKey;
  shortLabel: string;
  fullLabel: string;
  pct: number;
}[] = [
  { key: 'kuyrukta', shortLabel: 'Sırada', fullLabel: 'Kuyrukta', pct: 0 },
  { key: 'hazirlaniyor', shortLabel: 'Hazırlık', fullLabel: 'Hazırlanıyor', pct: 35 },
  { key: 'isleniyor', shortLabel: 'Render', fullLabel: 'İşleniyor', pct: 68 },
  { key: 'tamamlandi', shortLabel: 'Hazır', fullLabel: 'Tamamlandı', pct: 100 },
];

const GPU_POLICY_LABELS: Record<ColabProject['targetGpuPolicy'], string> = {
  '80GB_ONLY': 'A100 80GB',
  '80GB_OR_40GB': 'A100 80GB / 40GB',
};

function isVideoAssetName(name: string, mime: string): boolean {
  return mime.startsWith('video/') || /\.(mp4|mov|webm|mkv)$/i.test(name);
}

function getStageVisual(stageKey: DashboardStageKey) {
  switch (stageKey) {
    case 'tamamlandi':
      return {
        textClass: 'text-emerald-700',
        barClass: 'bg-emerald-600',
        activeDotClass: 'border-emerald-600 bg-emerald-600 text-white',
        icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" aria-hidden="true" />,
      };
    case 'hazirlaniyor':
      return {
        textClass: 'text-amber-700',
        barClass: 'bg-amber-500',
        activeDotClass: 'border-amber-600 bg-amber-500 text-white',
        icon: (
          <Sparkles className="h-3.5 w-3.5 text-amber-600 shrink-0" aria-hidden="true" />
        ),
      };
    case 'isleniyor':
      return {
        textClass: 'text-blue-700',
        barClass: 'bg-blue-600',
        activeDotClass: 'border-blue-600 bg-blue-600 text-white',
        icon: (
          <Loader2
            className="h-3.5 w-3.5 text-blue-600 animate-spin motion-reduce:animate-none shrink-0"
            aria-hidden="true"
          />
        ),
      };
    case 'kuyrukta':
    default:
      return {
        textClass: 'text-slate-700',
        barClass: 'bg-slate-400',
        activeDotClass: 'border-slate-600 bg-slate-700 text-white',
        icon: <Clock className="h-3.5 w-3.5 text-slate-500 shrink-0" aria-hidden="true" />,
      };
  }
}

export function ProjectDashboard({
  projects,
  activeProjectId,
  batchQueue,
  telemetry,
  onSelectAndOpenProject,
  onOpenProjectInColab,
  onCreateProject,
  onUpdateProjectDetails,
  onDeleteProject,
  onSetProjectStatus,
  onNavigate,
}: ProjectDashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<DashboardFilterOption>('tumu');
  const [creatingNew, setCreatingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [brokenImageKeys, setBrokenImageKeys] = useState<Record<string, boolean>>({});
  const [activeLayerById, setActiveLayerById] = useState<Record<string, VisualLayerKey>>({});
  const [hoveredStepById, setHoveredStepById] = useState<
    Record<string, DashboardStageKey | null>
  >({});
  const [expandedDetailIds, setExpandedDetailIds] = useState<Record<string, boolean>>({});
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
      newDesc.trim() || 'ComfyUI + MiniMax H3 görsel video üretim projesi'
    );
    setNewName('');
    setNewDesc('');
    setFormError(null);
    setCreatingNew(false);
  }

  return (
    <section
      aria-labelledby="project-dashboard-heading"
      className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6 space-y-6"
    >
      {/* Header Row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1
            id="project-dashboard-heading"
            className="text-2xl font-bold tracking-tight text-slate-900 text-balance"
          >
            Projeler
          </h1>
          <p className="text-sm text-slate-600">
            Sahne önizlemelerini inceleyin, ilerleme çubuğu üzerinden üretim aşamasını yönetin ve stüdyoya geçin.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('colab')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 whitespace-nowrap shrink-0"
          >
            <span>Üretim &amp; GPU Sırası</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => {
              setCreatingNew((v) => !v);
              setFormError(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Yeni Proje</span>
          </button>
        </div>
      </div>

      {/* Inline Create Project Bar */}
      {creatingNew && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <label htmlFor="dashboard-new-project-name" className="sr-only">
                Proje adı
              </label>
              <input
                id="dashboard-new-project-name"
                type="text"
                placeholder="Proje adı (Örn: Otel Lobi Gece Sahnesi)"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (formError) setFormError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateSubmit();
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="flex-1">
              <label htmlFor="dashboard-new-project-desc" className="sr-only">
                Proje açıklaması
              </label>
              <input
                id="dashboard-new-project-desc"
                type="text"
                placeholder="Kısa sahne açıklaması (isteğe bağlı)"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateSubmit();
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setCreatingNew(false);
                  setFormError(null);
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleCreateSubmit}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap"
              >
                Proje Oluştur
              </button>
            </div>
          </div>

          {formError && (
            <p className="mt-2 text-xs font-medium text-rose-600">{formError}</p>
          )}
        </div>
      )}

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col gap-3 border-y border-slate-200 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="tablist"
          aria-label="Üretim durumu filtresi"
          className="inline-flex w-full overflow-x-auto rounded-lg bg-slate-100 p-1 sm:w-auto"
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
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  isSelected
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>{option.label}</span>
                <span className="ml-1.5 text-[11px] text-slate-400 tabular-nums">
                  {counts[option.id]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-2 text-xs text-slate-500 tabular-nums lg:flex">
            <span>{counts.tumu} proje</span>
            <span aria-hidden="true">·</span>
            <span>{counts.isleniyor} işleniyor</span>
            <span aria-hidden="true">·</span>
            <span>{counts.tamamlandi} tamamlandı</span>
          </div>

          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Projelerde ara"
              placeholder="Proje ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Aramayı temizle"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Visual-First Project Cards Grid */}
      {filteredProjects.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
          <p className="text-sm font-semibold text-slate-900">
            Seçili filtreyle eşleşen proje bulunamadı.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Filtreyi sıfırlayabilir veya yeni bir video üretim projesi oluşturabilirsiniz.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2.5">
            {(searchQuery || statusFilter !== 'tumu') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('tumu');
                }}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Filtreleri Temizle
              </button>
            )}
            <button
              type="button"
              onClick={() => setCreatingNew(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Yeni Proje</span>
            </button>
          </div>
        </div>
      ) : (
        <div
          data-testid="project-dashboard-grid"
          className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3"
        >
          {filteredProjects.map((project) => {
            const summary = progressById[project.id];
            const hoveredStage = hoveredStepById[project.id] ?? null;
            const previewStep = hoveredStage
              ? PIPELINE_STEPS.find((s) => s.key === hoveredStage) ?? null
              : null;

            const activeStageKey = previewStep ? previewStep.key : summary.stageKey;
            const displayedPct = previewStep ? previewStep.pct : summary.progressPct;
            const displayedLabel = previewStep ? previewStep.fullLabel : summary.statusLabel;
            const visual = getStageVisual(activeStageKey);

            const seedVisuals = getSeedVisualForProject(project.id);
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
              graybox: grayboxAsset?.objectUrl || seedVisuals.grayboxPreview,
              style: styleAsset?.objectUrl || seedVisuals.stylePreview,
            };

            const activeLayer = activeLayerById[project.id] ?? 'final';
            const heroUrl = layerUrls[activeLayer];
            const heroBrokenKey = `${project.id}-${activeLayer}`;
            const isSelected = project.id === activeProjectId;
            const activeStepIndex = PIPELINE_STEPS.findIndex(
              (s) => s.key === activeStageKey
            );
            const barWidthPct =
              activeStageKey === 'isleniyor' || activeStageKey === 'hazirlaniyor'
                ? Math.max(displayedPct, 14)
                : displayedPct;
            const isExpanded = !!expandedDetailIds[project.id];

            const layerSpecs: { key: VisualLayerKey; label: string }[] = [
              { key: 'final', label: 'Final' },
              { key: 'graybox', label: 'Graybox' },
              { key: 'style', label: 'Stil Ref' },
            ];

            return (
              <article
                key={project.id}
                data-testid={`project-card-${project.id}`}
                className={`flex flex-col overflow-hidden rounded-xl border bg-white transition-colors ${
                  isSelected
                    ? 'border-blue-500 ring-1 ring-blue-500/20'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Dominant 16:10 Visual Hero Stage with Measured Bottom Contrast Scrim */}
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-900">
                  <button
                    type="button"
                    onClick={() => onSelectAndOpenProject(project.id)}
                    aria-label={`${project.name} projesini stüdyoda aç`}
                    className="group relative block h-full w-full text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-400"
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
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transform-none"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-800 text-slate-300">
                        <Film className="h-7 w-7" aria-hidden="true" />
                        <span className="text-xs font-medium">{project.name}</span>
                      </div>
                    )}

                    {/* Measured Gradient Scrim for >= 4.5:1 Contrast */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-transparent"
                    />

                    <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4 text-white">
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-200/90 tabular-nums">
                        <span>{GPU_POLICY_LABELS[project.targetGpuPolicy]}</span>
                        <span aria-hidden="true">·</span>
                        <span>{project.assets.length} dosya</span>
                        <span aria-hidden="true">·</span>
                        <span>{project.updatedAt}</span>
                      </div>
                      <h2 className="mt-0.5 truncate text-lg font-bold tracking-tight text-white">
                        {project.name}
                      </h2>
                    </div>
                  </button>
                </div>

                {/* 3-Frame Visual Layer Strip (Final / 3D Graybox / Stil Ref) */}
                <div
                  role="group"
                  aria-label={`${project.name} görsel katmanları`}
                  className="grid grid-cols-3 gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5"
                >
                  {layerSpecs.map((layer) => {
                    const isLayerActive = activeLayer === layer.key;
                    const thumbKey = `${project.id}-thumb-${layer.key}`;
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
                        className={`flex items-center gap-2 rounded-lg p-1 text-left transition-colors ${
                          isLayerActive
                            ? 'bg-white text-slate-900 ring-1 ring-blue-600 shadow-xs'
                            : 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
                        }`}
                      >
                        <div className="h-7 w-10 shrink-0 overflow-hidden rounded bg-slate-200">
                          {layerUrls[layer.key] && !brokenImageKeys[thumbKey] ? (
                            <img
                              src={layerUrls[layer.key]}
                              alt={layer.label}
                              referrerPolicy="no-referrer"
                              onError={() =>
                                setBrokenImageKeys((prev) => ({
                                  ...prev,
                                  [thumbKey]: true,
                                }))
                              }
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-slate-400">
                              <Film className="h-3 w-3" aria-hidden="true" />
                            </div>
                          )}
                        </div>
                        <span className="truncate text-[11px] font-semibold">
                          {layer.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Card Body: Description + Interactive Pipeline Progress Bar */}
                <div className="flex flex-1 flex-col justify-between gap-4 p-5">
                  <p className="line-clamp-2 min-h-[2.25rem] text-xs leading-relaxed text-slate-600">
                    {project.description}
                  </p>

                  {/* Interactive Progress Bar & Stage Selector */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-semibold ${visual.textClass}`}
                      >
                        {visual.icon}
                        <span>{displayedLabel}</span>
                        {previewStep && previewStep.key !== summary.stageKey && (
                          <span className="text-[11px] font-normal text-slate-400">
                            (seçmek için tıklayın)
                          </span>
                        )}
                      </span>

                      <span
                        className={`font-mono text-xs font-semibold tabular-nums ${visual.textClass}`}
                      >
                        %{displayedPct}
                      </span>
                    </div>

                    {/* Visual Progress Track */}
                    <div
                      role="progressbar"
                      aria-label={`${project.name} üretim ilerlemesi`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={summary.progressPct}
                      className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
                    >
                      <div
                        className={`h-full rounded-full transition-all duration-200 ${visual.barClass}`}
                        style={{ width: `${barWidthPct}%` }}
                      />
                    </div>

                    {/* Interactive 4-Step Stage Bar */}
                    <div
                      role="group"
                      aria-label={`${project.name} üretim aşaması seçici`}
                      onMouseLeave={() =>
                        setHoveredStepById((prev) => ({
                          ...prev,
                          [project.id]: null,
                        }))
                      }
                      className="grid grid-cols-4 gap-1"
                    >
                      {PIPELINE_STEPS.map((step, idx) => {
                        const isCurrentStep = summary.stageKey === step.key;
                        const isReached = idx <= activeStepIndex;
                        return (
                          <button
                            key={step.key}
                            type="button"
                            aria-pressed={isCurrentStep}
                            onMouseEnter={() =>
                              setHoveredStepById((prev) => ({
                                ...prev,
                                [project.id]: step.key,
                              }))
                            }
                            onFocus={() =>
                              setHoveredStepById((prev) => ({
                                ...prev,
                                [project.id]: step.key,
                              }))
                            }
                            onBlur={() =>
                              setHoveredStepById((prev) => ({
                                ...prev,
                                [project.id]: null,
                              }))
                            }
                            onClick={() => onSetProjectStatus(project.id, step.key)}
                            className={`flex items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap ${
                              isCurrentStep
                                ? 'bg-slate-900 text-white font-semibold'
                                : isReached
                                  ? 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                            }`}
                          >
                            <span>{step.shortLabel}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span className="truncate">{summary.stageDetail}</span>
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() =>
                          setExpandedDetailIds((prev) => ({
                            ...prev,
                            [project.id]: !prev[project.id],
                          }))
                        }
                        className="inline-flex shrink-0 items-center gap-1 font-medium text-slate-600 hover:text-slate-900 tabular-nums"
                      >
                        <span>
                          Hazırlık {summary.readinessCount}/{summary.readinessTotal}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="h-3 w-3" aria-hidden="true" />
                        )}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-slate-100 pt-2.5 text-[11px]">
                        {summary.readinessItems.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-1.5 text-slate-600"
                          >
                            {item.ready ? (
                              <Check
                                className="h-3 w-3 text-emerald-600 shrink-0"
                                aria-hidden="true"
                              />
                            ) : (
                              <Clock
                                className="h-3 w-3 text-amber-500 shrink-0"
                                aria-hidden="true"
                              />
                            )}
                            <span className={item.ready ? 'text-slate-800' : 'text-slate-500'}>
                              {item.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Card Action Menu: Başlat / Detayları Düzenle / Hızlı İzle */}
                  <div
                    role="group"
                    aria-label={`${project.name} aksiyon menüsü`}
                    className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3.5"
                  >
                    <button
                      type="button"
                      onClick={() => handleStartProject(project.id)}
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap"
                    >
                      <Play className="h-3 w-3 fill-current" aria-hidden="true" />
                      <span>Başlat</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditingProjectId(project.id)}
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 whitespace-nowrap"
                    >
                      <Pencil className="h-3 w-3 text-slate-500" aria-hidden="true" />
                      <span>Detayları Düzenle</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setPreviewState({
                          projectId: project.id,
                          layer: activeLayer,
                        })
                      }
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 whitespace-nowrap"
                    >
                      <Eye className="h-3 w-3 text-slate-500" aria-hidden="true" />
                      <span>Hızlı İzle</span>
                    </button>

                    {projects.length > 1 && (
                      <button
                        type="button"
                        aria-label={`${project.name} projesini sil`}
                        onClick={() => onDeleteProject(project.id)}
                        className="ml-auto inline-flex min-h-[34px] items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-400 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

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
