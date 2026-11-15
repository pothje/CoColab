import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_AUTOMATION_CONFIG,
  INITIAL_AUDIT_FINDINGS,
  INITIAL_ONBOARDING_STATE,
  SAMPLE_PROJECT_FILES_SEED,
  createInitialBatchQueue,
  createInitialProjects,
} from './data/auditFindings';
import {
  AssetKind,
  AuditFinding,
  AutomationConfig,
  BatchQueueItem,
  ColabProject,
  OnboardingState,
  OutputRenderItem,
  ProjectAssetFile,
  RevisionFeedbackNote,
  WorkspaceTab,
} from './types/automation';
import {
  buildStackRelativePath,
  buildTargetColabPath,
  classifyProjectFiles,
  reorderBatchQueue,
} from './utils/guardrailEngine';
import { generateColabNotebookJson } from './utils/codeGenerators';
import {
  getCachedDriveToken,
  initDriveAuth,
  signInWithGoogleDrive,
  signOutGoogleDrive,
} from './services/googleDriveAuth';
import { useColabTelemetry } from './hooks/useColabTelemetry';
import { usePWAInstall } from './hooks/usePWAInstall';
import { TopBar } from './components/TopBar';
import { ProjectDashboard } from './components/ProjectDashboard';
import { DesktopWorkbenchView } from './components/DesktopWorkbenchView';
import { OnboardingView } from './components/OnboardingView';
import { ColabConsoleView } from './components/ColabConsoleView';
import { ClaudeMcpView } from './components/ClaudeMcpView';
import { AnalysisView } from './components/AnalysisView';
import { ComfyModelInstallerView } from './components/ComfyModelInstallerView';
import { MacInstallModal } from './components/MacInstallModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import {
  applyProjectDetailUpdate,
  type DashboardStageKey,
  type ProjectDetailUpdateInput,
} from './utils/projectProgress';
import {
  evaluateBatchSchedule,
  triggerQueuedBatchStart,
} from './utils/batchScheduler';

const STORAGE_KEYS = {
  projects: 'colabforge_projects_v2',
  onboarding: 'colabforge_onboarding_v2',
  batchQueue: 'colabforge_batch_queue_v1',
  config: 'colabforge_config_v1',
};

function triggerDownload(filename: string, content: string | Blob, mimeType: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function loadPersistedConfig(): AutomationConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.config);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AutomationConfig>;
      const isLegacyTextModel = parsed.modelMatrix?.repo80Gb?.startsWith('MiniMaxAI/MiniMax-M1');
      return {
        ...DEFAULT_AUTOMATION_CONFIG,
        ...parsed,
        modelMatrix: isLegacyTextModel
          ? DEFAULT_AUTOMATION_CONFIG.modelMatrix
          : {
              ...DEFAULT_AUTOMATION_CONFIG.modelMatrix,
              ...(parsed.modelMatrix ?? {}),
            },
        comfyui: {
          ...DEFAULT_AUTOMATION_CONFIG.comfyui,
          ...(parsed.comfyui ?? {}),
        },
        modelInstaller: {
          ...DEFAULT_AUTOMATION_CONFIG.modelInstaller,
          ...(parsed.modelInstaller ?? {}),
          selectedVariants: {
            ...DEFAULT_AUTOMATION_CONFIG.modelInstaller.selectedVariants,
            ...(parsed.modelInstaller?.selectedVariants ?? {}),
          },
          installedModels: {
            ...DEFAULT_AUTOMATION_CONFIG.modelInstaller.installedModels,
            ...(parsed.modelInstaller?.installedModels ?? {}),
          },
        },
        batchSchedule: {
          ...DEFAULT_AUTOMATION_CONFIG.batchSchedule,
          ...(parsed.batchSchedule ?? {}),
        },
      };
    }
  } catch {
    // Fallback
  }
  return DEFAULT_AUTOMATION_CONFIG;
}

function loadPersistedProjects(workspaceRoot: string): ColabProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.projects);
    if (raw) {
      const parsed = JSON.parse(raw) as ColabProject[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((proj) => {
          const hasComfy = proj.assets.some((a) => a.kind === 'comfyui_workflow');
          if (hasComfy) return proj;
          const seedWorkflow = classifyProjectFiles(
            [SAMPLE_PROJECT_FILES_SEED[1]],
            workspaceRoot
          )[0];
          return {
            ...proj,
            assets: [seedWorkflow, ...proj.assets],
          };
        });
      }
    }
  } catch {
    // Fallback
  }
  return createInitialProjects(workspaceRoot);
}

function loadPersistedOnboarding(): OnboardingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.onboarding);
    if (raw) {
      return { ...INITIAL_ONBOARDING_STATE, ...(JSON.parse(raw) as Partial<OnboardingState>) };
    }
  } catch {
    // Fallback
  }
  return INITIAL_ONBOARDING_STATE;
}

function loadPersistedBatchQueue(seedProjects: ColabProject[]): BatchQueueItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.batchQueue);
    if (raw) {
      const parsed = JSON.parse(raw) as BatchQueueItem[];
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {
    // Fallback
  }
  return createInitialBatchQueue(seedProjects);
}

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('autostart=1')) {
      return 'colab';
    }
    return 'dashboard';
  });
  const [config, setConfig] = useState<AutomationConfig>(() => loadPersistedConfig());
  const [findings, setFindings] = useState<AuditFinding[]>(INITIAL_AUDIT_FINDINGS);
  const [onboarding, setOnboarding] = useState<OnboardingState>(() =>
    loadPersistedOnboarding()
  );
  const [projects, setProjects] = useState<ColabProject[]>(() =>
    loadPersistedProjects(DEFAULT_AUTOMATION_CONFIG.workspaceRoot)
  );
  const [batchQueue, setBatchQueue] = useState<BatchQueueItem[]>(() =>
    loadPersistedBatchQueue(projects)
  );
  const [activeProjectId, setActiveProjectId] = useState<string>(() => projects[0]?.id ?? '');

  const [driveUserEmail, setDriveUserEmail] = useState<string | null>(null);
  const [driveAccessToken, setDriveAccessToken] = useState<string | null>(() =>
    getCachedDriveToken()
  );
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isMacInstallOpen, setIsMacInstallOpen] = useState(false);
  const pwaInstall = usePWAInstall();

  const activeProject =
    projects.find((p) => p.id === activeProjectId) ?? projects[0];

  const handleTelemetryOutput = useCallback(
    (projectId: string, batchJobId: string | null, output: OutputRenderItem) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId ? { ...p, outputs: [output, ...p.outputs] } : p
        )
      );
      if (batchJobId) {
        setBatchQueue((prev) =>
          prev.map((job) =>
            job.id === batchJobId ? { ...job, status: 'tamamlandi' } : job
          )
        );
      }
    },
    []
  );

  const {
    telemetry,
    wsStatus,
    ingestToken,
    pingSending,
    sendBridgePing,
    resetTelemetry,
  } = useColabTelemetry({ onOutputReceived: handleTelemetryOutput });

  useEffect(() => {
    try {
      const serializable = projects.map((p) => ({
        ...p,
        assets: p.assets.map(({ rawFile: _raw, objectUrl: _url, ...rest }) => rest),
        outputs: p.outputs.map(({ objectUrl: _url, ...rest }) => rest),
      }));
      localStorage.setItem(STORAGE_KEYS.projects, JSON.stringify(serializable));
    } catch {
      // Storage quota ignored
    }
  }, [projects]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.onboarding, JSON.stringify(onboarding));
    } catch {
      // Storage quota ignored
    }
  }, [onboarding]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.batchQueue, JSON.stringify(batchQueue));
    } catch {
      // Storage quota ignored
    }
  }, [batchQueue]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(config));
    } catch {
      // Storage quota ignored
    }
  }, [config]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [activeTab]);

  useEffect(() => {
    const unsubscribe = initDriveAuth(
      (user, token) => {
        setDriveUserEmail(user.email || user.displayName || 'Google Hesabı');
        setDriveAccessToken(token);
      },
      () => {
        setDriveUserEmail(null);
        setDriveAccessToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  async function handleConnectDrive() {
    setIsSigningIn(true);
    try {
      const { user, accessToken } = await signInWithGoogleDrive();
      setDriveUserEmail(user.email || user.displayName || 'Google Hesabı');
      setDriveAccessToken(accessToken);
    } finally {
      setIsSigningIn(false);
    }
  }

  async function handleDisconnectDrive() {
    await signOutGoogleDrive();
    setDriveUserEmail(null);
    setDriveAccessToken(null);
  }

  function handleToggleFinding(id: string) {
    setFindings((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, enabledInExport: !item.enabledInExport } : item
      )
    );
  }

  function handleCreateProject(name: string, description: string) {
    const id = `proj-${Date.now()}`;
    const nextProject: ColabProject = {
      id,
      name,
      description,
      updatedAt: new Date().toISOString().slice(0, 10),
      targetGpuPolicy: '80GB_OR_40GB',
      assets: classifyProjectFiles(
        SAMPLE_PROJECT_FILES_SEED.slice(0, 6),
        config.workspaceRoot
      ),
      outputs: [],
    };
    setProjects((prev) => [nextProject, ...prev]);
    setActiveProjectId(id);
  }

  function handleDeleteProject(id: string) {
    setProjects((prev) => {
      const filtered = prev.filter((p) => p.id !== id);
      if (activeProjectId === id && filtered.length > 0) {
        setActiveProjectId(filtered[0].id);
      }
      return filtered;
    });
    setBatchQueue((prev) => prev.filter((job) => job.projectId !== id));
  }

  function handleUpdateProjectAssets(projectId: string, nextAssets: ProjectAssetFile[]) {
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, assets: nextAssets } : p))
    );
  }

  function handleUpdateAssetContent(projectId: string, assetId: string, nextText: string) {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? {
              ...p,
              assets: p.assets.map((a) =>
                a.id === assetId
                  ? { ...a, previewText: nextText, sizeBytes: new Blob([nextText]).size }
                  : a
              ),
            }
          : p
      )
    );
  }

  function handleMoveAssetToFolder(
    projectId: string,
    assetId: string,
    targetKind: AssetKind
  ) {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? {
              ...p,
              assets: p.assets.map((a) =>
                a.id === assetId
                  ? {
                      ...a,
                      kind: targetKind,
                      relativePath: buildStackRelativePath(targetKind, a.name),
                      targetColabPath: buildTargetColabPath(
                        config.workspaceRoot,
                        targetKind,
                        a.name
                      ),
                    }
                  : a
              ),
            }
          : p
      )
    );
  }

  function handleAddOutputToProject(projectId: string, output: OutputRenderItem) {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId ? { ...p, outputs: [output, ...p.outputs] } : p
      )
    );
  }

  function handleAddRevisionFeedback(
    projectId: string,
    outputId: string,
    note: RevisionFeedbackNote
  ) {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? {
              ...p,
              outputs: p.outputs.map((out) =>
                out.id === outputId
                  ? {
                      ...out,
                      status: 'revizyon_gerekli',
                      notes: [note, ...out.notes],
                    }
                  : out
              ),
            }
          : p
      )
    );
  }

  function handleAddBatchJob(projectId: string, sceneLabel: string) {
    const proj = projects.find((p) => p.id === projectId);
    if (!proj) return;
    const nextJob: BatchQueueItem = {
      id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      projectId: proj.id,
      projectName: proj.name,
      sceneLabel,
      status: 'kuyrukta',
      addedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      estimatedRenderMin: 3,
    };
    setBatchQueue((prev) => [...prev, nextJob]);
  }

  function handleReorderBatchJob(index: number, direction: 'up' | 'down') {
    setBatchQueue((prev) => reorderBatchQueue(prev, index, direction));
  }

  function handleRemoveBatchJob(jobId: string) {
    setBatchQueue((prev) => prev.filter((j) => j.id !== jobId));
  }

  function handleClearCompletedBatchJobs() {
    setBatchQueue((prev) => prev.filter((j) => j.status !== 'tamamlandi'));
  }

  const handleTriggerScheduledStart = useCallback(
    (reason: string) => {
      if (!batchQueue.some((j) => j.status === 'kuyrukta')) return;
      const nowIso = new Date().toISOString();
      setBatchQueue((prev) => triggerQueuedBatchStart(prev).nextQueue);
      setConfig((prev) => ({
        ...prev,
        batchSchedule: {
          ...prev.batchSchedule,
          lastTriggeredAt: nowIso,
          lastTriggerReason: reason,
        },
      }));
    },
    [batchQueue]
  );

  useEffect(() => {
    if (!config.batchSchedule.enabled) return;
    const tick = () => {
      const evalResult = evaluateBatchSchedule(
        config.batchSchedule,
        batchQueue,
        new Date(),
        telemetry
      );
      if (evalResult.shouldTrigger) {
        handleTriggerScheduledStart(evalResult.triggerReason);
      }
    };
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [config.batchSchedule, batchQueue, telemetry, handleTriggerScheduledStart]);

  function handleSetProjectStatus(projectId: string, nextStatus: DashboardStageKey) {
    const proj = projects.find((p) => p.id === projectId);
    if (!proj) return;

    setBatchQueue((prev) => {
      const hasProjectJobs = prev.some((job) => job.projectId === projectId);
      if (!hasProjectJobs) {
        return [
          ...prev,
          {
            id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            projectId: proj.id,
            projectName: proj.name,
            sceneLabel: `${proj.name} · Sahne 01`,
            status: nextStatus,
            addedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
            estimatedRenderMin: 3,
          },
        ];
      }

      return prev.map((job) =>
        job.projectId === projectId ? { ...job, status: nextStatus } : job
      );
    });
  }

  function handleUpdateProjectDetails(
    projectId: string,
    updates: ProjectDetailUpdateInput
  ) {
    setProjects((prev) => applyProjectDetailUpdate(prev, projectId, updates));
    const trimmedName = updates.name.trim();
    if (trimmedName) {
      setBatchQueue((prev) =>
        prev.map((job) =>
          job.projectId === projectId ? { ...job, projectName: trimmedName } : job
        )
      );
    }
  }

  function handleSelectAndOpenProject(projectId: string) {
    setActiveProjectId(projectId);
    setActiveTab('workbench');
  }

  function handleOpenProjectInColab(projectId: string) {
    setActiveProjectId(projectId);
    setActiveTab('colab');
  }

  function handleDownloadNotebook() {
    const telemetryBaseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const nbContent = generateColabNotebookJson(
      config,
      activeProject.assets,
      findings,
      batchQueue,
      projects,
      telemetryBaseUrl,
      ingestToken
    );
    triggerDownload(
      `${activeProject.id}_comfyui_minimax_h3.ipynb`,
      nbContent,
      'application/x-ipynb+json'
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FB] text-slate-900">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onDownloadNotebook={handleDownloadNotebook}
        onOpenMacInstall={() => setIsMacInstallOpen(true)}
        isPwaInstalled={pwaInstall.isInstalled}
      />

      {activeTab === 'dashboard' ? (
        <main className="w-full">
          <ProjectDashboard
            projects={projects}
            activeProjectId={activeProject.id}
            batchQueue={batchQueue}
            telemetry={telemetry}
            onSelectAndOpenProject={handleSelectAndOpenProject}
            onOpenProjectInColab={handleOpenProjectInColab}
            onCreateProject={handleCreateProject}
            onUpdateProjectDetails={handleUpdateProjectDetails}
            onDeleteProject={handleDeleteProject}
            onSetProjectStatus={handleSetProjectStatus}
            onNavigate={setActiveTab}
          />
        </main>
      ) : activeTab === 'workbench' ? (
        <main className="w-full">
          <DesktopWorkbenchView
            projects={projects}
            activeProjectId={activeProject.id}
            batchQueue={batchQueue}
            config={config}
            onUpdateConfig={setConfig}
            findings={findings}
            driveUserEmail={driveUserEmail}
            driveAccessToken={driveAccessToken}
            isSigningIn={isSigningIn}
            telemetry={telemetry}
            wsStatus={wsStatus}
            ingestToken={ingestToken}
            pingSending={pingSending}
            onSelectProject={setActiveProjectId}
            onCreateProject={handleCreateProject}
            onDeleteProject={handleDeleteProject}
            onUpdateProjectAssets={handleUpdateProjectAssets}
            onUpdateAssetContent={handleUpdateAssetContent}
            onMoveAssetToFolder={handleMoveAssetToFolder}
            onAddOutputToProject={handleAddOutputToProject}
            onAddRevisionFeedback={handleAddRevisionFeedback}
            onAddToBatchQueue={handleAddBatchJob}
            onReorderBatchJob={handleReorderBatchJob}
            onRemoveBatchJob={handleRemoveBatchJob}
            onConnectDrive={handleConnectDrive}
            onSendBridgePing={() => sendBridgePing(activeProject.id, batchQueue.length)}
            onResetTelemetry={resetTelemetry}
            onDownloadFile={triggerDownload}
            onNavigate={setActiveTab}
          />
        </main>
      ) : (
        <main className="mx-auto max-w-[1600px] px-5 py-6 lg:px-6">
          {activeTab === 'kurulum' && (
            <OnboardingView
              onboarding={onboarding}
              onUpdateOnboarding={setOnboarding}
              config={config}
              onUpdateConfig={setConfig}
              activeProject={activeProject}
              driveUserEmail={driveUserEmail}
              driveAccessToken={driveAccessToken}
              isSigningIn={isSigningIn}
              onConnectDrive={handleConnectDrive}
              onDisconnectDrive={handleDisconnectDrive}
              onDownloadFile={triggerDownload}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === 'models' && (
            <ComfyModelInstallerView
              config={config}
              onUpdateConfig={setConfig}
              driveUserEmail={driveUserEmail}
              driveAccessToken={driveAccessToken}
              isSigningIn={isSigningIn}
              onConnectDrive={handleConnectDrive}
              onDownloadFile={triggerDownload}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === 'colab' && (
            <ColabConsoleView
              project={activeProject}
              projects={projects}
              batchQueue={batchQueue}
              config={config}
              onUpdateConfig={setConfig}
              findings={findings}
              driveUserEmail={driveUserEmail}
              driveAccessToken={driveAccessToken}
              isSigningIn={isSigningIn}
              onConnectDrive={handleConnectDrive}
              onDownloadFile={triggerDownload}
              onAddBatchJob={handleAddBatchJob}
              onReorderBatchJob={handleReorderBatchJob}
              onRemoveBatchJob={handleRemoveBatchJob}
              onClearCompletedBatchJobs={handleClearCompletedBatchJobs}
              onTriggerScheduledStart={handleTriggerScheduledStart}
              telemetry={telemetry}
              wsStatus={wsStatus}
              ingestToken={ingestToken}
              pingSending={pingSending}
              onSendBridgePing={() => sendBridgePing(activeProject.id, batchQueue.length)}
              onResetTelemetry={resetTelemetry}
            />
          )}

          {activeTab === 'claude' && (
            <ClaudeMcpView
              project={activeProject}
              projects={projects}
              batchQueue={batchQueue}
              config={config}
              preferredOs={onboarding.preferredOs}
              onDownloadFile={triggerDownload}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === 'denetim' && (
            <AnalysisView
              findings={findings}
              onToggleFinding={handleToggleFinding}
              assetCount={activeProject.assets.filter((a) => a.included).length}
              onNavigate={setActiveTab}
            />
          )}
        </main>
      )}

      <MacInstallModal
        isOpen={isMacInstallOpen}
        onClose={() => setIsMacInstallOpen(false)}
        isInstallable={pwaInstall.isInstallable}
        isInstalled={pwaInstall.isInstalled}
        isIOS={pwaInstall.isIOS}
        isMac={pwaInstall.isMac}
        isSafari={pwaInstall.isSafari}
        onInstallPwa={pwaInstall.install}
      />

      <OfflineIndicator />
    </div>
  );
}
