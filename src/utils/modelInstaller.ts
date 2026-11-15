import {
  AutomationConfig,
  ComfyModelId,
  ModelStorageTarget,
  ModelVariantId,
} from '../types/automation';

export interface ComfyModelComponentFile {
  id: string;
  role: 'diffusion' | 'text_encoder' | 'video_vae' | 'audio_vae' | 'lora' | 'checkpoint';
  label: string;
  relativeComfyPath: string;
  sizeGb: number;
}

export interface ComfyModelVariantSpec {
  id: ModelVariantId;
  label: string;
  quantSummary: string;
  minVramGb: number;
  diskRequiredGb: number;
  estimatedDownloadMinNvme: number;
  estimatedDownloadMinDrive: number;
  totalSizeGb: number;
  diffusionModelPath: string;
  textEncoderPath: string;
  videoVaePath: string;
  audioVaePath: string;
  turboLoraPath?: string;
  files: ComfyModelComponentFile[];
}

export interface ComfyModelCatalogEntry {
  id: ComfyModelId;
  name: string;
  repoId: string;
  architecture: string;
  summary: string;
  recommendedGpu: string;
  customNodes: { folder: string; repoUrl: string }[];
  variants: Record<ModelVariantId, ComfyModelVariantSpec>;
}

export const COMFY_MODEL_CATALOG: ComfyModelCatalogEntry[] = [
  {
    id: 'minimax-h3',
    name: 'MiniMax-H3',
    repoId: 'Comfy-Org/MiniMax-H3',
    architecture: 'FL2VA Video Diffusion + Qwen3-VL 32B',
    summary:
      'Görsel, metin ve 3D kamera referanslarını birleştiren yüksek tutarlılıklı video + ses üretim modeli.',
    recommendedGpu: 'A100 40GB / 80GB',
    customNodes: [
      {
        folder: 'ComfyUI-VideoHelperSuite',
        repoUrl: 'https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git',
      },
      {
        folder: 'ComfyUI-KJNodes',
        repoUrl: 'https://github.com/kijai/ComfyUI-KJNodes.git',
      },
    ],
    variants: {
      balanced_40gb: {
        id: 'balanced_40gb',
        label: 'A100 40GB (INT8 + NVFP4)',
        quantSummary: 'pruned_int8 + nvfp4_awq_qwen3vl (ComfyUI Offload)',
        minVramGb: 38,
        diskRequiredGb: 65,
        estimatedDownloadMinNvme: 2,
        estimatedDownloadMinDrive: 5,
        totalSizeGb: 39.4,
        diffusionModelPath: 'diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors',
        textEncoderPath: 'text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
        videoVaePath: 'vae/minimax_h3_video_vae_int8_convrot.safetensors',
        audioVaePath: 'vae/minimax_h3_audio_vae_fp32.safetensors',
        turboLoraPath: 'loras/minimax_h3_8step_turbo_lora.safetensors',
        files: [
          {
            id: 'mm-diff-40',
            role: 'diffusion',
            label: 'Diffusion UNet (INT8 ConvRot)',
            relativeComfyPath: 'diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors',
            sizeGb: 21.8,
          },
          {
            id: 'mm-te-40',
            role: 'text_encoder',
            label: 'Qwen3-VL 32B (NVFP4 AWQ)',
            relativeComfyPath: 'text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
            sizeGb: 15.2,
          },
          {
            id: 'mm-vvae-40',
            role: 'video_vae',
            label: 'Video VAE (INT8 ConvRot)',
            relativeComfyPath: 'vae/minimax_h3_video_vae_int8_convrot.safetensors',
            sizeGb: 1.6,
          },
          {
            id: 'mm-avae-40',
            role: 'audio_vae',
            label: 'Audio VAE (FP32)',
            relativeComfyPath: 'vae/minimax_h3_audio_vae_fp32.safetensors',
            sizeGb: 0.8,
          },
        ],
      },
      quality_80gb: {
        id: 'quality_80gb',
        label: 'A100 80GB (INT8 + High-VRAM)',
        quantSummary: 'int8_convrot + bf16_text_encoder (ComfyUI High-VRAM)',
        minVramGb: 75,
        diskRequiredGb: 95,
        estimatedDownloadMinNvme: 3,
        estimatedDownloadMinDrive: 7,
        totalSizeGb: 57.6,
        diffusionModelPath: 'diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors',
        textEncoderPath: 'text_encoders/qwen3vl_32b_minimax_h3_int8_convrot.safetensors',
        videoVaePath: 'vae/minimax_h3_video_vae_int8_convrot.safetensors',
        audioVaePath: 'vae/minimax_h3_audio_vae_fp32.safetensors',
        turboLoraPath: 'loras/minimax_h3_8step_turbo_lora.safetensors',
        files: [
          {
            id: 'mm-diff-80',
            role: 'diffusion',
            label: 'Diffusion UNet (INT8 ConvRot)',
            relativeComfyPath: 'diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors',
            sizeGb: 21.8,
          },
          {
            id: 'mm-te-80',
            role: 'text_encoder',
            label: 'Qwen3-VL 32B (INT8 ConvRot)',
            relativeComfyPath: 'text_encoders/qwen3vl_32b_minimax_h3_int8_convrot.safetensors',
            sizeGb: 33.4,
          },
          {
            id: 'mm-vvae-80',
            role: 'video_vae',
            label: 'Video VAE (INT8 ConvRot)',
            relativeComfyPath: 'vae/minimax_h3_video_vae_int8_convrot.safetensors',
            sizeGb: 1.6,
          },
          {
            id: 'mm-avae-80',
            role: 'audio_vae',
            label: 'Audio VAE (FP32)',
            relativeComfyPath: 'vae/minimax_h3_audio_vae_fp32.safetensors',
            sizeGb: 0.8,
          },
        ],
      },
    },
  },
  {
    id: 'wan-2.2',
    name: 'Wan 2.2',
    repoId: 'Comfy-Org/Wan_2.2_ComfyUI_Repackaged',
    architecture: 'Wan 2.2 MoE 14B (High/Low Noise) + UMT5-XXL',
    summary:
      'Yüksek ve düşük gürültü uzmanlı (MoE) açık ağırlıklı T2V/I2V sinematik video üretim modeli.',
    recommendedGpu: 'A100 40GB / L4 24GB',
    customNodes: [
      {
        folder: 'ComfyUI-VideoHelperSuite',
        repoUrl: 'https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git',
      },
      {
        folder: 'ComfyUI-KJNodes',
        repoUrl: 'https://github.com/kijai/ComfyUI-KJNodes.git',
      },
    ],
    variants: {
      balanced_40gb: {
        id: 'balanced_40gb',
        label: 'FP8 Scaled (40GB / 24GB)',
        quantSummary: 'wan2.2_t2v_14B_fp8_scaled + umt5_xxl_fp8',
        minVramGb: 24,
        diskRequiredGb: 45,
        estimatedDownloadMinNvme: 1.5,
        estimatedDownloadMinDrive: 4,
        totalSizeGb: 35.1,
        diffusionModelPath: 'diffusion_models/wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors',
        textEncoderPath: 'text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors',
        videoVaePath: 'vae/wan2.2_vae.safetensors',
        audioVaePath: 'vae/wan2.2_vae.safetensors',
        files: [
          {
            id: 'wan-high-fp8',
            role: 'diffusion',
            label: 'Wan 2.2 High-Noise 14B (FP8)',
            relativeComfyPath: 'diffusion_models/wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors',
            sizeGb: 14.3,
          },
          {
            id: 'wan-low-fp8',
            role: 'diffusion',
            label: 'Wan 2.2 Low-Noise 14B (FP8)',
            relativeComfyPath: 'diffusion_models/wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors',
            sizeGb: 14.3,
          },
          {
            id: 'wan-te-fp8',
            role: 'text_encoder',
            label: 'UMT5-XXL Encoder (FP8)',
            relativeComfyPath: 'text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors',
            sizeGb: 5.2,
          },
          {
            id: 'wan-vae',
            role: 'video_vae',
            label: 'Wan 2.2 Video VAE',
            relativeComfyPath: 'vae/wan2.2_vae.safetensors',
            sizeGb: 1.3,
          },
        ],
      },
      quality_80gb: {
        id: 'quality_80gb',
        label: 'BF16 Tam Hassasiyet (80GB)',
        quantSummary: 'wan2.2_t2v_14B_bf16 + umt5_xxl_fp16',
        minVramGb: 75,
        diskRequiredGb: 85,
        estimatedDownloadMinNvme: 3,
        estimatedDownloadMinDrive: 8,
        totalSizeGb: 67.1,
        diffusionModelPath: 'diffusion_models/wan2.2_t2v_high_noise_14B_bf16.safetensors',
        textEncoderPath: 'text_encoders/umt5_xxl_fp16.safetensors',
        videoVaePath: 'vae/wan2.2_vae.safetensors',
        audioVaePath: 'vae/wan2.2_vae.safetensors',
        files: [
          {
            id: 'wan-high-bf16',
            role: 'diffusion',
            label: 'Wan 2.2 High-Noise 14B (BF16)',
            relativeComfyPath: 'diffusion_models/wan2.2_t2v_high_noise_14B_bf16.safetensors',
            sizeGb: 27.6,
          },
          {
            id: 'wan-low-bf16',
            role: 'diffusion',
            label: 'Wan 2.2 Low-Noise 14B (BF16)',
            relativeComfyPath: 'diffusion_models/wan2.2_t2v_low_noise_14B_bf16.safetensors',
            sizeGb: 27.6,
          },
          {
            id: 'wan-te-fp16',
            role: 'text_encoder',
            label: 'UMT5-XXL Encoder (FP16)',
            relativeComfyPath: 'text_encoders/umt5_xxl_fp16.safetensors',
            sizeGb: 10.6,
          },
          {
            id: 'wan-vae-80',
            role: 'video_vae',
            label: 'Wan 2.2 Video VAE',
            relativeComfyPath: 'vae/wan2.2_vae.safetensors',
            sizeGb: 1.3,
          },
        ],
      },
    },
  },
  {
    id: 'ltx-2.3',
    name: 'LTX 2.3',
    repoId: 'Lightricks/LTX-2.3',
    architecture: 'LTX-Video 2.3 22B DiT + Gemma-3 12B',
    summary:
      'Hızlı 8-adımlı distilled LoRA ve gerçek zamanlıya yakın ses-video senkronu sunan Lightricks mimarisi.',
    recommendedGpu: 'A100 40GB / L4 24GB',
    customNodes: [
      {
        folder: 'ComfyUI-LTXVideo',
        repoUrl: 'https://github.com/Lightricks/ComfyUI-LTXVideo.git',
      },
      {
        folder: 'ComfyUI-VideoHelperSuite',
        repoUrl: 'https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git',
      },
      {
        folder: 'ComfyUI-KJNodes',
        repoUrl: 'https://github.com/kijai/ComfyUI-KJNodes.git',
      },
    ],
    variants: {
      balanced_40gb: {
        id: 'balanced_40gb',
        label: 'FP8 Distilled (24GB / 40GB)',
        quantSummary: 'ltx-2.3-22b-distilled-fp8 + gemma_3_12b_fp8',
        minVramGb: 22,
        diskRequiredGb: 45,
        estimatedDownloadMinNvme: 1.5,
        estimatedDownloadMinDrive: 4,
        totalSizeGb: 36.2,
        diffusionModelPath: 'checkpoints/ltx-2.3-22b-distilled-fp8.safetensors',
        textEncoderPath: 'text_encoders/gemma_3_12B_it_fp8_scaled.safetensors',
        videoVaePath: 'vae/ltx_2.3_video_vae.safetensors',
        audioVaePath: 'vae/ltx_2.3_audio_vae.safetensors',
        turboLoraPath: 'loras/ltx-2.3-22b-distilled-lora-384.safetensors',
        files: [
          {
            id: 'ltx-ckpt-fp8',
            role: 'checkpoint',
            label: 'LTX-2.3 22B Distilled (FP8)',
            relativeComfyPath: 'checkpoints/ltx-2.3-22b-distilled-fp8.safetensors',
            sizeGb: 22.4,
          },
          {
            id: 'ltx-te-fp8',
            role: 'text_encoder',
            label: 'Gemma-3 12B IT (FP8)',
            relativeComfyPath: 'text_encoders/gemma_3_12B_it_fp8_scaled.safetensors',
            sizeGb: 11.8,
          },
          {
            id: 'ltx-vae',
            role: 'video_vae',
            label: 'LTX-2.3 Video VAE',
            relativeComfyPath: 'vae/ltx_2.3_video_vae.safetensors',
            sizeGb: 1.3,
          },
          {
            id: 'ltx-lora',
            role: 'lora',
            label: 'Distilled 8-Step LoRA',
            relativeComfyPath: 'loras/ltx-2.3-22b-distilled-lora-384.safetensors',
            sizeGb: 0.7,
          },
        ],
      },
      quality_80gb: {
        id: 'quality_80gb',
        label: 'Dev BF16 (80GB High-VRAM)',
        quantSummary: 'ltx-2.3-22b-dev + gemma_3_12b_bf16',
        minVramGb: 75,
        diskRequiredGb: 85,
        estimatedDownloadMinNvme: 3,
        estimatedDownloadMinDrive: 7,
        totalSizeGb: 68.4,
        diffusionModelPath: 'checkpoints/ltx-2.3-22b-dev.safetensors',
        textEncoderPath: 'text_encoders/gemma_3_12B_it.safetensors',
        videoVaePath: 'vae/ltx_2.3_video_vae.safetensors',
        audioVaePath: 'vae/ltx_2.3_audio_vae.safetensors',
        turboLoraPath: 'loras/ltx-2.3-22b-distilled-lora-384.safetensors',
        files: [
          {
            id: 'ltx-ckpt-bf16',
            role: 'checkpoint',
            label: 'LTX-2.3 22B Dev (BF16)',
            relativeComfyPath: 'checkpoints/ltx-2.3-22b-dev.safetensors',
            sizeGb: 43.1,
          },
          {
            id: 'ltx-te-bf16',
            role: 'text_encoder',
            label: 'Gemma-3 12B IT (BF16)',
            relativeComfyPath: 'text_encoders/gemma_3_12B_it.safetensors',
            sizeGb: 23.3,
          },
          {
            id: 'ltx-vae-80',
            role: 'video_vae',
            label: 'LTX-2.3 Video VAE',
            relativeComfyPath: 'vae/ltx_2.3_video_vae.safetensors',
            sizeGb: 1.3,
          },
          {
            id: 'ltx-lora-80',
            role: 'lora',
            label: 'Distilled 8-Step LoRA',
            relativeComfyPath: 'loras/ltx-2.3-22b-distilled-lora-384.safetensors',
            sizeGb: 0.7,
          },
        ],
      },
    },
  },
];

export function getComfyModelSpec(modelId: ComfyModelId): ComfyModelCatalogEntry {
  return COMFY_MODEL_CATALOG.find((m) => m.id === modelId) ?? COMFY_MODEL_CATALOG[0];
}

export function getComfyModelVariant(
  modelId: ComfyModelId,
  variantId?: ModelVariantId
): ComfyModelVariantSpec {
  const model = getComfyModelSpec(modelId);
  return variantId ? model.variants[variantId] : model.variants.balanced_40gb;
}

export interface ResolvedModelStoragePaths {
  comfyRootDir: string;
  nvmeModelsDir: string;
  driveModelsRoot: string;
  driveModelDir: string;
  activeDownloadDir: string;
  target: ModelStorageTarget;
}

export function resolveModelStoragePaths(
  config: AutomationConfig,
  modelId: ComfyModelId,
  target: ModelStorageTarget
): ResolvedModelStoragePaths {
  const comfyRootDir = (config.comfyui.comfyRootDir || '/content/minimax_h3_workspace/ComfyUI').replace(/\/+$/, '');
  const driveFolderName = (config.driveFolderName || 'ColabForge_Projects').replace(/^\/+|\/+$/g, '');
  const nvmeModelsDir = `${comfyRootDir}/models`;
  const driveModelsRoot = `/content/drive/MyDrive/${driveFolderName}/ComfyUI_Models`;
  const driveModelDir = `${driveModelsRoot}/${modelId}`;

  return {
    comfyRootDir,
    nvmeModelsDir,
    driveModelsRoot,
    driveModelDir,
    activeDownloadDir: target === 'drive' ? driveModelDir : nvmeModelsDir,
    target,
  };
}

export function applyModelToAutomationConfig(
  config: AutomationConfig,
  modelId: ComfyModelId,
  variantId: ModelVariantId,
  target: ModelStorageTarget
): AutomationConfig {
  const spec = getComfyModelSpec(modelId);
  const v40 = spec.variants.balanced_40gb;
  const v80 = spec.variants.quality_80gb;
  const activeVariant = spec.variants[variantId];

  return {
    ...config,
    minDiskFreeGb: Math.max(45, activeVariant.diskRequiredGb),
    modelMatrix: {
      ...config.modelMatrix,
      repo80Gb: spec.repoId,
      quant80Gb: v80.quantSummary,
      repo40Gb: spec.repoId,
      quant40Gb: v40.quantSummary,
      allow24GbFallback: activeVariant.minVramGb <= 24 ? true : config.modelMatrix.allow24GbFallback,
      repo24Gb: spec.repoId,
      quant24Gb: v40.quantSummary,
    },
    comfyui: {
      ...config.comfyui,
      diffusionModel80Gb: v80.diffusionModelPath,
      diffusionModel40Gb: v40.diffusionModelPath,
      textEncoder80Gb: v80.textEncoderPath,
      textEncoder40Gb: v40.textEncoderPath,
      videoVaeFile: activeVariant.videoVaePath,
      audioVaeFile: activeVariant.audioVaePath,
      turboLoraFile: activeVariant.turboLoraPath ?? config.comfyui.turboLoraFile,
    },
    modelInstaller: {
      ...config.modelInstaller,
      selectedModelId: modelId,
      installTarget: target,
      selectedVariants: {
        ...config.modelInstaller.selectedVariants,
        [modelId]: variantId,
      },
    },
  };
}

export interface ModelScriptOptions {
  useUv?: boolean;
  useHfTransfer?: boolean;
  installNodes?: boolean;
  createSymlinks?: boolean;
}

export function generateAcceleratedModelPythonScript(
  modelId: ComfyModelId,
  variantId: ModelVariantId,
  target: ModelStorageTarget,
  config: AutomationConfig,
  options: ModelScriptOptions = {}
): string {
  const model = getComfyModelSpec(modelId);
  const variant = getComfyModelVariant(modelId, variantId);
  const paths = resolveModelStoragePaths(config, modelId, target);
  const useUv = options.useUv ?? config.modelInstaller.useUvAcceleration;
  const useHfTransfer = options.useHfTransfer ?? config.enableHfTransfer;
  const installNodes = options.installNodes ?? config.modelInstaller.installRecommendedNodes;
  const createSymlinks = options.createSymlinks ?? config.modelInstaller.createDriveSymlinks;

  const targetFilesList = variant.files.map((f) => f.relativeComfyPath);
  const nodeReposList = model.customNodes.map((n) => [n.folder, n.repoUrl]);

  return `"""
install_${model.id.replace(/[^a-z0-9_]/gi, '_')}_comfyui.py
ColabForge ComfyUI Model Yükleyici — ${model.name} (${variant.label})
Hedef Depolama: ${target === 'drive' ? 'Google Drive Kalıcı Önbellek + Symlink' : 'Oturum NVMe Diski (/content)'}
Hızlandırma: uv=${useUv ? 'True' : 'False'}, HF_HUB_ENABLE_HF_TRANSFER=${useHfTransfer ? '1' : '0'}
"""
import importlib.util
import os
import shutil
import subprocess
from pathlib import Path

MODEL_ID = ${JSON.stringify(model.id)}
REPO_ID = ${JSON.stringify(model.repoId)}
INSTALL_TARGET = ${JSON.stringify(target)}
COMFY_ROOT = Path(${JSON.stringify(paths.comfyRootDir)})
NVME_MODELS_DIR = Path(${JSON.stringify(paths.nvmeModelsDir)})
DRIVE_MODEL_DIR = Path(${JSON.stringify(paths.driveModelDir)})
USE_UV = ${useUv ? 'True' : 'False'}
ENABLE_HF_TRANSFER = ${useHfTransfer ? 'True' : 'False'}
INSTALL_NODES = ${installNodes ? 'True' : 'False'}
CREATE_DRIVE_SYMLINKS = ${createSymlinks ? 'True' : 'False'}

# 1. Hızlandırılmış indirme bayrağını importlardan önce aktif et
os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1" if ENABLE_HF_TRANSFER else "0"

# 2. uv + Torch/NumPy kilidi ile hızlı bağımlılık kurulumu
CONSTRAINTS_PATH = Path("/tmp/constraints.txt")
try:
    import torch, numpy
    CONSTRAINTS_PATH.write_text(
        f"torch=={torch.__version__}\\nnumpy=={numpy.__version__}\\n",
        encoding="utf-8",
    )
except ImportError:
    pass

if USE_UV and shutil.which("uv") is None:
    subprocess.run(["pip", "-q", "install", "-U", "uv"], check=True)


def fast_pip_install(packages: list[str]) -> None:
    cmd = (["uv", "pip", "install", "--system"] if USE_UV else ["pip", "-q", "install"]) + packages
    if CONSTRAINTS_PATH.exists():
        cmd += ["-c", str(CONSTRAINTS_PATH)]
    subprocess.run(cmd, check=True)


pkgs = ['huggingface_hub[hf_transfer]', 'hf_transfer'] if ENABLE_HF_TRANSFER else ['huggingface_hub']
fast_pip_install(pkgs)

import huggingface_hub.constants as hf_constants
from huggingface_hub import hf_hub_download

HF_TRANSFER_ACTIVE = bool(
    ENABLE_HF_TRANSFER and importlib.util.find_spec("hf_transfer") is not None
)
hf_constants.HF_HUB_ENABLE_HF_TRANSFER = HF_TRANSFER_ACTIVE
os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1" if HF_TRANSFER_ACTIVE else "0"

# 3. Hedef depolamayı hazırla (NVMe veya Google Drive)
for sub in ["checkpoints", "diffusion_models", "text_encoders", "vae", "loras"]:
    (NVME_MODELS_DIR / sub).mkdir(parents=True, exist_ok=True)

if INSTALL_TARGET == "drive":
    if not Path("/content/drive/MyDrive").exists():
        from google.colab import drive
        drive.mount("/content/drive")
    DRIVE_MODEL_DIR.mkdir(parents=True, exist_ok=True)
    DOWNLOAD_DIR = DRIVE_MODEL_DIR
else:
    DOWNLOAD_DIR = NVME_MODELS_DIR

if INSTALL_NODES:
    custom_nodes = COMFY_ROOT / "custom_nodes"
    custom_nodes.mkdir(parents=True, exist_ok=True)
    for folder_name, repo_url in ${JSON.stringify(nodeReposList)}:
        node_dir = custom_nodes / folder_name
        if not node_dir.exists():
            subprocess.run(["git", "clone", "--depth=1", repo_url, str(node_dir)], check=True)
            req = node_dir / "requirements.txt"
            if req.exists():
                fast_pip_install(["-r", str(req)])

TARGET_FILES = ${JSON.stringify(targetFilesList, null, 2)}

for rel_path in TARGET_FILES:
    local_file = Path(
        hf_hub_download(
            repo_id=REPO_ID,
            filename=rel_path,
            local_dir=str(DOWNLOAD_DIR),
            token=os.environ.get(${JSON.stringify(config.hfTokenEnvVar)}) or None,
        )
    )
    print(f"[{'hf_transfer' if HF_TRANSFER_ACTIVE else 'http'}] İndirildi -> {local_file}")

    if INSTALL_TARGET == "drive" and CREATE_DRIVE_SYMLINKS:
        symlink_dst = NVME_MODELS_DIR / rel_path
        symlink_dst.parent.mkdir(parents=True, exist_ok=True)
        if symlink_dst.is_symlink() or symlink_dst.exists():
            symlink_dst.unlink()
        symlink_dst.symlink_to(local_file)
        print(f"[Symlink] {symlink_dst} -> {local_file}")

print(f"[Tamamlandı] {MODEL_ID} ({INSTALL_TARGET}) ComfyUI içinde kullanıma hazır.")
`;
}

export function generateAcceleratedModelBashScript(
  modelId: ComfyModelId,
  variantId: ModelVariantId,
  target: ModelStorageTarget,
  config: AutomationConfig,
  options: ModelScriptOptions = {}
): string {
  const model = getComfyModelSpec(modelId);
  const variant = getComfyModelVariant(modelId, variantId);
  const paths = resolveModelStoragePaths(config, modelId, target);
  const useUv = options.useUv ?? config.modelInstaller.useUvAcceleration;
  const useHfTransfer = options.useHfTransfer ?? config.enableHfTransfer;
  const installNodes = options.installNodes ?? config.modelInstaller.installRecommendedNodes;
  const createSymlinks = options.createSymlinks ?? config.modelInstaller.createDriveSymlinks;

  const lines: string[] = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    '',
    `# ColabForge ComfyUI Model Yükleyici — ${model.name} (${variant.label})`,
    `# Hedef: ${target === 'drive' ? 'Google Drive Kalıcı + Symlink' : 'Oturum NVMe Diski (/content)'}`,
    '',
    `export HF_HUB_ENABLE_HF_TRANSFER=${useHfTransfer ? '1' : '0'}`,
    `COMFY_ROOT=${JSON.stringify(paths.comfyRootDir)}`,
    `NVME_MODELS_DIR=${JSON.stringify(paths.nvmeModelsDir)}`,
    `TARGET_DIR=${JSON.stringify(paths.activeDownloadDir)}`,
    '',
    '# 1. uv ile hızlandırılmış bağımlılık & hf_transfer kurulumu',
    useUv
      ? 'command -v uv >/dev/null 2>&1 || pip -q install -U uv\nuv pip install --system -U "huggingface_hub[hf_transfer]" hf_transfer'
      : 'pip -q install -U "huggingface_hub[hf_transfer]" hf_transfer',
    '',
    'mkdir -p "$NVME_MODELS_DIR"/{checkpoints,diffusion_models,text_encoders,vae,loras}',
    'mkdir -p "$TARGET_DIR"',
  ];

  if (installNodes) {
    lines.push('', '# 2. Önerilen ComfyUI özel düğümlerini uv ile kur');
    lines.push('mkdir -p "$COMFY_ROOT/custom_nodes"');
    for (const node of model.customNodes) {
      lines.push(
        `if [ ! -d "$COMFY_ROOT/custom_nodes/${node.folder}" ]; then`,
        `  git clone --depth=1 ${node.repoUrl} "$COMFY_ROOT/custom_nodes/${node.folder}"`,
        useUv
          ? `  [ -f "$COMFY_ROOT/custom_nodes/${node.folder}/requirements.txt" ] && uv pip install --system -r "$COMFY_ROOT/custom_nodes/${node.folder}/requirements.txt"`
          : `  [ -f "$COMFY_ROOT/custom_nodes/${node.folder}/requirements.txt" ] && pip -q install -r "$COMFY_ROOT/custom_nodes/${node.folder}/requirements.txt"`,
        'fi'
      );
    }
  }

  lines.push('', '# 3. Model ağırlıklarını HuggingFace veri merkezinden indir');
  lines.push('HF_CMD=$(command -v hf >/dev/null 2>&1 && echo "hf download" || echo "huggingface-cli download")');
  for (const file of variant.files) {
    lines.push(
      `$HF_CMD ${model.repoId} ${file.relativeComfyPath} --local-dir "$TARGET_DIR"`
    );
    if (target === 'drive' && createSymlinks) {
      lines.push(
        `mkdir -p "$(dirname "$NVME_MODELS_DIR/${file.relativeComfyPath}")"`,
        `ln -sfn "$TARGET_DIR/${file.relativeComfyPath}" "$NVME_MODELS_DIR/${file.relativeComfyPath}"`
      );
    }
  }

  lines.push('', `echo "[Tamamlandı] ${model.name} -> $TARGET_DIR"`);
  return lines.join('\n');
}

export function generateColabModelInstallSnippet(
  modelId: ComfyModelId,
  variantId: ModelVariantId,
  target: ModelStorageTarget,
  config: AutomationConfig,
  options: ModelScriptOptions = {}
): string {
  const useUv = options.useUv ?? config.modelInstaller.useUvAcceleration;
  const useHfTransfer = options.useHfTransfer ?? config.enableHfTransfer;
  const header = [
    `# @title ComfyUI Model Yükleyici (${getComfyModelSpec(modelId).name} · ${target === 'drive' ? 'Google Drive' : 'Oturum NVMe'})`,
    useHfTransfer ? '%env HF_HUB_ENABLE_HF_TRANSFER=1' : '%env HF_HUB_ENABLE_HF_TRANSFER=0',
    useUv
      ? '!pip -q install -U uv && uv pip install --system -U "huggingface_hub[hf_transfer]" hf_transfer'
      : '!pip -q install -U "huggingface_hub[hf_transfer]" hf_transfer',
    '',
  ].join('\n');

  return `${header}${generateAcceleratedModelPythonScript(modelId, variantId, target, config, options)}`;
}
