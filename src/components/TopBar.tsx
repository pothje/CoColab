import { Download, Laptop } from 'lucide-react';
import { WorkspaceTab } from '../types/automation';

interface TopBarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  onDownloadNotebook: () => void;
  onOpenMacInstall: () => void;
  isPwaInstalled?: boolean;
}

const NAV_ITEMS: { id: WorkspaceTab; label: string }[] = [
  { id: 'dashboard', label: 'Projeler' },
  { id: 'workbench', label: 'Stüdyo' },
  { id: 'models', label: 'Model Yükleyici' },
  { id: 'colab', label: 'Üretim & GPU' },
  { id: 'kurulum', label: 'Bağlantılar' },
  { id: 'claude', label: 'Otomasyon' },
];

export function TopBar({
  activeTab,
  onSelectTab,
  onDownloadNotebook,
  onOpenMacInstall,
  isPwaInstalled = false,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-3 px-4 lg:gap-8 lg:px-6">
        <button
          type="button"
          onClick={() => onSelectTab('dashboard')}
          className="text-left text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 transition-colors hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
        >
          ColabForge
        </button>

        <nav
          aria-label="Ana gezinme"
          className="hidden h-14 items-center gap-5 lg:flex lg:gap-6"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative flex h-14 items-center text-sm font-medium transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600 ${
                  isActive
                    ? 'text-blue-600 font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {!isPwaInstalled && (
            <button
              type="button"
              onClick={onOpenMacInstall}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-900 sm:px-3 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              <Laptop className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
              <span>Mac&apos;e İndir</span>
            </button>
          )}

          <button
            type="button"
            onClick={onDownloadNotebook}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors duration-150 hover:bg-blue-700 md:gap-2 md:px-4 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              <span className="hidden sm:inline">Çalıştırma Dosyası </span>İndir
            </span>
          </button>
        </div>
      </div>

      {/* Mobile/tablet horizontal nav row so items never clip mid-letter */}
      <nav
        aria-label="Mobil gezinme"
        className="flex items-center gap-4 overflow-x-auto border-t border-slate-100 px-4 lg:hidden"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative py-2.5 text-xs font-medium whitespace-nowrap shrink-0 ${
                isActive ? 'text-blue-600 font-semibold' : 'text-slate-600'
              }`}
            >
              {item.label}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600"
                />
              )}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
