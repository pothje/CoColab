import { RotateCcw, SlidersHorizontal, Zap } from 'lucide-react';
import { AutomationConfig, WorkspaceTab } from '../types/automation';
import {
  DEFAULT_COMFY_STARTUP_FLAGS,
  getComfyVramMode,
  hasComfyFlag,
  setComfyVramMode,
  toggleComfyFlag,
  type ComfyVramFlagMode,
} from '../utils/comfyConfig';

interface ComfyUiConfigPanelProps {
  config: AutomationConfig;
  onUpdateConfig: (next: AutomationConfig) => void;
  onNavigate: (tab: WorkspaceTab) => void;
}

const VRAM_MODE_OPTIONS: { id: ComfyVramFlagMode; label: string }[] = [
  { id: 'highvram', label: '--highvram' },
  { id: 'normalvram', label: '--normalvram' },
  { id: 'lowvram', label: '--lowvram' },
  { id: 'auto', label: 'Otomatik' },
];

export function ComfyUiConfigPanel({
  config,
  onUpdateConfig,
  onNavigate,
}: ComfyUiConfigPanelProps) {
  const { comfyui } = config;
  const vramMode = getComfyVramMode(comfyui.headlessFlags);
  const hasHighVram = hasComfyFlag(comfyui.headlessFlags, '--highvram');
  const hasPreviewNone = hasComfyFlag(comfyui.headlessFlags, '--preview-method none');
  const hasFastFlag = hasComfyFlag(comfyui.headlessFlags, '--fast');

  function updateComfy(patch: Partial<AutomationConfig['comfyui']>) {
    onUpdateConfig({
      ...config,
      comfyui: {
        ...comfyui,
        ...patch,
      },
    });
  }

  return (
    <section
      aria-labelledby="workbench-comfy-config-heading"
      className="rounded-xl border border-slate-200 bg-white p-4 space-y-3.5"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5 text-blue-600 shrink-0" aria-hidden="true" />
            <h2
              id="workbench-comfy-config-heading"
              className="text-xs font-bold text-slate-900"
            >
              ComfyUI Yapılandırması
            </h2>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">
            ComfyUI Configuration · .ipynb defter koduna otomatik yansır
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            updateComfy({
              headlessFlags: DEFAULT_COMFY_STARTUP_FLAGS,
            })
          }
          title="Başlatma bayraklarını varsayılana sıfırla"
          aria-label="Başlatma bayraklarını sıfırla"
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 shrink-0"
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          <span>Sıfırla</span>
        </button>
      </div>

      {/* High-Performance Toggles: TeaCache & 8-Step Turbo LoRA */}
      <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-slate-50">
        <label className="flex items-start justify-between gap-3 p-3 text-xs cursor-pointer">
          <span>
            <span className="flex items-center gap-1.5 font-semibold text-slate-900">
              <Zap className="h-3 w-3 text-amber-500 shrink-0" aria-hidden="true" />
              <span>TeaCache</span>
            </span>
            <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
              Difüzyon adımlarını önbellekleyerek render süresini kısaltır.
            </span>
          </span>
          <input
            type="checkbox"
            aria-label="TeaCache"
            checked={comfyui.enableTeaCache}
            onChange={(e) => updateComfy({ enableTeaCache: e.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-600 shrink-0"
          />
        </label>

        <div className="p-3 space-y-2.5">
          <label className="flex items-start justify-between gap-3 text-xs cursor-pointer">
            <span>
              <strong className="text-slate-900">8-Step Turbo LoRA</strong>
              <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                25 adım yerine {comfyui.turboSteps} adımlı hızlı LoRA çıkarımı enjekte eder.
              </span>
            </span>
            <input
              type="checkbox"
              aria-label="8-Step Turbo LoRA"
              checked={comfyui.enableTurboLora}
              onChange={(e) => updateComfy({ enableTurboLora: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-600 shrink-0"
            />
          </label>

          {comfyui.enableTurboLora && (
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div>
                <label
                  htmlFor="wb-turbo-steps"
                  className="block text-[10px] font-semibold text-slate-500"
                >
                  Adım
                </label>
                <input
                  id="wb-turbo-steps"
                  type="number"
                  min={1}
                  max={50}
                  value={comfyui.turboSteps}
                  onChange={(e) => {
                    const nextVal = Number(e.target.value);
                    updateComfy({
                      turboSteps:
                        Number.isFinite(nextVal) && nextVal >= 1 ? Math.min(50, nextVal) : 8,
                    });
                  }}
                  className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-[11px] text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="col-span-2">
                <label
                  htmlFor="wb-turbo-lora-file"
                  className="block text-[10px] font-semibold text-slate-500"
                >
                  LoRA Dosyası
                </label>
                <input
                  id="wb-turbo-lora-file"
                  type="text"
                  value={comfyui.turboLoraFile}
                  onChange={(e) => updateComfy({ turboLoraFile: e.target.value })}
                  className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-[11px] text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* --highvram & Startup Flags Management */}
      <div className="space-y-2.5 border-t border-slate-100 pt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold text-slate-800">
            VRAM &amp; Başlatma Bayrakları
          </span>
          <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              aria-label="--highvram bayrağını etkinleştir"
              checked={hasHighVram}
              onChange={(e) =>
                updateComfy({
                  headlessFlags: e.target.checked
                    ? setComfyVramMode(comfyui.headlessFlags, 'highvram')
                    : toggleComfyFlag(comfyui.headlessFlags, '--highvram', false),
                })
              }
              className="h-3.5 w-3.5 rounded border-slate-300 accent-blue-600"
            />
            <span className="font-mono">--highvram</span>
          </label>
        </div>

        {/* VRAM Mode Segmented Selector */}
        <div
          role="group"
          aria-label="ComfyUI VRAM başlatma modu"
          className="grid grid-cols-2 gap-1.5"
        >
          {VRAM_MODE_OPTIONS.map((opt) => {
            const active = vramMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  updateComfy({
                    headlessFlags: setComfyVramMode(comfyui.headlessFlags, opt.id),
                  })
                }
                className={`rounded-md border px-2 py-1.5 font-mono text-[11px] transition-colors ${
                  active
                    ? 'border-slate-900 bg-slate-900 font-semibold text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Extra Startup Flag Quick Toggles */}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            aria-pressed={hasPreviewNone}
            onClick={() =>
              updateComfy({
                headlessFlags: toggleComfyFlag(
                  comfyui.headlessFlags,
                  '--preview-method none'
                ),
              })
            }
            className={`rounded-md border px-2 py-1 font-mono text-[10px] text-left truncate transition-colors ${
              hasPreviewNone
                ? 'border-blue-600 bg-blue-50 font-semibold text-blue-800'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            --preview-method none
          </button>

          <button
            type="button"
            aria-pressed={hasFastFlag}
            onClick={() =>
              updateComfy({
                headlessFlags: toggleComfyFlag(comfyui.headlessFlags, '--fast'),
              })
            }
            className={`rounded-md border px-2 py-1 font-mono text-[10px] text-left truncate transition-colors ${
              hasFastFlag
                ? 'border-blue-600 bg-blue-50 font-semibold text-blue-800'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            --fast
          </button>
        </div>

        {/* Editable Startup Flags String */}
        <div className="space-y-1">
          <label
            htmlFor="wb-comfy-startup-flags"
            className="block text-[11px] font-medium text-slate-600"
          >
            Başlatma Bayrakları (Startup Flags)
          </label>
          <input
            id="wb-comfy-startup-flags"
            type="text"
            value={comfyui.headlessFlags}
            onChange={(e) => updateComfy({ headlessFlags: e.target.value })}
            placeholder="--listen 127.0.0.1 --port 8188 --highvram --preview-method none"
            className="w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 font-mono text-[11px] text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      {/* Live Sync Footer */}
      <div className="border-t border-slate-100 pt-2.5 flex items-center justify-between gap-2 text-[11px] text-slate-500">
        <span className="truncate font-mono text-[10px] text-slate-600">
          TeaCache:{comfyui.enableTeaCache ? '1' : '0'} · Turbo:{comfyui.enableTurboLora ? comfyui.turboSteps : '0'}
        </span>
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('models')}
            className="font-semibold text-slate-700 hover:text-slate-900 whitespace-nowrap"
          >
            Modeller
          </button>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <button
            type="button"
            onClick={() => onNavigate('colab')}
            className="font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap"
          >
            Defteri İncele →
          </button>
        </div>
      </div>
    </section>
  );
}
