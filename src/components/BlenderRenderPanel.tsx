import { useMemo, useState } from 'react';
import { ChevronDown, Download } from 'lucide-react';
import {
  AutomationConfig,
  BlenderOutputMode,
  ColabProject,
} from '../types/automation';
import {
  buildBlenderRenderHelperPython,
  DEFAULT_BLENDER_RENDER_CONFIG,
} from '../utils/blenderModule';
import { inspectProjectPipelineReadiness } from '../utils/claudeBundle';

interface BlenderRenderPanelProps {
  project: ColabProject;
  config: AutomationConfig;
  onUpdateConfig: (next: AutomationConfig) => void;
  onDownloadFile?: (filename: string, content: string | Blob, mime: string) => void;
}

const OUTPUT_MODE_OPTIONS: { id: BlenderOutputMode; label: string }[] = [
  { id: 'keyframes_only', label: 'İlk + Son Kare' },
  { id: 'full_animation', label: 'Tam Video (.mp4)' },
  { id: 'clay_depth_pass', label: 'Clay + Depth' },
];

function AppleSwitch({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF] ${
        checked ? 'bg-[#30D158]' : 'bg-white/[0.16]'
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export function BlenderRenderPanel({
  project,
  config,
  onUpdateConfig,
  onDownloadFile,
}: BlenderRenderPanelProps) {
  const [showScript, setShowScript] = useState(false);
  const blender = config.blenderRender ?? DEFAULT_BLENDER_RENDER_CONFIG;
  const readiness = useMemo(
    () => inspectProjectPipelineReadiness(project, blender),
    [project, blender]
  );

  const helperPy = useMemo(
    () =>
      buildBlenderRenderHelperPython(
        blender,
        readiness.deliveryPreset.width,
        readiness.deliveryPreset.height
      ),
    [blender, readiness.deliveryPreset.width, readiness.deliveryPreset.height]
  );

  function updateBlender(patch: Partial<AutomationConfig['blenderRender']>) {
    onUpdateConfig({
      ...config,
      blenderRender: {
        ...blender,
        ...patch,
      },
    });
  }

  return (
    <section
      aria-labelledby="workbench-blender-module-heading"
      data-testid="blender-render-panel"
      className="rounded-2xl border border-white/[0.08] bg-[#141417] p-5 space-y-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="workbench-blender-module-heading"
            className="text-sm font-semibold text-[#F5F5F7]"
          >
            Blender Render Modülü
          </h2>
          <p className="mt-0.5 text-xs text-zinc-400">
            {readiness.blenderStatus === 'pre_rendered'
              ? 'Sahne zaten renderlanmış · Colab adımı atlanır'
              : readiness.requiresColabBlenderRender
                ? `Colab A100 (${blender.device}) üzerinde .blend renderlanacak`
                : 'Ham .blend eklendiğinde otomatik GPU render'}
          </p>
        </div>

        <span
          className={`shrink-0 text-[11px] font-medium ${
            readiness.blenderStatus === 'pre_rendered'
              ? 'text-[#30D158]'
              : readiness.requiresColabBlenderRender
                ? 'text-[#0A84FF]'
                : 'text-zinc-500'
          }`}
        >
          {readiness.blenderStatusLabel}
        </span>
      </div>

      <div className="divide-y divide-white/[0.07] rounded-xl border border-white/[0.07] bg-[#0E0E11]">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div>
            <div className="text-xs font-semibold text-[#F5F5F7]">
              Colab’da Otomatik .blend Render
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-400">
              Renderlanmamış .blend dosyalarını Cycles OptiX ile işler.
            </div>
          </div>
          <AppleSwitch
            ariaLabel="Colab'da Otomatik Blender Render"
            checked={blender.enabled}
            onChange={(next) => updateBlender({ enabled: next })}
          />
        </div>

        {blender.enabled && (
          <>
            <div className="px-4 py-3 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>Blender Çıktı Modu</span>
                <span className="font-mono text-zinc-500 tabular-nums">
                  {readiness.deliveryPreset.width}×{readiness.deliveryPreset.height}
                </span>
              </div>
              <div
                role="group"
                aria-label="Blender çıktı modu"
                className="grid grid-cols-3 gap-1.5"
              >
                {OUTPUT_MODE_OPTIONS.map((opt) => {
                  const active = blender.outputMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => updateBlender({ outputMode: opt.id })}
                      className={`rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-[#0A84FF] text-white'
                          : 'bg-white/[0.05] text-zinc-300 hover:bg-white/[0.1]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5 px-4 py-3">
              <div>
                <label
                  htmlFor="blender-engine-select"
                  className="block text-[11px] text-zinc-400"
                >
                  Motor
                </label>
                <select
                  id="blender-engine-select"
                  value={blender.engine}
                  onChange={(e) =>
                    updateBlender({
                      engine: e.target.value as AutomationConfig['blenderRender']['engine'],
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#18181C] px-2 py-1.5 text-[11px] text-[#F5F5F7] focus:border-[#0A84FF] focus:outline-none"
                >
                  <option value="CYCLES">Cycles ({blender.device})</option>
                  <option value="BLENDER_EEVEE_NEXT">EEVEE Next</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="blender-samples-input"
                  className="block text-[11px] text-zinc-400"
                >
                  Samples
                </label>
                <input
                  id="blender-samples-input"
                  type="number"
                  min={8}
                  max={512}
                  step={8}
                  value={blender.samples}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    updateBlender({
                      samples: Number.isFinite(v) && v >= 8 ? Math.min(512, v) : 64,
                    });
                  }}
                  className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#18181C] px-2.5 py-1.5 text-[11px] text-[#F5F5F7] tabular-nums focus:border-[#0A84FF] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="blender-frames-end"
                  className="block text-[11px] text-zinc-400"
                >
                  Son Kare
                </label>
                <input
                  id="blender-frames-end"
                  type="number"
                  min={2}
                  max={480}
                  value={blender.frameEnd}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    updateBlender({
                      frameEnd: Number.isFinite(v) && v >= 2 ? Math.min(480, v) : 121,
                    });
                  }}
                  className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#18181C] px-2.5 py-1.5 text-[11px] text-[#F5F5F7] tabular-nums focus:border-[#0A84FF] focus:outline-none"
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Collapsible Python Script Preview */}
      <div className="rounded-xl border border-white/[0.07] bg-[#0E0E11]">
        <div className="flex items-center justify-between px-4 py-2.5">
          <button
            type="button"
            aria-expanded={showScript}
            onClick={() => setShowScript((v) => !v)}
            className="flex items-center gap-2 text-xs font-medium text-zinc-300 hover:text-[#F5F5F7]"
          >
            <ChevronDown
              className={`h-3.5 w-3.5 text-zinc-400 transition-transform ${
                showScript ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
            <span>Colab Blender Betiği (blender_render_helper.py)</span>
          </button>

          {onDownloadFile && (
            <button
              type="button"
              onClick={() =>
                onDownloadFile('blender_render_helper.py', helperPy, 'text/x-python')
              }
              aria-label="blender_render_helper.py indir"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0A84FF] hover:text-[#409CFF]"
            >
              <Download className="h-3 w-3" aria-hidden="true" />
              <span>İndir</span>
            </button>
          )}
        </div>

        {showScript && (
          <pre className="max-h-56 overflow-auto border-t border-white/[0.07] p-3.5 font-mono text-[11px] leading-relaxed text-zinc-300">
            {helperPy}
          </pre>
        )}
      </div>
    </section>
  );
}
