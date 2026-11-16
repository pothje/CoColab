import { useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { AuditCategory, AuditFinding, WorkspaceTab } from '../types/automation';

interface AnalysisViewProps {
  findings: AuditFinding[];
  onToggleFinding: (id: string) => void;
  assetCount: number;
  onNavigate: (tab: WorkspaceTab) => void;
}

type FilterValue = 'all' | AuditCategory;

const CATEGORY_LABELS: Record<AuditCategory, string> = {
  kritik_hata: 'Güvenlik Koruması',
  optimizasyon: 'Hız & Tasarruf',
  yeni_ozellik: 'Akıllı Özellik',
};

export function AnalysisView({
  findings,
  onToggleFinding,
  assetCount,
  onNavigate,
}: AnalysisViewProps) {
  const [filter, setFilter] = useState<FilterValue>('all');

  const enabledCount = findings.filter((f) => f.enabledInExport).length;
  const filteredFindings =
    filter === 'all' ? findings : findings.filter((f) => f.category === filter);

  return (
    <div className="space-y-6 text-[#F5F5F7]">
      <section className="rounded-2xl border border-white/[0.08] bg-[#141417] p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <button
              type="button"
              onClick={() => onNavigate('claude')}
              className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-[#0A84FF] hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Claude Otomasyonuna Dön
            </button>
            <h1 className="text-2xl font-semibold tracking-tight text-[#F5F5F7]">
              Sistem Korumaları ({enabledCount}/{findings.length} aktif · {assetCount} öge)
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Üretim paketine otomatik eklenen donanım ve bellek korumalarını açıp kapatabilirsiniz.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('colab')}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#0A84FF] px-4 py-2 text-xs font-semibold text-white hover:brightness-110 whitespace-nowrap shrink-0 self-start lg:self-auto"
          >
            Üretime Geç
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <div
          role="group"
          aria-label="Modül filtresi"
          className="mt-5 inline-flex items-center gap-1 rounded-xl border border-white/[0.06] bg-[#0E0E11] p-1"
        >
          {(
            [
              { value: 'all', label: 'Tümü' },
              { value: 'kritik_hata', label: 'Güvenlik' },
              { value: 'optimizasyon', label: 'Hız & Tasarruf' },
              { value: 'yeni_ozellik', label: 'Özellikler' },
            ] as const
          ).map((opt) => {
            const active = filter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFilter(opt.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-white/[0.12] text-[#F5F5F7]'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </section>

      <div className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.08] bg-[#141417]">
        {filteredFindings.map((item) => (
          <article
            key={item.id}
            className="flex flex-col gap-4 p-5 transition-colors hover:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="space-y-1 min-w-0">
              <div className="text-xs font-medium text-[#0A84FF]">
                {CATEGORY_LABELS[item.category]}
              </div>
              <h2 className="text-sm font-semibold text-[#F5F5F7]">
                {item.title.replace(/`/g, '')}
              </h2>
              <p className="text-xs leading-relaxed text-zinc-400">
                {item.solution.replace(/`/g, '')}
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={item.enabledInExport}
              aria-label={item.title.replace(/`/g, '')}
              onClick={() => onToggleFinding(item.id)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#0A84FF]/60 self-end sm:self-center ${
                item.enabledInExport ? 'bg-[#30D158]' : 'bg-zinc-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                  item.enabledInExport ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
