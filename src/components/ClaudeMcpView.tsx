import { useMemo, useState } from 'react';
import { Copy, Check, Download, ArrowRight } from 'lucide-react';
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
  | 'skill'
  | 'rules'
  | 'config'
  | 'mcp'
  | 'installer'
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
  const [activeDoc, setActiveDoc] = useState<DocTab>('skill');
  const [osTarget, setOsTarget] = useState<'windows' | 'macos_linux'>(preferredOs);
  const [copied, setCopied] = useState(false);

  const mcpServerPy = useMemo(
    () => generateColabMcpServer(config, project.assets),
    [config, project.assets]
  );

  const docs = useMemo(
    () => ({
      skill: {
        label: 'Claude Yetenek Rehberi',
        filename: 'SKILL.md',
        mime: 'text/markdown;charset=utf-8',
        description:
          'Claude’un proje klasörünüzü doğru tanıması, promptları doğru yere kaydetmesi ve revizyon kurallarına uyması için rehber dosya.',
        content: generateClaudeSkillMd(project, config),
      },
      rules: {
        label: 'Proje Kuralları',
        filename: 'CLAUDE.md',
        mime: 'text/markdown;charset=utf-8',
        description:
          'Kişiye özel dosya yollarını engelleyen ve her bilgisayarda aynı şekilde çalışan güvenlik kuralları.',
        content: generateClaudeRulesMd(project, config),
      },
      installer: {
        label: osTarget === 'windows' ? 'Tek Tık Kurucu (.ps1)' : 'Tek Tık Kurucu (.sh)',
        filename:
          osTarget === 'windows'
            ? 'install_colabforge_mcp.ps1'
            : 'install_colabforge_mcp.sh',
        mime: 'text/plain;charset=utf-8',
        description:
          'Bilgisayarınızda hiçbir teknik ayar yapmadan tüm bağlantıları ve rehber dosyalarını otomatik kuran dosya.',
        content: generateMcpInstallerScript(osTarget, project, config, mcpServerPy),
      },
      config: {
        label: 'Masaüstü Bağlantısı',
        filename: 'claude_desktop_config.json',
        mime: 'application/json',
        description:
          'Claude masaüstü uygulamasının hem Google Colab hem de proje klasörünüze bağlanmasını sağlayan ayar.',
        content: generateClaudeDesktopConfigSnippet(osTarget, config),
      },
      mcp: {
        label: 'Yerel Köprü Servisi',
        filename: 'colab_mcp_server.py',
        mime: 'text/x-python',
        description:
          'Claude’un yalnızca izin verilen proje dosyalarını düzenlemesini sağlayan yerel bağlantı bileşeni.',
        content: mcpServerPy,
      },
      batch: {
        label: 'Toplu Sıra Dosyası',
        filename: 'batch_queue_manifest.json',
        mime: 'application/json',
        description:
          'Tek oturumda art arda üretilecek tüm sahnelerin sırasını tutan liste.',
        content: generateBatchQueueJson(batchQueue, projects, config),
      },
      manifest: {
        label: 'Proje Haritası',
        filename: '01_routing_manifest.json',
        mime: 'application/json',
        description:
          'Aktif projenizdeki prompt, referans görsel ve 3D sahne dosyalarının eşleştirme listesi.',
        content: generateRoutingManifestJson(project, config),
      },
      runner: {
        label: 'Otomatik Kontrolcü',
        filename: 'local_zero_credit_runner.py',
        mime: 'text/x-python',
        description:
          'Ek yapay zeka kredisi harcamadan dosyalarınızı doğrulayıp hazırlayan yardımcı araç.',
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
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Claude &amp; Otomasyon Kurulum Paketi
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Teknik bilgi gerektirmeden Claude’u stüdyonuza bağlamak için hazır kurulum
              dosyalarını buradan indirebilirsiniz.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('denetim')}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 whitespace-nowrap"
              >
                <span>Sistem Özeti</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setOsTarget('windows')}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                  osTarget === 'windows'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Windows
              </button>
              <button
                type="button"
                onClick={() => setOsTarget('macos_linux')}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                  osTarget === 'macos_linux'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                macOS / Linux
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                  Kopyalandı
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  Kopyala
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() =>
                onDownloadFile(current.filename, current.content, current.mime)
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              {current.filename} İndir
            </button>
          </div>
        </div>

        {/* Clean 3-column flow strip */}
        <div className="grid divide-y divide-slate-200 rounded-lg border border-slate-200 bg-slate-50 md:grid-cols-3 md:divide-y-0 md:divide-x">
          <div className="p-4">
            <div className="text-xs font-semibold text-blue-600">1. Yapay Zeka Kuralları</div>
            <div className="mt-1 text-xs font-bold text-slate-900">
              Standart Klasör &amp; Sahne Yapısı
            </div>
            <div className="mt-0.5 text-xs text-slate-600">
              Promptlar ve referans görseller her seferinde doğru klasöre yerleşir.
            </div>
          </div>
          <div className="p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <span>2. Otomatik Bulut Köprüsü</span>
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </div>
            <div className="mt-1 text-xs font-bold text-slate-900">
              Doğrudan Colab &amp; Video Motoru Kontrolü
            </div>
            <div className="mt-0.5 text-xs text-slate-600">
              Tarayıcı botları olmadan güvenli ve kararlı uzaktan yönetim.
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs font-semibold text-amber-700">3. Sıfır Ek Maliyet</div>
            <div className="mt-1 text-xs font-bold text-slate-900">
              Otomatik Sıralı Video İndirme
            </div>
            <div className="mt-0.5 text-xs text-slate-600">
              Üretilen tüm sahneler tek kurulumla doğrudan proje klasörünüze gelir.
            </div>
          </div>
        </div>

        <div className="border-b border-slate-200 pb-4">
          <div
            role="tablist"
            aria-label="Otomasyon paketi dosyaları"
            className="flex items-center gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-slate-100 p-1"
          >
            {(Object.keys(docs) as DocTab[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={activeDoc === key}
                onClick={() => setActiveDoc(key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  activeDoc === key
                    ? 'bg-white text-slate-900 font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {docs[key].label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4 text-xs text-slate-600">
            <span>{current.description}</span>
            <span className="font-mono text-slate-500 tabular-nums shrink-0">
              {current.content.split('\n').length} satır
            </span>
          </div>

          <pre className="max-h-[420px] overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-5 font-mono text-xs leading-relaxed text-slate-800">
            {current.content}
          </pre>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Video Revizyon Notları ({allRevisions.length})
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Stüdyo ekranında &ldquo;Yeniden Düzenle&rdquo; ile eklediğiniz tüm sahne düzeltme
              talepleri burada listelenir.
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
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-blue-300"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Notları İndir
            </button>
          )}
        </div>

        {allRevisions.length === 0 ? (
          <p className="mt-4 text-xs text-slate-500">
            Henüz bir revizyon talebi oluşturulmadı. Stüdyo ekranındaki render önizlemesinden
            beğenmediğiniz sahnelere not ekleyebilirsiniz.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-slate-50">
            {allRevisions.map(({ outputTitle, note }) => (
              <div key={note.id} className="space-y-1.5 p-4 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">{outputTitle}</span>
                  <span className="font-medium text-blue-600">
                    {note.status === 'claude_yetkilendirildi' ? 'Claude’a İletildi' : note.status} ·{' '}
                    {note.severity}
                  </span>
                </div>
                <p className="text-slate-700">{note.note}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
