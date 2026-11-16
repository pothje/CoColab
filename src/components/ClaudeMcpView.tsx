import { useMemo, useState } from 'react';
import { ArrowRight, Check, ChevronDown, Copy, Download } from 'lucide-react';
import { AutomationConfig, BatchQueueItem, ColabProject, WorkspaceTab } from '../types/automation';
import {
  generateBatchQueueJson,
  generateColabMcpServer,
  generateZeroCreditRunner,
} from '../utils/codeGenerators';
import {
  generateClaudeDesktopConfigSnippet,
  generateClaudeRulesMd,
  generateClaudeSkillMd,
  generateMcpInstallerScript,
  generateRoutingManifestJson,
} from '../utils/claudeGenerators';

interface ClaudeMcpViewProps {
  project: ColabProject;
  projects: ColabProject[];
  batchQueue: BatchQueueItem[];
  config: AutomationConfig;
  preferredOs: 'windows' | 'macos_linux';
  onDownloadFile: (filename: string, content: string | Blob, mime: string) => void;
  onNavigate?: (tab: WorkspaceTab) => void;
}

type DocTab =
  | 'installer'
  | 'skill'
  | 'rules'
  | 'config'
  | 'mcp'
  | 'batch'
  | 'manifest'
  | 'runner';

export function ClaudeMcpView({
  project,
  projects,
  batchQueue,
  config,
  preferredOs,
  onDownloadFile,
  onNavigate,
}: ClaudeMcpViewProps) {
  const [activeDoc, setActiveDoc] = useState<DocTab>('installer');
  const [osTarget, setOsTarget] = useState<'windows' | 'macos_linux'>(preferredOs);
  const [copied, setCopied] = useState(false);
  const [showFilesDrawer, setShowFilesDrawer] = useState(false);

  const mcpServerPy = useMemo(
    () => generateColabMcpServer(config, project.assets),
    [config, project.assets]
  );

  const docs = useMemo(
    () => ({
      installer: {
        label: osTarget === 'windows' ? 'Kurucu (.ps1)' : 'Kurucu (.sh)',
        filename:
          osTarget === 'windows'
            ? 'install_colabforge_mcp.ps1'
            : 'install_colabforge_mcp.sh',
        mime: 'text/plain;charset=utf-8',
        content: generateMcpInstallerScript(osTarget, project, config, mcpServerPy),
      },
      skill: {
        label: 'SKILL.md',
        filename: 'SKILL.md',
        mime: 'text/markdown;charset=utf-8',
        content: generateClaudeSkillMd(project, config),
      },
      rules: {
        label: 'CLAUDE.md',
        filename: 'CLAUDE.md',
        mime: 'text/markdown;charset=utf-8',
        content: generateClaudeRulesMd(project, config),
      },
      config: {
        label: 'Masaüstü Ayarı',
        filename: 'claude_desktop_config.json',
        mime: 'application/json',
        content: generateClaudeDesktopConfigSnippet(osTarget, config),
      },
      mcp: {
        label: 'MCP Köprüsü',
        filename: 'colab_mcp_server.py',
        mime: 'text/x-python',
        content: mcpServerPy,
      },
      batch: {
        label: 'Sıra Listesi',
        filename: 'batch_queue_manifest.json',
        mime: 'application/json',
        content: generateBatchQueueJson(batchQueue, projects, config),
      },
      manifest: {
        label: 'Proje Haritası',
        filename: '01_routing_manifest.json',
        mime: 'application/json',
        content: generateRoutingManifestJson(project, config),
      },
      runner: {
        label: 'Kontrolcü',
        filename: 'local_zero_credit_runner.py',
        mime: 'text/x-python',
        content: generateZeroCreditRunner(config, project.assets),
      },
    }),
    [project, projects, batchQueue, config, mcpServerPy, osTarget]
  );

  const current = docs[activeDoc];

  const allRevisions = useMemo(
    () =>
      project.outputs.flatMap((out) =>
        out.notes.map((note) => ({ outputTitle: out.title, note }))
      ),
    [project.outputs]
  );

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(current.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard ignored
    }
  }

  return (
    <div className="space-y-6 text-[#F5F5F7]">
      {/* Clean Hero + Primary Installer Download */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#141417] p-6 space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-medium text-[#0A84FF]">Claude Masaüstü Köprüsü</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#F5F5F7]">
              Claude &amp; Otomasyon Kurulum Paketi
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              İşletim sisteminizi seçin ve Claude’u stüdyonuza tek tıkla bağlayın.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div className="inline-flex rounded-xl border border-white/[0.06] bg-[#0E0E11] p-1">
              <button
                type="button"
                onClick={() => setOsTarget('windows')}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  osTarget === 'windows'
                    ? 'bg-white/[0.12] text-[#F5F5F7]'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Windows
              </button>
              <button
                type="button"
                onClick={() => setOsTarget('macos_linux')}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  osTarget === 'macos_linux'
                    ? 'bg-white/[0.12] text-[#F5F5F7]'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                macOS / Linux
              </button>
            </div>

            <button
              type="button"
              onClick={() =>
                onDownloadFile(current.filename, current.content, current.mime)
              }
              className="inline-flex items-center gap-1.5 rounded-full bg-[#0A84FF] px-4 py-2 text-xs font-semibold text-white hover:brightness-110 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              {current.filename} İndir
            </button>

            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('denetim')}
                className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-[#1C1C20] px-3.5 py-2 text-xs font-medium text-zinc-200 hover:bg-white/[0.08] whitespace-nowrap"
              >
                <span>Sistem Korumaları</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Code & File Viewer */}
        <div className="rounded-xl border border-white/[0.06] bg-[#0E0E11]">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              type="button"
              onClick={() => setShowFilesDrawer((v) => !v)}
              className="flex items-center gap-2 text-xs font-medium text-zinc-300 hover:text-white"
            >
              <ChevronDown
                className={`h-4 w-4 text-zinc-500 transition-transform ${
                  showFilesDrawer ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
              <span>Paketteki Dosyaları İncele &amp; Kopyala</span>
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-white"
            >
              {copied ? (
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
          </div>

          {showFilesDrawer && (
            <div className="border-t border-white/[0.06] p-4 space-y-3">
              <div
                role="tablist"
                aria-label="Otomasyon paketi dosyaları"
                className="flex items-center gap-1 overflow-x-auto rounded-lg border border-white/[0.06] bg-[#141417] p-1"
              >
                {(Object.keys(docs) as DocTab[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={activeDoc === key}
                    onClick={() => setActiveDoc(key)}
                    className={`rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                      activeDoc === key
                        ? 'bg-white/[0.12] text-white'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {docs[key].label}
                  </button>
                ))}
              </div>

              <pre className="max-h-80 overflow-auto rounded-xl border border-white/[0.06] bg-[#141417] p-4 font-mono text-xs leading-relaxed text-zinc-300">
                {current.content}
              </pre>
            </div>
          )}
        </div>
      </section>

      {/* Revisions Section */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#141417] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#F5F5F7]">
              Video Revizyon Notları ({allRevisions.length})
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Stüdyo ekranında eklenen sahne düzeltme talepleri burada toplanır.
            </p>
          </div>
          {allRevisions.length > 0 && (
            <button
              type="button"
              onClick={() =>
                onDownloadFile(
                  'feedback_notes.json',
                  JSON.stringify(
                    allRevisions.map((r) => r.note),
                    null,
                    2
                  ),
                  'application/json'
                )
              }
              className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-[#1C1C20] px-3.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.08]"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Notları İndir
            </button>
          )}
        </div>

        {allRevisions.length === 0 ? (
          <p className="mt-3 text-xs text-zinc-500">
            Henüz bir revizyon talebi oluşturulmadı.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] bg-[#0E0E11]">
            {allRevisions.map(({ outputTitle, note }) => (
              <div key={note.id} className="space-y-1 p-4 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[#F5F5F7]">{outputTitle}</span>
                  <span className="font-medium text-[#0A84FF]">{note.severity}</span>
                </div>
                <p className="text-zinc-300">{note.note}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
