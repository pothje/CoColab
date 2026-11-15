import { useState } from 'react';
import { CheckCircle2, AlertTriangle, Sparkles, ArrowRight } from 'lucide-react';
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

  const criticalCount = findings.filter((f) => f.category === 'kritik_hata').length;
  const enabledCount = findings.filter((f) => f.enabledInExport).length;
  const filteredFindings =
    filter === 'all' ? findings : findings.filter((f) => f.category === filter);

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-slate-200 bg-white p-6 md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-2.5">
            <p className="text-xs font-semibold text-blue-600">
              Dahili Güvenlik &amp; Performans Özeti
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl text-balance">
              Otomatik hata korumaları ve kredi tasarrufu tek panelde
            </h1>
            <p className="text-sm leading-relaxed text-slate-600 md:text-base">
              Sistem arka planda ekran kartı uygunluğunu denetler, bellek taşmasını önler,
              modelleri en hızlı kanaldan indirir ve uygun olmayan bir makine denk gelirse
              krediniz yanmadan oturumu güvenli şekilde sonlandırır.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('workbench')}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              Stüdyoyu Aç
            </button>
            <button
              type="button"
              onClick={() => onNavigate('colab')}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
            >
              Üretim &amp; GPU Kontrolü
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 border-t border-slate-200 pt-6 lg:grid-cols-4">
          <div className="space-y-1">
            <div className="text-xs text-slate-500">Yerleşik Güvenlik Koruması</div>
            <div className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
              {criticalCount}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-slate-500">Aktif Otomasyon Modülü</div>
            <div className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
              {enabledCount} / {findings.length}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-slate-500">Hazır Proje Ögesi</div>
            <div className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
              {assetCount}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-slate-500">Çalıştırma Başına Ek LLM Maliyeti</div>
            <div className="font-mono text-2xl font-bold text-emerald-700 tabular-nums">
              $0.00
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Sistem Modülleri &amp; Korumalar
            </h2>
            <p className="text-sm text-slate-600">
              Aşağıdaki özellikler oluşturulan pakete otomatik olarak eklenir. İhtiyacınıza göre
              her birini açıp kapatabilirsiniz.
            </p>
          </div>

          <div
            role="group"
            aria-label="Modül filtresi"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 self-start"
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
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-white text-slate-900 font-semibold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {filteredFindings.map((item) => {
            const Icon =
              item.category === 'kritik_hata'
                ? AlertTriangle
                : item.category === 'optimizasyon'
                  ? CheckCircle2
                  : Sparkles;
            const iconColor =
              item.category === 'kritik_hata'
                ? 'text-rose-600'
                : item.category === 'optimizasyon'
                  ? 'text-amber-600'
                  : 'text-blue-600';

            return (
              <article
                key={item.id}
                className="p-6 transition-colors hover:bg-slate-50/70"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3 lg:max-w-4xl">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <Icon className={`h-3.5 w-3.5 ${iconColor}`} aria-hidden="true" />
                      <span className="font-semibold text-slate-700">
                        {CATEGORY_LABELS[item.category]}
                      </span>
                      {item.verdict && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span
                            className={`text-[11px] font-semibold uppercase ${
                              item.verdict === 'uygulandi'
                                ? 'text-emerald-700'
                                : item.verdict === 'kosullu'
                                  ? 'text-amber-700'
                                  : 'text-rose-700'
                            }`}
                          >
                            {item.verdict === 'uygulandi'
                              ? 'Aktif Koruma'
                              : item.verdict === 'kosullu'
                                ? 'İsteğe Bağlı Ön Ayar'
                                : 'Güvenli Alternatif Seçildi'}
                          </span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>{item.affectedStep}</span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900">
                      {item.title.replace(/`/g, '')}
                    </h3>

                    <div className="grid gap-4 pt-1 md:grid-cols-2">
                      <div>
                        <div className="text-xs font-semibold text-slate-500">
                          Önlenen Sorun
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-slate-700">
                          {item.problem.replace(/`/g, '')}
                        </p>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-500">
                          Otomatik Çözüm
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-slate-700">
                          {item.solution.replace(/`/g, '')}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 pt-1">
                    <button
                      type="button"
                      onClick={() => onToggleFinding(item.id)}
                      aria-pressed={item.enabledInExport}
                      className={`rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        item.enabledInExport
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'border-slate-200 bg-slate-50 text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {item.enabledInExport ? 'Pakete Dahil' : 'Devre Dışı'}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
