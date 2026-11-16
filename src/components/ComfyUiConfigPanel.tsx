import { useState } from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';
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
  { id: 'highvram', label: 'High VRAM' },
  { id: 'normalvram', label: 'Normal' },
  { id: 'lowvram', label: 'Low VRAM' },
  { id: 'auto', label: 'Otomatik' },
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

export function ComfyUiConfigPanel({
  config,
  onUpdateConfig,
  onNavigate,
}: ComfyUiConfigPanelProps) {
  const [showFlags, setShowFlags] = useState(false);
  const { comfyui } = config;
  const vramMode = getComfyVramMode(comfyui.headlessFlags);
  const hasHighVram = hasComfyFlag(comfyui.headlessFlags, '--highvram');

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
      className="rounded-2xl border border-white/[0.08] bg-[#141417] p-5 space-y-4"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2
            id="workbench-comfy-config-heading"
            className="text-sm font-semibold text-[#F5F5F7]"
          >
            Video Motoru Ayarları
          </h2>
          <p className="mt-0.5 text-xs text-zinc-400">
            ComfyUI Configuration · Deftere otomatik kaydedilir
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('models')}
          className="text-xs font-medium text-[#0A84FF] hover:text-[#409CFF] whitespace-nowrap"
        >
          Modeller →
        </button>
      </div>

      {/* Apple System Settings Toggle List */}
      <div className="divide-y divide-white/[0.07] rounded-xl border border-white/[0.07] bg-[#0E0E11]">
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div>
            <div className="text-xs font-semibold text-[#F5F5F7]">TeaCache</div>
            <div className="mt-0.5 text-[11px] text-zinc-400">
              Difüzyon adımlarını önbellekleyerek renderı hızlandırır.
            </div>
          </div>
          <AppleSwitch
            ariaLabel="TeaCache"
            checked={comfyui.enableTeaCache}
            onChange={(next) => updateComfy({ enableTeaCache: next })}
          />
        </div>

        <div className="px-4 py-3.5 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-[#F5F5F7]">
                8-Step Turbo LoRA
              </div>
              <div className="mt-0.5 text-[11px] text-zinc-400">
                {comfyui.turboSteps} adımlı hızlı çıkarım modunu açar.
              </div>
            </div>
            <AppleSwitch
              ariaLabel="8-Step Turbo LoRA"
              checked={comfyui.enableTurboLora}
              onChange={(next) => updateComfy({ enableTurboLora: next })}
            />
          </div>

          {comfyui.enableTurboLora && (
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              <div>
                <label
                  htmlFor="wb-turbo-steps"
                  className="block text-[11px] text-zinc-400"
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
                  className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#18181C] px-2.5 py-1.5 text-xs text-[#F5F5F7] tabular-nums focus:border-[#0A84FF] focus:outline-none"
                />
              </div>
              <div className="col-span-2">
                <label
                  htmlFor="wb-turbo-lora-file"
                  className="block text-[11px] text-zinc-400"
                >
                  LoRA Dosyası
                </label>
                <input
                  id="wb-turbo-lora-file"
                  type="text"
                  value={comfyui.turboLoraFile}
                  onChange={(e) => updateComfy({ turboLoraFile: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#18181C] px-2.5 py-1.5 font-mono text-[11px] text-[#F5F5F7] focus:border-[#0A84FF] focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div>
            <div className="text-xs font-semibold text-[#F5F5F7]">
              Yüksek Bellek Modu (--highvram)
            </div>
            <div className="mt-0.5 text-[11px] text-zinc-400">
              Model ağırlıklarını A100 VRAM içinde tutarak gecikmeyi önler.
            </div>
          </div>
          <AppleSwitch
            ariaLabel="--highvram bayrağını etkinleştir"
            checked={hasHighVram}
            onChange={(next) =>
              updateComfy({
                headlessFlags: next
                  ? setComfyVramMode(comfyui.headlessFlags, 'highvram')
                  : toggleComfyFlag(comfyui.headlessFlags, '--highvram', false),
              })
            }
          />
        </div>
      </div>

      {/* Progressive Disclosure for Advanced Startup Flags */}
      <div className="rounded-xl border border-white/[0.07] bg-[#0E0E11]">
        <button
          type="button"
          aria-expanded={showFlags}
          onClick={() => setShowFlags((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-2.5 text-left text-xs font-medium text-zinc-300 hover:text-[#F5F5F7]"
        >
          <span>Başlatma Bayrakları</span>
          <ChevronDown
            className={`h-3.5 w-3.5 text-zinc-400 transition-transform ${
              showFlags ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </button>

        {showFlags && (
          <div className="border-t border-white/[0.07] p-3.5 space-y-3">
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
                    className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
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

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="wb-comfy-startup-flags"
                  className="text-[11px] text-zinc-400"
                >
                  Komut Satırı Bayrakları
                </label>
                <button
                  type="button"
                  onClick={() =>
                    updateComfy({ headlessFlags: DEFAULT_COMFY_STARTUP_FLAGS })
                  }
                  className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-[#F5F5F7]"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  <span>Sıfırla</span>
                </button>
              </div>
              <input
                id="wb-comfy-startup-flags"
                type="text"
                value={comfyui.headlessFlags}
                onChange={(e) => updateComfy({ headlessFlags: e.target.value })}
                className="w-full rounded-lg border border-white/[0.1] bg-[#18181C] px-3 py-1.5 font-mono text-[11px] text-[#F5F5F7] focus:border-[#0A84FF] focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
