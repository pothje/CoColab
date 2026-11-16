import { Download, Laptop } from 'lucide-react';
import { WorkspaceTab } from '../types/automation';

interface TopBarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  onDownloadNotebook: () => void;
  onOpenMacInstall: () => void;
  isPwaInstalled?: boolean;
}

interface TopNavSpec {
  id: WorkspaceTab;
  label: string;
  matches: WorkspaceTab[];
}

const NAV_ITEMS: TopNavSpec[] = [
  { id: 'dashboard', label: 'Projeler', matches: ['dashboard'] },
  { id: 'workbench', label: 'Stüdyo', matches: ['workbench'] },
  { id: 'colab', label: 'Üretim', matches: ['colab'] },
  {
    id: 'models',
    label: 'Modeller & Kurulum',
    matches: ['models', 'kurulum', 'claude', 'denetim'],
  },
];

export function TopBar({
  activeTab,
  onSelectTab,
  onDownloadNotebook,
  onOpenMacInstall,
  isPwaInstalled = false,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#09090B]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-8 px-4 lg:px-8">
        {/* Zone 1: Brand Wordmark */}
        <button
          type="button"
          onClick={() => onSelectTab('dashboard')}
          className="text-left text-[15px] font-semibold tracking-tight text-[#F5F5F7] whitespace-nowrap shrink-0 transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0A84FF]"
        >
          ColabForge
        </button>

        {/* Zone 2: 4 Clean Single-Line Navigation Links */}
        <nav
          aria-label="Ana gezinme"
          className="hidden items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] p-1 md:flex"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = item.matches.includes(activeTab);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF] ${
                  isActive
                    ? 'bg-white/[0.12] text-[#F5F5F7] font-semibold'
                    : 'text-zinc-400 hover:text-[#F5F5F7]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single Primary Action (+ discreet PWA icon) */}
        <div className="flex shrink-0 items-center gap-2">
          {!isPwaInstalled && (
            <button
              type="button"
              onClick={onOpenMacInstall}
              aria-label="Mac'e İndir"
              title="Mac'e İndir"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-zinc-400 transition-colors hover:bg-white/[0.1] hover:text-[#F5F5F7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]"
            >
              <Laptop className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}

          <button
            type="button"
            onClick={onDownloadNotebook}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#0A84FF] px-4 py-1.5 text-xs font-semibold text-white transition-colors duration-150 hover:bg-[#2494FF] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Defteri İndir</span>
          </button>
        </div>
      </div>

      {/* Mobile Clean Horizontal Nav */}
      <nav
        aria-label="Mobil gezinme"
        className="flex items-center gap-2 overflow-x-auto border-t border-white/[0.06] px-4 py-2 md:hidden"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = item.matches.includes(activeTab);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                isActive
                  ? 'bg-white/[0.12] text-[#F5F5F7] font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
