import { Cpu, KeyRound, Sparkles } from 'lucide-react';
import {
  AuditFinding,
  AutomationConfig,
  BatchQueueItem,
  ColabProject,
  OnboardingState,
  WorkspaceTab,
} from '../types/automation';
import { ComfyModelInstallerView } from './ComfyModelInstallerView';
import { OnboardingView } from './OnboardingView';
import { ClaudeMcpView } from './ClaudeMcpView';
import { AnalysisView } from './AnalysisView';

interface SetupHubViewProps {
  activeTab: 'models' | 'kurulum' | 'claude' | 'denetim';
  onSelectTab: (tab: WorkspaceTab) => void;
  config: AutomationConfig;
  onUpdateConfig: (next: AutomationConfig) => void;
  onboarding: OnboardingState;
  onUpdateOnboarding: (next: OnboardingState) => void;
  activeProject: ColabProject;
  projects: ColabProject[];
  batchQueue: BatchQueueItem[];
  findings: AuditFinding[];
  onToggleFinding: (id: string) => void;
  driveUserEmail: string | null;
  driveAccessToken: string | null;
  isSigningIn: boolean;
  onConnectDrive: () => Promise<void>;
  onDisconnectDrive: () => Promise<void>;
  onDownloadFile: (filename: string, content: string | Blob, mime: string) => void;
}

const HUB_SEGMENTS: Array<{
  id: 'models' | 'kurulum' | 'claude';
  label: string;
  icon: typeof Cpu;
}> = [
  { id: 'models', label: 'Video Modelleri', icon: Cpu },
  { id: 'kurulum', label: 'Google & Colab', icon: KeyRound },
  { id: 'claude', label: 'Claude Otomasyon', icon: Sparkles },
];

export function SetupHubView({
  activeTab,
  onSelectTab,
  config,
  onUpdateConfig,
  onboarding,
  onUpdateOnboarding,
  activeProject,
  projects,
  batchQueue,
  findings,
  onToggleFinding,
  driveUserEmail,
  driveAccessToken,
  isSigningIn,
  onConnectDrive,
  onDisconnectDrive,
  onDownloadFile,
}: SetupHubViewProps) {
  const currentSegment = activeTab === 'denetim' ? 'claude' : activeTab;

  return (
    <div className="space-y-6">
      {/* Apple Segmented Hub Header */}
      <div className="flex justify-center sm:justify-start">
        <div
          role="tablist"
          aria-label="Modeller ve kurulum bölümleri"
          className="inline-flex max-w-full overflow-x-auto rounded-full border border-white/[0.08] bg-[#141417] p-1"
        >
          {HUB_SEGMENTS.map((seg) => {
            const Icon = seg.icon;
            const active = currentSegment === seg.id;
            return (
              <button
                key={seg.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelectTab(seg.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white/[0.12] text-[#F5F5F7]'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{seg.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'models' && (
        <ComfyModelInstallerView
          config={config}
          onUpdateConfig={onUpdateConfig}
          driveUserEmail={driveUserEmail}
          driveAccessToken={driveAccessToken}
          isSigningIn={isSigningIn}
          onConnectDrive={onConnectDrive}
          onDownloadFile={onDownloadFile}
          onNavigate={onSelectTab}
        />
      )}

      {activeTab === 'kurulum' && (
        <OnboardingView
          onboarding={onboarding}
          onUpdateOnboarding={onUpdateOnboarding}
          config={config}
          onUpdateConfig={onUpdateConfig}
          activeProject={activeProject}
          driveUserEmail={driveUserEmail}
          driveAccessToken={driveAccessToken}
          isSigningIn={isSigningIn}
          onConnectDrive={onConnectDrive}
          onDisconnectDrive={onDisconnectDrive}
          onDownloadFile={onDownloadFile}
          onNavigate={onSelectTab}
        />
      )}

      {activeTab === 'claude' && (
        <ClaudeMcpView
          project={activeProject}
          projects={projects}
          batchQueue={batchQueue}
          config={config}
          preferredOs={onboarding.preferredOs}
          onDownloadFile={onDownloadFile}
          onNavigate={onSelectTab}
        />
      )}

      {activeTab === 'denetim' && (
        <AnalysisView
          findings={findings}
          onToggleFinding={onToggleFinding}
          assetCount={activeProject.assets.filter((a) => a.included).length}
          onNavigate={onSelectTab}
        />
      )}
    </div>
  );
}
