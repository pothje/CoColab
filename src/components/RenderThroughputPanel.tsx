import { useMemo, useState } from 'react';
import * as d3 from 'd3';
import { ChevronDown } from 'lucide-react';
import {
  AutomationConfig,
  BatchJobStatus,
  BatchQueueItem,
  ColabProject,
  TelemetrySnapshot,
  WorkspaceTab,
} from '../types/automation';
import {
  buildRenderThroughputReport,
  type RenderThroughputDatum,
  type ThroughputComplianceState,
  type ThroughputGpuTierSelection,
  type ThroughputMetricMode,
} from '../utils/renderThroughput';

interface RenderThroughputPanelProps {
  batchQueue: BatchQueueItem[];
  projects: ColabProject[];
  config: AutomationConfig;
  telemetry: TelemetrySnapshot;
  onOpenProject: (projectId: string) => void;
  onNavigate: (tab: WorkspaceTab) => void;
}

const COMPLIANCE_META: Record<
  ThroughputComplianceState,
  {
    label: string;
    textClass: string;
    barFill: string;
    barStroke: string;
  }
> = {
  on_target: {
    label: 'Hedefte',
    textClass: 'text-[#30D158]',
    barFill: '#30D158',
    barStroke: '#5EE17E',
  },
  over_target: {
    label: 'Hedef Üstü',
    textClass: 'text-[#FF9F0A]',
    barFill: '#FF9F0A',
    barStroke: '#FFB340',
  },
  queued: {
    label: 'Sırada',
    textClass: 'text-zinc-400',
    barFill: '#2C2C34',
    barStroke: '#52525B',
  },
  error: {
    label: 'Durdu',
    textClass: 'text-[#FF453A]',
    barFill: '#FF453A',
    barStroke: '#FF6961',
  },
};

const JOB_STATUS_TEXT: Record<BatchJobStatus, string> = {
  kuyrukta: 'Sırada',
  hazirlaniyor: 'Hazırlanıyor',
  isleniyor: 'İşleniyor',
  tamamlandi: 'Tamamlandı',
  hata: 'Durduruldu',
};

const SVG_WIDTH = 720;
const SVG_HEIGHT = 224;
const MARGIN = { top: 24, right: 84, bottom: 34, left: 42 };
const INNER_WIDTH = SVG_WIDTH - MARGIN.left - MARGIN.right;
const INNER_HEIGHT = SVG_HEIGHT - MARGIN.top - MARGIN.bottom;

export function RenderThroughputPanel({
  batchQueue,
  projects,
  config,
  telemetry,
  onOpenProject,
  onNavigate,
}: RenderThroughputPanelProps) {
  const [tierSelection, setTierSelection] =
    useState<ThroughputGpuTierSelection>('auto');
  const [metricMode, setMetricMode] =
    useState<ThroughputMetricMode>('duration');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  const report = useMemo(
    () =>
      buildRenderThroughputReport(
        batchQueue,
        projects,
        config,
        tierSelection,
        telemetry
      ),
    [batchQueue, projects, config, tierSelection, telemetry]
  );

  const activeDatum: RenderThroughputDatum | null = useMemo(() => {
    if (report.items.length === 0) return null;
    return (
      report.items.find((item) => item.id === selectedJobId) ??
      report.items.find((item) => item.status === 'isleniyor') ??
      report.items[0]
    );
  }, [report.items, selectedJobId]);

  const chartGeometry = useMemo(() => {
    const items = report.items;
    const xScale = d3
      .scaleBand<string>()
      .domain(items.map((d) => d.id))
      .range([0, INNER_WIDTH])
      .padding(0.32);

    const rawMax =
      metricMode === 'duration'
        ? Math.max(
            report.profile.targetRenderMin * 1.35,
            d3.max(items, (d) =>
              Math.max(d.displayDurationMin, d.estimatedMin)
            ) ?? 4.0
          )
        : Math.max(
            135,
            d3.max(items, (d) => d.efficiencyRatioPct) ?? 120
          );

    const yDomainMax =
      metricMode === 'duration'
        ? Math.ceil(rawMax * 1.2 * 10) / 10
        : Math.ceil((rawMax * 1.15) / 20) * 20;

    const yScale = d3
      .scaleLinear()
      .domain([0, Math.max(1, yDomainMax)])
      .nice()
      .range([INNER_HEIGHT, 0]);

    const yTicks = yScale.ticks(4);
    const targetValue =
      metricMode === 'duration' ? report.profile.targetRenderMin : 100;
    const targetY = yScale(targetValue);

    return {
      xScale,
      yScale,
      yTicks,
      targetValue,
      targetY,
    };
  }, [report.items, report.profile.targetRenderMin, metricMode]);

  const { xScale, yScale, yTicks, targetValue, targetY } = chartGeometry;
  const bandWidth = xScale.bandwidth();

  return (
    <section
      aria-labelledby="render-throughput-heading"
      data-testid="render-throughput-panel"
      className="overflow-hidden rounded-[32px] border border-white/[0.1] bg-white/[0.045] backdrop-blur-2xl backdrop-saturate-150 shadow-[0_24px_56px_-16px_rgba(0,0,0,0.68),inset_0_1px_0_0_rgba(255,255,255,0.12)]"
    >
      {/* Clean Header + Minimal Metrics Summary */}
      <div className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <h2
              id="render-throughput-heading"
              className="text-[15px] font-medium tracking-[-0.015em] text-white/95"
            >
              Render Verimliliği
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              {report.profile.tierLabel} · {report.totalJobs} iş
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-xs">
            <div>
              <span className="text-zinc-500">Ortalama Süre</span>
              <div
                data-testid="throughput-avg-duration"
                className="font-mono text-base font-semibold text-[#F5F5F7] tabular-nums"
              >
                {report.avgActualMin !== null ? `${report.avgActualMin.toFixed(1)} dk` : '—'}
              </div>
            </div>
            <div>
              <span className="text-zinc-500">Hedef</span>
              <div
                data-testid="throughput-target-threshold"
                className="font-mono text-base font-semibold text-[#0A84FF] tabular-nums"
              >
                {report.profile.targetRenderMin.toFixed(1)} dk
              </div>
            </div>
            <div>
              <span className="text-zinc-500">Uyum</span>
              <div
                data-testid="throughput-compliance-pct"
                className={`font-mono text-base font-semibold tabular-nums ${
                  report.targetCompliancePct === null
                    ? 'text-zinc-300'
                    : report.targetCompliancePct >= 75
                      ? 'text-[#30D158]'
                      : 'text-[#FF9F0A]'
                }`}
              >
                {report.targetCompliancePct !== null
                  ? `%${report.targetCompliancePct}`
                  : '—'}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div
            role="group"
            aria-label="A100 hedef profili"
            className="inline-flex items-center rounded-full border border-white/[0.08] bg-[#0E0E11] p-0.5"
          >
            {(
              [
                { id: 'auto', label: 'Otomatik' },
                { id: '80GB', label: '80GB' },
                { id: '40GB', label: '40GB' },
              ] as const
            ).map((opt) => {
              const active = tierSelection === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTierSelection(opt.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-white/[0.12] text-[#F5F5F7] font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div
            role="group"
            aria-label="Grafik ölçüm modu"
            className="inline-flex items-center rounded-full border border-white/[0.08] bg-[#0E0E11] p-0.5"
          >
            {(
              [
                { id: 'duration', label: 'Süre' },
                { id: 'efficiency', label: 'Verim' },
              ] as const
            ).map((opt) => {
              const active = metricMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setMetricMode(opt.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-white/[0.12] text-[#F5F5F7] font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            aria-expanded={isExpanded}
            aria-label="Render grafiğini aç veya gizle"
            onClick={() => setIsExpanded((v) => !v)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-zinc-400 hover:bg-white/[0.1] hover:text-[#F5F5F7]"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {/* Expandable Calm Chart & Queue Strip */}
      {isExpanded && (
        <div className="border-t border-white/[0.07]">
          {report.items.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <p className="text-xs text-zinc-400">
                Üretim sırasına sahne eklediğinizde render süreleri burada görselleştirilir.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('colab')}
                className="mt-3 rounded-full bg-white/[0.08] px-4 py-1.5 text-xs font-medium text-[#F5F5F7] hover:bg-white/[0.14]"
              >
                Üretime Git
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12">
              {/* Left: Airy D3 Chart */}
              <div className="p-5 lg:col-span-7">
                <div className="w-full overflow-x-auto">
                  <svg
                    data-testid="render-throughput-chart"
                    role="img"
                    aria-label="Toplu kuyruk işleri render süresi ve A100 hedef karşılaştırma grafiği"
                    viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                    style={{
                      minWidth:
                        report.items.length > 5
                          ? `${report.items.length * 100}px`
                          : undefined,
                    }}
                    className="h-auto w-full select-none"
                  >
                    <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
                      {yTicks.map((tick) => {
                        const y = yScale(tick);
                        return (
                          <g key={tick} transform={`translate(0,${y})`}>
                            <line
                              x1={0}
                              x2={INNER_WIDTH}
                              y1={0}
                              y2={0}
                              stroke="rgba(255,255,255,0.06)"
                              strokeWidth={1}
                            />
                            <text
                              x={-10}
                              y={0}
                              dy="0.32em"
                              textAnchor="end"
                              fill="#71717A"
                              fontSize={11}
                              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                            >
                              {metricMode === 'duration' ? `${tick.toFixed(1)}` : `%${tick}`}
                            </text>
                          </g>
                        );
                      })}

                      <line
                        x1={0}
                        x2={INNER_WIDTH}
                        y1={INNER_HEIGHT}
                        y2={INNER_HEIGHT}
                        stroke="rgba(255,255,255,0.12)"
                        strokeWidth={1}
                      />

                      {report.items.map((item) => {
                        const x = xScale(item.id) ?? 0;
                        const isActive = activeDatum?.id === item.id;
                        const meta = COMPLIANCE_META[item.complianceState];

                        const primaryValue =
                          metricMode === 'duration'
                            ? item.displayDurationMin
                            : item.efficiencyRatioPct;

                        const primaryY = yScale(primaryValue);
                        const primaryHeight = Math.max(3, INNER_HEIGHT - primaryY);
                        const mainBarWidth = Math.min(44, Math.max(20, bandWidth * 0.56));
                        const groupOffsetX = Math.max(0, (bandWidth - mainBarWidth) / 2);

                        const valueLabel =
                          metricMode === 'duration'
                            ? `${primaryValue.toFixed(1)}d`
                            : `%${primaryValue}`;
                        const labelY = Math.max(12, primaryY - 8);

                        return (
                          <g
                            key={item.id}
                            data-testid={`throughput-bar-${item.id}`}
                            role="button"
                            tabIndex={0}
                            aria-label={`${item.sceneLabel}: ${
                              item.actualMin !== null
                                ? `${item.actualMin.toFixed(1)} dakika gerçekleşen`
                                : `${item.estimatedMin.toFixed(1)} dakika tahmini`
                            }, ${meta.label}`}
                            onClick={() => setSelectedJobId(item.id)}
                            onMouseEnter={() => setSelectedJobId(item.id)}
                            onFocus={() => setSelectedJobId(item.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSelectedJobId(item.id);
                              }
                            }}
                            className="cursor-pointer focus:outline-none"
                          >
                            <rect
                              x={x + groupOffsetX}
                              y={primaryY}
                              width={mainBarWidth}
                              height={primaryHeight}
                              rx={6}
                              fill={meta.barFill}
                              opacity={isActive ? 1 : 0.82}
                            />

                            <text
                              x={x + bandWidth / 2}
                              y={labelY}
                              textAnchor="middle"
                              fill={isActive ? '#F5F5F7' : '#A1A1AA'}
                              fontSize={11}
                              fontWeight={600}
                              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                            >
                              {valueLabel}
                            </text>

                            <text
                              x={x + bandWidth / 2}
                              y={INNER_HEIGHT + 18}
                              textAnchor="middle"
                              fill={isActive ? '#F5F5F7' : '#A1A1AA'}
                              fontSize={11}
                              fontWeight={isActive ? 600 : 400}
                            >
                              {item.shortLabel}
                            </text>
                          </g>
                        );
                      })}

                      {/* Target Threshold Line */}
                      <g
                        data-testid="a100-target-line"
                        transform={`translate(0,${targetY})`}
                        className="pointer-events-none"
                      >
                        <line
                          x1={0}
                          x2={INNER_WIDTH + 6}
                          y1={0}
                          y2={0}
                          stroke="#0A84FF"
                          strokeWidth={1.5}
                          strokeDasharray="5 4"
                        />
                        <text
                          x={INNER_WIDTH + 10}
                          y={0}
                          dy="0.34em"
                          textAnchor="start"
                          fill="#409CFF"
                          fontSize={10}
                          fontWeight={600}
                          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                        >
                          {metricMode === 'duration'
                            ? `${targetValue.toFixed(1)} dk`
                            : '%100'}
                        </text>
                      </g>
                    </g>
                  </svg>
                </div>
              </div>

              {/* Right: Clean Scene List */}
              <div className="border-t border-white/[0.07] p-4 lg:col-span-5 lg:border-l lg:border-t-0 flex flex-col justify-between gap-3">
                <div className="space-y-1.5">
                  {report.items.map((item) => {
                    const isActive = activeDatum?.id === item.id;
                    const meta = COMPLIANCE_META[item.complianceState];
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => setSelectedJobId(item.id)}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left transition-colors ${
                          isActive
                            ? 'bg-white/[0.08]'
                            : 'hover:bg-white/[0.04]'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-[#F5F5F7]">
                            {item.sceneLabel}
                          </div>
                          <div className="mt-0.5 text-[11px] text-zinc-400">
                            {JOB_STATUS_TEXT[item.status]} ·{' '}
                            <span className={meta.textClass}>{meta.label}</span>
                          </div>
                        </div>

                        <div className="text-right font-mono text-xs font-semibold text-[#F5F5F7] tabular-nums shrink-0">
                          {item.actualMin !== null
                            ? `${item.actualMin.toFixed(1)} dk`
                            : `~${item.estimatedMin.toFixed(1)} dk`}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {activeDatum && (
                  <div className="flex items-center justify-between gap-2 border-t border-white/[0.07] pt-3 text-xs">
                    <span className="truncate text-zinc-400">
                      Seçili: <strong className="text-[#F5F5F7]">{activeDatum.projectName}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenProject(activeDatum.projectId)}
                      className="font-medium text-[#0A84FF] hover:text-[#409CFF] whitespace-nowrap shrink-0"
                    >
                      Stüdyoda Aç →
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
