import { useEffect, useState } from 'react';
import { ArrowRight, Check, X } from 'lucide-react';
import { ColabProject } from '../types/automation';
import type { ProjectDetailUpdateInput } from '../utils/projectProgress';

interface ProjectEditModalProps {
  project: ColabProject | null;
  onClose: () => void;
  onSave: (projectId: string, updates: ProjectDetailUpdateInput) => void;
  onOpenInStudio: (projectId: string) => void;
}

export function ProjectEditModal({
  project,
  onClose,
  onSave,
  onOpenInStudio,
}: ProjectEditModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetGpuPolicy, setTargetGpuPolicy] =
    useState<ColabProject['targetGpuPolicy']>('80GB_OR_40GB');
  const [masterPromptText, setMasterPromptText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!project) return;
    setName(project.name);
    setDescription(project.description);
    setTargetGpuPolicy(project.targetGpuPolicy);
    const promptAsset =
      project.assets.find(
        (asset) => asset.kind === 'prompts' && asset.name === 'master_prompt.txt'
      ) ?? project.assets.find((asset) => asset.kind === 'prompts');
    setMasterPromptText(promptAsset?.previewText ?? '');
    setError(null);
  }, [project]);

  useEffect(() => {
    if (!project) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [project, onClose]);

  if (!project) return null;

  const hasPromptAsset = project.assets.some((asset) => asset.kind === 'prompts');

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!project) return;
    if (!name.trim()) {
      setError('Proje adı boş bırakılamaz.');
      return;
    }
    onSave(project.id, {
      name: name.trim(),
      description: description.trim(),
      targetGpuPolicy,
      masterPromptText: hasPromptAsset ? masterPromptText : undefined,
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-project-modal-title"
        className="w-full max-w-xl overflow-hidden rounded-lg border border-[#2D3444] bg-[#13161D] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#252A36] px-6 py-4">
          <div className="min-w-0">
            <h2
              id="edit-project-modal-title"
              className="truncate text-base font-bold tracking-tight text-slate-100"
            >
              Detayları Düzenle
            </h2>
            <p className="mt-0.5 truncate text-xs text-slate-400">
              {project.name} · Son güncelleme {project.updatedAt}
            </p>
          </div>
          <button
            type="button"
            aria-label="Düzenleme penceresini kapat"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-[#1E2432] hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div className="space-y-1.5">
            <label
              htmlFor="edit-project-name"
              className="block text-xs font-semibold text-slate-300"
            >
              Proje Adı
            </label>
            <input
              id="edit-project-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Örn: Mimari İç Mekan Graybox"
              className="w-full rounded-md border border-[#2D3444] bg-[#0B0D11] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
            {error && <p className="text-xs font-medium text-rose-400">{error}</p>}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="edit-project-desc"
              className="block text-xs font-semibold text-slate-300"
            >
              Sahne Açıklaması
            </label>
            <textarea
              id="edit-project-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Kamera hareketi, ışık atmosferi ve teslim hedefini özetleyin"
              className="w-full resize-none rounded-md border border-[#2D3444] bg-[#0B0D11] px-3 py-2 text-xs leading-relaxed text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="edit-project-gpu"
              className="block text-xs font-semibold text-slate-300"
            >
              Hedef GPU Politikası
            </label>
            <select
              id="edit-project-gpu"
              value={targetGpuPolicy}
              onChange={(e) =>
                setTargetGpuPolicy(e.target.value as ColabProject['targetGpuPolicy'])
              }
              className="w-full rounded-md border border-[#2D3444] bg-[#0B0D11] px-3 py-2 text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
            >
              <option value="80GB_OR_40GB">
                A100 80GB / 40GB (Önerilen Esnek Seçim)
              </option>
              <option value="80GB_ONLY">
                Yalnızca A100 80GB (Tam BF16 Hassasiyet)
              </option>
            </select>
          </div>

          {hasPromptAsset && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="edit-project-prompt"
                  className="block text-xs font-semibold text-slate-300"
                >
                  Ana Sahne Tarifi (master_prompt.txt)
                </label>
                <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                  {masterPromptText.length} karakter
                </span>
              </div>
              <textarea
                id="edit-project-prompt"
                rows={4}
                value={masterPromptText}
                onChange={(e) => setMasterPromptText(e.target.value)}
                placeholder="Sahne hareketi, kamera açısı ve malzeme tarifini yazın..."
                className="w-full rounded-md border border-[#2D3444] bg-[#0B0D11] px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#252A36] pt-4">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenInStudio(project.id);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300"
            >
              <span>Stüdyoda Düzenle</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-[#2D3444] bg-[#181C26] px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-[#1E2432]"
              >
                İptal
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Değişiklikleri Kaydet</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
