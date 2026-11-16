import {
  AuditFinding,
  AutomationConfig,
  BatchQueueItem,
  ColabProject,
  ProjectAssetFile,
} from '../types/automation';
import {
  buildBlenderColabStagePython,
  DEFAULT_BLENDER_RENDER_CONFIG,
} from './blenderModule';
import { getDeliveryPreset, resolveAssetMediaRole } from './claudeBundle';

function splitLinesForNotebook(source: string): string[] {
  const lines = source.split('\n');
  return lines.map((line, index) => (index < lines.length - 1 ? `${line}\n` : line));
}

export function generateManifestJson(
  config: AutomationConfig,
  assets: ProjectAssetFile[]
): string {
  const activeAssets = assets.filter((a) => a.included);
  const manifest = {
    schema_version: '2.3',
    engine: 'ComfyUI',
    workspace_root: config.workspaceRoot,
    comfyui: config.comfyui,
    blender_render: config.blenderRender ?? DEFAULT_BLENDER_RENDER_CONFIG,
    local_output_primary: config.localOutputPrimary,
    auto_sync_outputs_to_drive: config.autoSyncOutputsToDrive,
    drive_backup_dir: config.driveBackupDir,
    require_high_ram: config.requireHighRam,
    min_high_ram_gb: config.minHighRamGb,
    strict_kill_on_mismatch: config.strictKillOnMismatch,
    enable_hf_transfer: config.enableHfTransfer,
    model_installer: config.modelInstaller ?? null,
    model_matrix: config.modelMatrix,
    counts: {
      total_files: activeAssets.length,
      schema: activeAssets.filter((a) => a.kind === 'schema').length,
      prompts: activeAssets.filter((a) => a.kind === 'prompts').length,
      settings: activeAssets.filter((a) => a.kind === 'settings').length,
      comfyui_workflow: activeAssets.filter((a) => a.kind === 'comfyui_workflow').length,
      reference_media: activeAssets.filter((a) => a.kind === 'reference_media').length,
      blender_graybox: activeAssets.filter((a) => a.kind === 'blender_graybox').length,
      blender_scene: activeAssets.filter((a) => resolveAssetMediaRole(a) === 'blender_scene').length,
      first_frame: activeAssets.filter((a) => resolveAssetMediaRole(a) === 'first_frame').length,
      last_frame: activeAssets.filter((a) => resolveAssetMediaRole(a) === 'last_frame').length,
    },
    files: activeAssets.map((a) => ({
      name: a.name,
      kind: a.kind,
      media_role: resolveAssetMediaRole(a),
      source_relative_path: a.relativePath,
      colab_target_path: a.targetColabPath,
      size_bytes: a.sizeBytes,
    })),
  };

  return JSON.stringify(manifest, null, 2);
}

export function generateBatchQueueJson(
  queue: BatchQueueItem[],
  projects: ColabProject[],
  config: AutomationConfig
): string {
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const jobs = queue.map((item, idx) => {
    const proj = projectMap.get(item.projectId);
    const activeFiles = (proj?.assets ?? []).filter((a) => a.included);
    const presetSpec = getDeliveryPreset(item.deliveryPreset ?? proj?.deliveryPreset);
    const hasBlend = activeFiles.some((a) => resolveAssetMediaRole(a) === 'blender_scene');
    const hasPreRendered = activeFiles.some(
      (a) =>
        resolveAssetMediaRole(a) === 'blender_rendered' &&
        /\.(mp4|mov|webm)$/i.test(a.name)
    );
    return {
      order: idx + 1,
      job_id: item.id,
      project_id: item.projectId,
      project_name: item.projectName,
      scene_label: item.sceneLabel,
      status: item.status,
      delivery_preset: presetSpec.id,
      width: presetSpec.width,
      height: presetSpec.height,
      requires_blender_render: item.requiresBlenderRender ?? (hasBlend && !hasPreRendered),
      estimated_render_min: item.estimatedRenderMin,
      local_output_dir: `05_outputs/renders/${item.id}`,
      colab_output_dir: `${config.workspaceRoot}/outputs/${item.projectId}/${item.id}`,
      files: activeFiles.map((a) => ({
        name: a.name,
        kind: a.kind,
        media_role: resolveAssetMediaRole(a),
        source_relative_path: a.relativePath,
        colab_target_path: a.targetColabPath,
      })),
    };
  });

  const schedule = config.batchSchedule;

  return JSON.stringify(
    {
      schema_version: '1.3',
      engine: 'ComfyUI',
      comfyui_port: config.comfyui.comfyPort,
      blender_render: config.blenderRender ?? DEFAULT_BLENDER_RENDER_CONFIG,
      single_setup_minutes_estimate: config.setupMinutesEstimate,
      local_output_primary: config.localOutputPrimary,
      auto_sync_outputs_to_drive: config.autoSyncOutputsToDrive,
      auto_unassign_on_finish: config.autoUnassignOnFinish,
      schedule: schedule
        ? {
            enabled: schedule.enabled,
            mode: schedule.mode,
            scheduled_date: schedule.scheduledDate,
            scheduled_time: schedule.scheduledTime,
            recurrence: schedule.recurrence,
            max_vram_load_pct: schedule.maxVramLoadPct,
            max_ram_load_pct: schedule.maxRamLoadPct,
          }
        : null,
      total_jobs: jobs.length,
      jobs,
    },
    null,
    2
  );
}

export function generatePreflightPython(
  config: AutomationConfig,
  findings: AuditFinding[]
): string {
  const isEnabled = (id: string) =>
    findings.find((f) => f.id === id)?.enabledInExport ?? true;

  const useUnassign = isEnabled('gpu-a100-downgrade');
  const useWebhook = config.webhookNotifyOnFailure;

  return `"""
preflight_guard.py — ComfyUI + MiniMax H3 Colab A100 + High-RAM Donanım Doğrulayıcısı
Colab A100 High-RAM bulamayıp sessizce L4/T4/Standart RAM verirse Compute Unit
israfını önlemek için anında runtime.unassign() çağırır ve canlı telemetri gönderir.
"""
import os
import sys
import json
import shutil
import subprocess
import urllib.request
from dataclasses import dataclass

WORKSPACE_ROOT = ${JSON.stringify(config.workspaceRoot)}
MIN_DISK_FREE_GB = ${config.minDiskFreeGb}
REQUIRE_HIGH_RAM = ${config.requireHighRam ? 'True' : 'False'}
MIN_HIGH_RAM_GB = ${config.minHighRamGb}
STRICT_KILL_ON_MISMATCH = ${config.strictKillOnMismatch ? 'True' : 'False'}
ALLOW_24GB_FALLBACK = ${config.modelMatrix.allow24GbFallback ? 'True' : 'False'}
ENABLE_HF_TRANSFER = ${config.enableHfTransfer ? 'True' : 'False'}
HF_TOKEN_ENV = ${JSON.stringify(config.hfTokenEnvVar)}

if ENABLE_HF_TRANSFER:
    os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"


MODEL_MATRIX = {
    "80GB": {
        "repo_id": ${JSON.stringify(config.modelMatrix.repo80Gb)},
        "quant": ${JSON.stringify(config.modelMatrix.quant80Gb)},
        "min_disk_gb": max(MIN_DISK_FREE_GB, 110),
    },
    "40GB": {
        "repo_id": ${JSON.stringify(config.modelMatrix.repo40Gb)},
        "quant": ${JSON.stringify(config.modelMatrix.quant40Gb)},
        "min_disk_gb": MIN_DISK_FREE_GB,
    },
    "24GB": {
        "repo_id": ${JSON.stringify(config.modelMatrix.repo24Gb)},
        "quant": ${JSON.stringify(config.modelMatrix.quant24Gb)},
        "min_disk_gb": 45,
    },
}


@dataclass
class GpuInfo:
    name: str
    vram_gb: float
    driver: str
    temp_c: float


def send_telemetry(payload: dict) -> None:
    base_url = os.environ.get("COLABFORGE_TELEMETRY_URL", "").rstrip("/")
    token = os.environ.get("COLABFORGE_TELEMETRY_TOKEN", "")
    if not base_url or not token:
        return
    try:
        req = urllib.request.Request(
            f"{base_url}/api/telemetry/ingest",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "x-telemetry-token": token,
            },
        )
        urllib.request.urlopen(req, timeout=4)
    except Exception:
        pass


def notify_webhook(message: str) -> None:
${
  useWebhook
    ? `    webhook_url = os.environ.get("COLAB_WEBHOOK_URL", ${JSON.stringify(config.webhookUrlPlaceholder)})
    if not webhook_url or "YOUR_WEBHOOK" in webhook_url:
        return
    payload = json.dumps({"content": f"[MiniMax H3 Guard] {message}"}).encode("utf-8")
    req = urllib.request.Request(webhook_url, data=payload, headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=5)
    except Exception as exc:
        print(f"[Uyarı] Webhook gönderilemedi: {exc}")`
    : `    print(f"[Bildirim] {message}")`
}


def abort_and_unassign(reason: str) -> None:
    print(f"\\n[KRİTİK DURDURMA] {reason}")
    send_telemetry({
        "stage": "aborted",
        "currentStepLabel": reason,
        "logLine": f"ABORT -> runtime.unassign(): {reason}",
        "logLevel": "error",
    })
    notify_webhook(f"Oturum kapatıldı: {reason}")
${
  useUnassign
    ? `    try:
        from google.colab import runtime
        print("[Kill-Switch] Compute Unit kaybetmemek için runtime.unassign() çağrılıyor...")
        runtime.unassign()
    except ImportError:
        print("[Yerel Mod] google.colab bulunamadı; süreç çıkış kodu 1 ile durduruluyor.")
    sys.exit(1)`
    : `    sys.exit(1)`
}


def inspect_gpu() -> GpuInfo:
    try:
        out = subprocess.check_output(
            [
                "nvidia-smi",
                "--query-gpu=name,memory.total,driver_version,temperature.gpu",
                "--format=csv,noheader,nounits",
            ],
            text=True,
        ).strip()
    except Exception as exc:
        abort_and_unassign(f"GPU bulunamadı veya nvidia-smi başarısız: {exc}")
        raise

    first_line = out.splitlines()[0]
    parts = [part.strip() for part in first_line.split(",")]
    name, mem_mib, driver = parts[0], parts[1], parts[2]
    temp_c = float(parts[3]) if len(parts) > 3 and parts[3].replace(".", "", 1).isdigit() else 0.0
    vram_gb = round(float(mem_mib) / 1024.0, 2)
    return GpuInfo(name=name, vram_gb=vram_gb, driver=driver, temp_c=temp_c)


def inspect_system_ram_gb() -> float:
    try:
        with open("/proc/meminfo", "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("MemTotal:"):
                    kb = float(line.split()[1])
                    return round(kb / (1024.0 ** 2), 2)
    except Exception:
        pass
    return 0.0


def select_tier(gpu: GpuInfo) -> str:
    if gpu.vram_gb >= 75.0:
        return "80GB"
    if gpu.vram_gb >= 38.0:
        return "40GB"
    if gpu.vram_gb >= 22.0 and ALLOW_24GB_FALLBACK:
        return "24GB"
    abort_and_unassign(
        f"Colab hedef dışı GPU atadı: {gpu.name} ({gpu.vram_gb} GB VRAM). "
        "Compute Unit kaybetmemek için oturum kapatılıyor."
    )
    return "REJECT"


def verify_high_ram() -> float:
    sys_ram_gb = inspect_system_ram_gb()
    if REQUIRE_HIGH_RAM and sys_ram_gb > 0 and sys_ram_gb < MIN_HIGH_RAM_GB:
        abort_and_unassign(
            f"High-RAM doğrulanamadı: {sys_ram_gb} GB sistem RAM'i (gereken >= {MIN_HIGH_RAM_GB} GB)."
        )
    return sys_ram_gb


def verify_disk_quota(min_disk_gb: int) -> float:
    target = "/content" if os.path.exists("/content") else os.getcwd()
    usage = shutil.disk_usage(target)
    free_gb = round(usage.free / (1024 ** 3), 2)
    if free_gb < min_disk_gb:
        abort_and_unassign(f"Yetersiz disk alanı: {free_gb} GB boş, gereken >= {min_disk_gb} GB.")
    return free_gb


def verify_hf_repo(repo_id: str) -> None:
    from huggingface_hub import HfApi
    token = os.environ.get(HF_TOKEN_ENV) or None
    api = HfApi(token=token)
    try:
        info = api.model_info(repo_id)
        print(f"[HF Doğrulandı] {info.id} (sha={info.sha[:8] if info.sha else 'n/a'})")
    except Exception as exc:
        abort_and_unassign(f"HuggingFace repo erişilemedi ({repo_id}): {exc}")


def run_preflight() -> dict:
    gpu = inspect_gpu()
    sys_ram_gb = verify_high_ram()
    tier = select_tier(gpu)
    profile = MODEL_MATRIX[tier]
    free_gb = verify_disk_quota(profile["min_disk_gb"])
    verify_hf_repo(profile["repo_id"])

    result = {
        "gpu_name": gpu.name,
        "vram_gb": gpu.vram_gb,
        "system_ram_gb": sys_ram_gb,
        "gpu_temp_c": gpu.temp_c,
        "tier": tier,
        "repo_id": profile["repo_id"],
        "quant": profile["quant"],
        "free_disk_gb": free_gb,
    }
    send_telemetry({
        "stage": "preflight",
        "gpuName": gpu.name,
        "vramTotalGb": gpu.vram_gb,
        "vramUsedGb": 1.2,
        "systemRamTotalGb": sys_ram_gb,
        "gpuTempC": gpu.temp_c,
        "diskFreeGb": free_gb,
        "currentStepLabel": f"A100 {tier} + High-RAM doğrulandı ({profile['repo_id']})",
        "logLine": f"Preflight PASS: {gpu.name} ({gpu.vram_gb}GB VRAM, {sys_ram_gb}GB RAM)",
        "logLevel": "success",
    })
    print("[Guardrail BAŞARILI]", json.dumps(result, ensure_ascii=False))
    return result


if __name__ == "__main__":
    run_preflight()
`;
}

export function generateColabNotebookJson(
  config: AutomationConfig,
  assets: ProjectAssetFile[],
  findings: AuditFinding[],
  batchQueue: BatchQueueItem[] = [],
  projects: ColabProject[] = [],
  telemetryUrl: string = '',
  telemetryToken: string = ''
): string {
  const manifestStr = generateManifestJson(config, assets);
  const batchQueueStr = generateBatchQueueJson(batchQueue, projects, config);
  const preflightPy = generatePreflightPython(config, findings);
  const isFindingEnabled = (id: string) =>
    findings.find((f) => f.id === id)?.enabledInExport ?? true;

  const hfTransferEnabled =
    config.enableHfTransfer && isFindingEnabled('five-ten-min-boot-budget');
  const useConstraintsAndUv = isFindingEnabled('constraints-uv-sageattention');
  const useUvInstaller =
    config.comfyui.enableUvInstaller &&
    (config.modelInstaller?.useUvAcceleration ?? true) &&
    useConstraintsAndUv;
  const activeModelId = config.modelInstaller?.selectedModelId ?? 'minimax-h3';
  const modelInstallTarget = config.modelInstaller?.installTarget ?? 'nvme';
  const createDriveSymlinks = config.modelInstaller?.createDriveSymlinks ?? true;
  const driveModelsDir = `/content/drive/MyDrive/${(config.driveFolderName || 'ColabForge_Projects').replace(/^\/+|\/+$/g, '')}/ComfyUI_Models/${activeModelId}`;
  const useTiledVae = config.comfyui.useTiledVaeDecode && isFindingEnabled('vaedecode-tiled-highram');
  const useWsWatchdog = isFindingEnabled('ws-watchdog-deadman-vram-free');
  const deadManSeconds =
    useWsWatchdog && config.comfyui.deadManSwitchMinutes > 0
      ? config.comfyui.deadManSwitchMinutes * 60
      : 0;

  const cell1 = `# @title 1. A100 + High-RAM Guardrail, Dead-Man's Switch & Canlı Telemetri Köprüsü
${hfTransferEnabled ? '%env HF_HUB_ENABLE_HF_TRANSFER=1\n' : ''}${
    useUvInstaller
      ? `!pip -q install -U uv && uv pip install --system -U ${hfTransferEnabled ? '"huggingface_hub[hf_transfer]" hf_transfer ' : 'huggingface_hub '}websocket-client pyyaml requests psutil`
      : `!pip -q install -U ${hfTransferEnabled ? '"huggingface_hub[hf_transfer]" hf_transfer ' : 'huggingface_hub '}websocket-client pyyaml requests psutil`
  }

import os, subprocess
${hfTransferEnabled ? 'os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"' : 'os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "0"'}
os.environ["HF_HOME"] = ${JSON.stringify(`${config.workspaceRoot}/hf_cache`)}
os.environ.setdefault("COLABFORGE_TELEMETRY_URL", ${JSON.stringify(telemetryUrl)})
os.environ.setdefault("COLABFORGE_TELEMETRY_TOKEN", ${JSON.stringify(telemetryToken)})

${
  deadManSeconds > 0
    ? `# Zombi oturum koruması: En fazla ${config.comfyui.deadManSwitchMinutes} dk sonra oturumu otomatik kapatır
subprocess.Popen(["bash", "-c", f"nohup bash -c 'sleep ${deadManSeconds} && kill 1' >/dev/null 2>&1 &"])`
    : '# Dead-Man Switch devre dışı'
}

with open("preflight_guard.py", "w", encoding="utf-8") as f:
    f.write(${JSON.stringify(preflightPy)})

from preflight_guard import run_preflight, send_telemetry
RUNTIME_STATE = run_preflight()
`;

  const cell2 = `# @title 2. ComfyUI + Model Yan Eklentileri (uv + Torch/NumPy Kilidi + SageAttention)
import os, json, subprocess
from pathlib import Path

WORKSPACE_ROOT = Path(${JSON.stringify(config.workspaceRoot)})
COMFY_ROOT = Path(${JSON.stringify(config.comfyui.comfyRootDir)})
COMFY_REPO = ${JSON.stringify(config.comfyui.comfyRepoUrl)}
ACTIVE_MODEL_ID = ${JSON.stringify(activeModelId)}
ENABLE_MANAGER = ${config.comfyui.enableManager ? 'True' : 'False'}
ENABLE_VHS = ${config.comfyui.enableVideoHelperSuite ? 'True' : 'False'}
ENABLE_KJNODES = ${config.comfyui.enableKjNodes ? 'True' : 'False'}
ENABLE_LTX_NODE = ${activeModelId === 'ltx-2.3' ? 'True' : 'False'}
ENABLE_SAGEATTENTION = ${config.comfyui.enableSageAttention && useConstraintsAndUv ? 'True' : 'False'}
USE_UV = ${useUvInstaller ? 'True' : 'False'}
PIN_CONSTRAINTS = ${config.comfyui.pinTorchNumpyConstraints && useConstraintsAndUv ? 'True' : 'False'}

MANIFEST = json.loads(${JSON.stringify(manifestStr)})
BATCH_QUEUE = json.loads(${JSON.stringify(batchQueueStr)})

for sub in ["schema", "prompts", "config", "outputs", "hf_cache"]:
    (WORKSPACE_ROOT / sub).mkdir(parents=True, exist_ok=True)

CONSTRAINTS_PATH = Path("/tmp/constraints.txt")
if PIN_CONSTRAINTS:
    import torch, numpy
    CONSTRAINTS_PATH.write_text(
        f"torch=={torch.__version__}\\nnumpy=={numpy.__version__}\\n",
        encoding="utf-8",
    )
    print(f"[Constraints Kilitli] torch=={torch.__version__}, numpy=={numpy.__version__}")

def pip_install(args_list):
    cmd = (["uv", "pip", "install", "--system"] if USE_UV else ["pip", "-q", "install"]) + args_list
    if PIN_CONSTRAINTS and CONSTRAINTS_PATH.exists():
        cmd += ["-c", str(CONSTRAINTS_PATH)]
    subprocess.run(cmd, check=True)

if ${config.comfyui.installComfyUi ? 'True' : 'False'} and not (COMFY_ROOT / "main.py").exists():
    subprocess.run(["git", "clone", "--depth=1", COMFY_REPO, str(COMFY_ROOT)], check=True)
    pip_install(["-r", str(COMFY_ROOT / "requirements.txt")])

custom_nodes = COMFY_ROOT / "custom_nodes"
custom_nodes.mkdir(parents=True, exist_ok=True)

NODE_REPOS = []
if ENABLE_VHS:
    NODE_REPOS.append(("ComfyUI-VideoHelperSuite", "https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git"))
if ENABLE_KJNODES:
    NODE_REPOS.append(("ComfyUI-KJNodes", "https://github.com/kijai/ComfyUI-KJNodes.git"))
if ENABLE_LTX_NODE:
    NODE_REPOS.append(("ComfyUI-LTXVideo", "https://github.com/Lightricks/ComfyUI-LTXVideo.git"))
if ENABLE_MANAGER:
    NODE_REPOS.append(("ComfyUI-Manager", "https://github.com/ltdrdata/ComfyUI-Manager.git"))

for folder_name, repo_url in NODE_REPOS:
    node_dir = custom_nodes / folder_name
    if not node_dir.exists():
        subprocess.run(["git", "clone", "--depth=1", repo_url, str(node_dir)], check=True)
        req_file = node_dir / "requirements.txt"
        if req_file.exists():
            pip_install(["-r", str(req_file)])

if ENABLE_SAGEATTENTION:
    try:
        pip_install(["sageattention"])
    except Exception as exc:
        print(f"[Uyarı] SageAttention derlenemedi, standart PyTorch attention kullanılacak: {exc}")

for comfy_sub in [
    "models/checkpoints",
    "models/diffusion_models",
    "models/text_encoders",
    "models/vae",
    "models/loras",
    "input/blender_graybox",
    "user/default/workflows",
    "output",
]:
    (COMFY_ROOT / comfy_sub).mkdir(parents=True, exist_ok=True)

(WORKSPACE_ROOT / "workspace_manifest.json").write_text(json.dumps(MANIFEST, indent=2, ensure_ascii=False), encoding="utf-8")
(WORKSPACE_ROOT / "batch_queue_manifest.json").write_text(json.dumps(BATCH_QUEUE, indent=2, ensure_ascii=False), encoding="utf-8")

send_telemetry({
    "stage": "downloading",
    "downloadProgressPct": 8,
    "batchTotal": len(BATCH_QUEUE.get("jobs", [])),
    "currentStepLabel": "ComfyUI + yan eklentiler (uv + constraints kilidiyle) kuruldu",
    "logLine": f"ComfyUI + eklentiler hazır -> {COMFY_ROOT} (uv={USE_UV}, sage={ENABLE_SAGEATTENTION}, model={ACTIVE_MODEL_ID})",
    "logLevel": "info",
})
print("[ComfyUI Hazır]", COMFY_ROOT)
`;

  const cell3 = `# @title 3. ComfyUI Model Yükleyici — Ağırlık İndirme (${modelInstallTarget === 'drive' ? 'Google Drive + Symlink' : 'NVMe'} · hf_transfer + uv)
import importlib.util
import os
import shutil
import subprocess
import time
from pathlib import Path

ENABLE_HF_TRANSFER = ${hfTransferEnabled ? 'True' : 'False'}
USE_UV_ACCELERATION = ${useUvInstaller ? 'True' : 'False'}
MODEL_INSTALL_TARGET = ${JSON.stringify(modelInstallTarget)}
DRIVE_MODELS_DIR = Path(${JSON.stringify(driveModelsDir)})
CREATE_DRIVE_SYMLINKS = ${createDriveSymlinks ? 'True' : 'False'}
os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1" if ENABLE_HF_TRANSFER else "0"

if ENABLE_HF_TRANSFER and importlib.util.find_spec("hf_transfer") is None:
    install_cmd = (
        ["uv", "pip", "install", "--system", "-U", "hf_transfer"]
        if USE_UV_ACCELERATION and shutil.which("uv")
        else ["pip", "-q", "install", "-U", "hf_transfer"]
    )
    subprocess.run(install_cmd, check=True)

import huggingface_hub.constants as hf_constants
from huggingface_hub import hf_hub_download, snapshot_download

HF_TRANSFER_ACTIVE = bool(
    ENABLE_HF_TRANSFER and importlib.util.find_spec("hf_transfer") is not None
)
hf_constants.HF_HUB_ENABLE_HF_TRANSFER = HF_TRANSFER_ACTIVE
os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1" if HF_TRANSFER_ACTIVE else "0"
print(
    f"[HF İndirme Motoru] HF_HUB_ENABLE_HF_TRANSFER={os.environ['HF_HUB_ENABLE_HF_TRANSFER']} "
    f"(hf_transfer={'aktif' if HF_TRANSFER_ACTIVE else 'pasif'}, target={MODEL_INSTALL_TARGET})"
)

COMFY_MODELS = COMFY_ROOT / "models"
if MODEL_INSTALL_TARGET == "drive":
    if not Path("/content/drive/MyDrive").exists():
        from google.colab import drive
        drive.mount("/content/drive")
    DRIVE_MODELS_DIR.mkdir(parents=True, exist_ok=True)
    DOWNLOAD_MODELS_DIR = DRIVE_MODELS_DIR
else:
    DOWNLOAD_MODELS_DIR = COMFY_MODELS

tier = RUNTIME_STATE["tier"]
repo_id = RUNTIME_STATE["repo_id"]

TIER_FILES = {
    "80GB": [
        ${JSON.stringify(config.comfyui.diffusionModel80Gb)},
        ${JSON.stringify(config.comfyui.textEncoder80Gb)},
        ${JSON.stringify(config.comfyui.videoVaeFile)},
        ${JSON.stringify(config.comfyui.audioVaeFile)},
    ],
    "40GB": [
        ${JSON.stringify(config.comfyui.diffusionModel40Gb)},
        ${JSON.stringify(config.comfyui.textEncoder40Gb)},
        ${JSON.stringify(config.comfyui.videoVaeFile)},
        ${JSON.stringify(config.comfyui.audioVaeFile)},
    ],
}
target_files = list(dict.fromkeys(TIER_FILES.get(tier, TIER_FILES["40GB"])))


def download_model_weight(target_repo: str, rel_weight: str, dest_dir: Path) -> str:
    try:
        hf_constants.HF_HUB_ENABLE_HF_TRANSFER = HF_TRANSFER_ACTIVE
        return hf_hub_download(
            repo_id=target_repo,
            filename=rel_weight,
            local_dir=str(dest_dir),
        )
    except Exception as fast_exc:
        if HF_TRANSFER_ACTIVE and "404" not in str(fast_exc) and "EntryNotFound" not in str(fast_exc):
            print(f"[hf_transfer Yedek Geçiş] {rel_weight} standart HTTP aktarımıyla tekrar deneniyor: {fast_exc}")
            hf_constants.HF_HUB_ENABLE_HF_TRANSFER = False
            try:
                return hf_hub_download(
                    repo_id=target_repo,
                    filename=rel_weight,
                    local_dir=str(dest_dir),
                )
            finally:
                hf_constants.HF_HUB_ENABLE_HF_TRANSFER = HF_TRANSFER_ACTIVE
        raise


send_telemetry({
    "stage": "downloading",
    "downloadProgressPct": 20,
    "currentStepLabel": (
        f"{repo_id} ({tier}) ağırlıkları {MODEL_INSTALL_TARGET.upper()} hedefine hf_transfer ile indiriliyor..."
        if HF_TRANSFER_ACTIVE
        else f"{repo_id} ({tier}) ağırlıkları {MODEL_INSTALL_TARGET.upper()} hedefine indiriliyor..."
    ),
    "logLine": f"HuggingFace indirme başladı ({'HF_HUB_ENABLE_HF_TRANSFER=1' if HF_TRANSFER_ACTIVE else 'standart'}, target={MODEL_INSTALL_TARGET}): {repo_id} ({len(target_files)} bileşen)",
    "logLevel": "info",
})

try:
    for idx, rel_weight in enumerate(target_files, start=1):
        t0 = time.time()
        downloaded = download_model_weight(repo_id, rel_weight, DOWNLOAD_MODELS_DIR)
        if MODEL_INSTALL_TARGET == "drive" and CREATE_DRIVE_SYMLINKS:
            symlink_dst = COMFY_MODELS / rel_weight
            symlink_dst.parent.mkdir(parents=True, exist_ok=True)
            if symlink_dst.is_symlink() or symlink_dst.exists():
                symlink_dst.unlink()
            symlink_dst.symlink_to(Path(downloaded))
        elapsed_s = round(time.time() - t0, 1)
        pct = 20 + int((idx / len(target_files)) * 75)
        send_telemetry({
            "stage": "downloading",
            "downloadProgressPct": pct,
            "currentStepLabel": f"İndirildi ({idx}/{len(target_files)}): {Path(rel_weight).name}",
            "logLine": f"[{'hf_transfer' if HF_TRANSFER_ACTIVE else 'http'}][{MODEL_INSTALL_TARGET}] Ağırlık yerleşti ({elapsed_s}s) -> {downloaded}",
            "logLevel": "info",
        })
except Exception as exc:
    print(f"[Fallback snapshot_download] Tekil dosya yolu uyarısı ({exc}); tam safetensors snapshot indiriliyor...")
    hf_constants.HF_HUB_ENABLE_HF_TRANSFER = HF_TRANSFER_ACTIVE
    snapshot_download(
        repo_id=repo_id,
        local_dir=str(DOWNLOAD_MODELS_DIR / f"{ACTIVE_MODEL_ID}_bundle"),
        allow_patterns=["*.json", "*.safetensors", "*.model", "*.txt", "*.yaml"],
        ignore_patterns=["*.bin", "*.onnx", "*optimizer*"],
    )

send_telemetry({
    "stage": "downloading",
    "downloadProgressPct": 100,
    "currentStepLabel": f"{repo_id} ({tier}) ağırlıkları {MODEL_INSTALL_TARGET.upper()} içinde hazır",
    "logLine": f"Tüm ağırlıklar indirildi (target={MODEL_INSTALL_TARGET}, hf_transfer={HF_TRANSFER_ACTIVE})",
    "logLevel": "success",
})
print("[Tamamlandı] Model ağırlıkları hazır:", DOWNLOAD_MODELS_DIR)
`;

  const activeProjectPreset = getDeliveryPreset(projects[0]?.deliveryPreset);
  const blenderStagePy = buildBlenderColabStagePython(
    config.blenderRender ?? DEFAULT_BLENDER_RENDER_CONFIG,
    activeProjectPreset.width,
    activeProjectPreset.height
  );

  const cell4 = `# @title 4. Proje Dosyalarını Enjekte Et, Varsayılan .blend Renderla (OptiX) & Başsız ComfyUI Başlat
import os, json, shutil, subprocess, time, urllib.request
from pathlib import Path

AUTO_SYNC_TO_DRIVE = ${config.autoSyncOutputsToDrive ? 'True' : 'False'}
COMFY_PORT = ${config.comfyui.comfyPort}
COMFY_FLAGS = ${JSON.stringify(config.comfyui.headlessFlags)}.split()

if AUTO_SYNC_TO_DRIVE and not Path("/content/drive/MyDrive").exists():
    try:
        from google.colab import drive
        drive.mount("/content/drive")
    except Exception as exc:
        print(f"[Bilgi] Google Drive bağlantısı atlandı: {exc}")

DRIVE_INPUT_DIR = Path(${JSON.stringify(`/content/drive/MyDrive/${config.driveFolderName}/input_project`)})
SOURCE_DROP_DIR = DRIVE_INPUT_DIR if DRIVE_INPUT_DIR.exists() else Path("/content/input_project")

copied = 0
for item in MANIFEST["files"]:
    src_by_rel = SOURCE_DROP_DIR / item["source_relative_path"]
    src_by_name = SOURCE_DROP_DIR / item["name"]
    src = src_by_rel if src_by_rel.exists() else src_by_name
    dst = Path(item["colab_target_path"])
    dst.parent.mkdir(parents=True, exist_ok=True)
    if src.exists():
        shutil.copy2(src, dst)
        copied += 1
        # ComfyUI LoadImage/LoadVideo düğümleri dosya adını doğrudan ComfyUI/input kökünde de arar
        if item["kind"] in ("reference_media", "blender_graybox"):
            shutil.copy2(src, COMFY_ROOT / "input" / item["name"])

${blenderStagePy}

comfy_proc = subprocess.Popen(
    ["python", "main.py", *COMFY_FLAGS],
    cwd=str(COMFY_ROOT),
    stdout=open(str(WORKSPACE_ROOT / "comfyui_server.log"), "w"),
    stderr=subprocess.STDOUT,
)

comfy_ready = False
for _ in range(45):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{COMFY_PORT}/system_stats", timeout=2) as r:
            if r.status == 200:
                comfy_ready = True
                break
    except Exception:
        time.sleep(2)

send_telemetry({
    "stage": "injecting",
    "batchTotal": len(BATCH_QUEUE.get("jobs", [])),
    "currentStepLabel": f"ComfyUI API aktif (port {COMFY_PORT}) · {copied} dosya enjekte edildi",
    "logLine": f"ComfyUI sunucusu {'hazır' if comfy_ready else 'beklemede'} | Enjekte edilen: {copied}",
    "logLevel": "success" if comfy_ready else "warn",
})
print(f"[ComfyUI API] ready={comfy_ready} | copied={copied}/{len(MANIFEST['files'])}")
`;

  const cell5 = `# @title 5. ComfyUI WebSocket /ws Watchdog + VAEDecodeTiled + Zamanlanmış Batch Queue Render Döngüsü
import datetime, json, shutil, subprocess, time, uuid, urllib.request
from pathlib import Path
import websocket

USE_TILED_VAE = ${useTiledVae ? 'True' : 'False'}
VAE_TILE_SIZE = ${config.comfyui.vaeTileSize}
ENABLE_TEACACHE = ${config.comfyui.enableTeaCache ? 'True' : 'False'}
ENABLE_TURBO_LORA = ${config.comfyui.enableTurboLora ? 'True' : 'False'}
TURBO_LORA_FILE = ${JSON.stringify(config.comfyui.turboLoraFile)}
TURBO_STEPS = ${config.comfyui.turboSteps}
WS_STALL_TIMEOUT = ${config.comfyui.wsStallTimeoutSec}
FREE_EVERY_N = ${config.comfyui.freeMemoryEveryNVideos}
SCHEDULE_CONFIG = BATCH_QUEUE.get("schedule") or {}


def _read_system_load_pct():
    vram_pct, ram_pct = 0.0, 0.0
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=memory.used,memory.total", "--format=csv,noheader,nounits"],
            text=True,
        ).strip().splitlines()[0]
        used_mib, total_mib = [float(x.strip()) for x in out.split(",")]
        vram_pct = round((used_mib / max(1.0, total_mib)) * 100.0, 1)
    except Exception:
        pass
    try:
        mem_info = {}
        with open("/proc/meminfo", "r", encoding="utf-8") as f:
            for line in f:
                parts = line.split()
                if len(parts) >= 2:
                    mem_info[parts[0].rstrip(":")] = float(parts[1])
        total_kb = mem_info.get("MemTotal", 0.0)
        avail_kb = mem_info.get("MemAvailable", total_kb)
        if total_kb > 0:
            ram_pct = round(((total_kb - avail_kb) / total_kb) * 100.0, 1)
    except Exception:
        pass
    return vram_pct, ram_pct


def wait_for_scheduled_trigger():
    if not SCHEDULE_CONFIG.get("enabled"):
        return
    mode = SCHEDULE_CONFIG.get("mode", "time")
    max_vram = float(SCHEDULE_CONFIG.get("max_vram_load_pct", 35))
    max_ram = float(SCHEDULE_CONFIG.get("max_ram_load_pct", 60))
    target_date = SCHEDULE_CONFIG.get("scheduled_date", "")
    target_time = SCHEDULE_CONFIG.get("scheduled_time", "02:00")
    send_telemetry({
        "stage": "injecting",
        "currentStepLabel": f"Zamanlanmış başlatma bekleniyor ({mode}: {target_date} {target_time})",
        "logLine": f"BatchQueue zamanlayıcısı aktif -> mode={mode}, max_vram={max_vram}%, max_ram={max_ram}%",
        "logLevel": "info",
    })
    while True:
        now = datetime.datetime.now()
        time_ok = True
        if mode in ("time", "time_and_low_load") and target_date and target_time:
            try:
                target_dt = datetime.datetime.strptime(f"{target_date} {target_time}", "%Y-%m-%d %H:%M")
                time_ok = now >= target_dt
            except ValueError:
                time_ok = True
        vram_pct, ram_pct = _read_system_load_pct()
        load_ok = True if mode == "time" else (vram_pct <= max_vram and ram_pct <= max_ram)
        if time_ok and load_ok:
            print(f"[Zamanlayıcı Tetiklendi] mode={mode}, vram={vram_pct}%, ram={ram_pct}%")
            break
        time.sleep(10)


wait_for_scheduled_trigger()

jobs = BATCH_QUEUE.get("jobs", [])
if not jobs:
    jobs = [{
        "order": 1,
        "job_id": "default-job-1",
        "project_id": "default",
        "project_name": "Aktif Proje",
        "scene_label": "Sahne 01",
        "colab_output_dir": str(WORKSPACE_ROOT / "outputs/default/job-1"),
    }]

workflow_candidates = list((COMFY_ROOT / "user/default/workflows").glob("*.json"))
base_workflow = (
    json.loads(workflow_candidates[0].read_text(encoding="utf-8"))
    if workflow_candidates
    else {}
)

def wait_for_prompt_ws(prompt_id: str, client_id: str, scene_label: str, idx: int, total_jobs: int) -> None:
    ws_url = f"ws://127.0.0.1:{COMFY_PORT}/ws?clientId={client_id}"
    ws = websocket.create_connection(ws_url, timeout=15)
    ws.settimeout(10)
    last_activity = time.time()
    try:
        while True:
            if time.time() - last_activity > WS_STALL_TIMEOUT:
                raise TimeoutError(f"ComfyUI {WS_STALL_TIMEOUT}s boyunca ilerleme bildirmedi (stall watchdog).")
            try:
                raw = ws.recv()
            except websocket.WebSocketTimeoutException:
                continue
            if not raw or not isinstance(raw, str):
                continue
            msg = json.loads(raw)
            mtype = msg.get("type")
            data = msg.get("data", {})
            if mtype == "progress" and data.get("prompt_id") == prompt_id:
                last_activity = time.time()
                val, max_v = data.get("value", 0), max(1, data.get("max", 1))
                pct = int((val / max_v) * 100)
                send_telemetry({
                    "stage": "rendering",
                    "batchIndex": idx,
                    "batchTotal": total_jobs,
                    "currentStepLabel": f"ComfyUI [{idx}/{total_jobs}] {scene_label} · Adım {val}/{max_v} (%{pct})",
                })
            elif mtype == "execution_error" and data.get("prompt_id") == prompt_id:
                raise RuntimeError(f"ComfyUI düğüm hatası: {data.get('exception_message', data)}")
            elif mtype == "executing" and data.get("prompt_id") == prompt_id:
                last_activity = time.time()
                if data.get("node") is None:
                    break
    finally:
        ws.close()

total_jobs = len(jobs)
for idx, job in enumerate(jobs, start=1):
    out_dir = Path(job.get("colab_output_dir") or (WORKSPACE_ROOT / "outputs" / job["job_id"]))
    out_dir.mkdir(parents=True, exist_ok=True)
    prompts = {p.name: p.read_text(encoding="utf-8", errors="ignore") for p in (WORKSPACE_ROOT / "prompts").glob("*")}
    graybox_assets = sorted([
        p.name for p in (COMFY_ROOT / "input/blender_graybox").glob("*")
        if p.suffix.lower() in (".mp4", ".mov", ".webm", ".png", ".jpg", ".jpeg")
    ])
    first_frame_candidates = [
        item["name"] for item in MANIFEST.get("files", [])
        if item.get("media_role") == "first_frame"
    ]
    last_frame_candidates = [
        item["name"] for item in MANIFEST.get("files", [])
        if item.get("media_role") == "last_frame"
    ]
    if not first_frame_candidates and (COMFY_ROOT / "input/first_frame_blender.png").exists():
        first_frame_candidates = ["first_frame_blender.png"]
    if not last_frame_candidates and (COMFY_ROOT / "input/last_frame_blender.png").exists():
        last_frame_candidates = ["last_frame_blender.png"]

    job_width = int(job.get("width", 1024))
    job_height = int(job.get("height", 768))

    # Aktif GPU kademesine, İlk/Son Kare, Etsy/Sosyal çözünürlük, VAEDecodeTiled ve opsiyonel Turbo/TeaCache ön ayarlarına göre düğümleri güncelle
    wf = json.loads(json.dumps(base_workflow))
    unet_node_id = None
    load_image_idx = 0
    for node_id, node in list(wf.items()):
        if not isinstance(node, dict):
            continue
        cls = node.get("class_type", "")
        inputs = node.setdefault("inputs", {})
        if cls == "UNETLoader":
            unet_node_id = node_id
            inputs["unet_name"] = Path(
                ${JSON.stringify(config.comfyui.diffusionModel80Gb)}
                if RUNTIME_STATE["tier"] == "80GB"
                else ${JSON.stringify(config.comfyui.diffusionModel40Gb)}
            ).name
        elif cls == "CLIPLoader":
            inputs["clip_name"] = Path(
                ${JSON.stringify(config.comfyui.textEncoder80Gb)}
                if RUNTIME_STATE["tier"] == "80GB"
                else ${JSON.stringify(config.comfyui.textEncoder40Gb)}
            ).name
        elif cls == "CLIPTextEncode" and "master_prompt.txt" in prompts:
            inputs["text"] = prompts["master_prompt.txt"]
        elif cls == "LoadVideo" and graybox_assets:
            inputs["file"] = graybox_assets[0]
        elif cls == "LoadImage":
            role_hint = str(inputs.get("role", "")).lower()
            if role_hint == "first_frame" or (load_image_idx == 0 and first_frame_candidates):
                if first_frame_candidates:
                    inputs["image"] = first_frame_candidates[0]
            elif role_hint == "last_frame" or (load_image_idx >= 1 and last_frame_candidates):
                if last_frame_candidates:
                    inputs["image"] = last_frame_candidates[0]
            load_image_idx += 1
        elif cls in ("EmptyLatentImage", "EmptyHunyuanLatentVideo", "EmptyLTXVLatentVideo"):
            inputs["width"] = job_width
            inputs["height"] = job_height
        elif cls == "VAEDecode" and USE_TILED_VAE:
            node["class_type"] = "VAEDecodeTiled"
            inputs["tile_size"] = VAE_TILE_SIZE
            inputs.setdefault("overlap", 64)
            inputs.setdefault("temporal_size", 64)
            inputs.setdefault("temporal_overlap", 8)
        elif cls == "KSampler" and ENABLE_TURBO_LORA and (COMFY_ROOT / "models/loras" / TURBO_LORA_FILE).exists():
            inputs["steps"] = TURBO_STEPS
        elif cls == "VHS_VideoCombine":
            preset_tag = job.get("delivery_preset", "etsy")
            inputs["filename_prefix"] = f"{job.get('job_id', 'scene')}_{preset_tag}_MiniMaxH3"

    original_unet_id = unet_node_id
    # Koşullu 8-Step Turbo LoRA & TeaCache enjeksiyonu
    if ENABLE_TURBO_LORA and unet_node_id and (COMFY_ROOT / "models/loras" / TURBO_LORA_FILE).exists():
        lora_id = "901"
        wf[lora_id] = {
            "class_type": "LoraLoaderModelOnly",
            "inputs": {"lora_name": TURBO_LORA_FILE, "strength_model": 1.0, "model": [unet_node_id, 0]},
        }
        unet_node_id = lora_id

    if ENABLE_TEACACHE and unet_node_id:
        teacache_id = "902"
        wf[teacache_id] = {
            "class_type": "TeaCache",
            "inputs": {"rel_l1_thresh": 0.25, "model": [unet_node_id, 0]},
        }
        unet_node_id = teacache_id

    if original_unet_id and unet_node_id != original_unet_id:
        for nid, node in wf.items():
            if nid in ("901", "902") or not isinstance(node, dict):
                continue
            node_inputs = node.get("inputs", {})
            for key, val in list(node_inputs.items()):
                if isinstance(val, list) and len(val) >= 2 and str(val[0]) == str(original_unet_id) and val[1] == 0:
                    node_inputs[key] = [unet_node_id, 0]

    vram_used = None
    try:
        vram_out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
            text=True,
        ).strip().splitlines()[0]
        vram_used = round(float(vram_out) / 1024.0, 2)
    except Exception:
        pass

    send_telemetry({
        "stage": "rendering",
        "activeProjectId": job.get("project_id"),
        "activeBatchJobId": job.get("job_id"),
        "batchIndex": idx,
        "batchTotal": total_jobs,
        "vramUsedGb": vram_used,
        "currentStepLabel": f"ComfyUI /prompt + WS Watchdog ({idx}/{total_jobs}): {job.get('scene_label')}",
        "logLine": f"[{idx}/{total_jobs}] ComfyUI API gönderildi: {job.get('scene_label')}",
        "logLevel": "info",
    })

    if wf:
        client_id = str(uuid.uuid4())
        try:
            req = urllib.request.Request(
                f"http://127.0.0.1:{COMFY_PORT}/prompt",
                data=json.dumps({"prompt": wf, "client_id": client_id}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                queued = json.loads(resp.read().decode("utf-8"))
                prompt_id = queued.get("prompt_id")
                print(f"[{idx}/{total_jobs}] ComfyUI prompt_id={prompt_id}")
                wait_for_prompt_ws(prompt_id, client_id, job.get("scene_label", "Sahne"), idx, total_jobs)
        except Exception as exc:
            print(f"[ComfyUI WS/API Bilgi] {exc}")

    # Her N videoda bir VRAM fragmantasyonunu önlemek için önbelleği tazele
    if FREE_EVERY_N > 0 and idx % FREE_EVERY_N == 0:
        try:
            free_req = urllib.request.Request(
                f"http://127.0.0.1:{COMFY_PORT}/free",
                data=json.dumps({"unload_models": False, "free_memory": True}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )
            urllib.request.urlopen(free_req, timeout=5)
            print(f"[VRAM Temizliği] {idx}. video sonrası POST /free çalıştırıldı.")
        except Exception:
            pass

    for rendered in (COMFY_ROOT / "output").glob("*"):
        if rendered.is_file():
            shutil.copy2(rendered, out_dir / rendered.name)

    (out_dir / "resolved_comfyui_workflow.json").write_text(
        json.dumps(wf, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"[{idx}/{total_jobs}] Sahne tamamlandı -> {out_dir}")
`;

  const cell6 = `# @title 6. MCP Yerel Çıktı İndirme, Opsiyonel Drive Yedeği & Güvenli Oturum Kapatma
import shutil
from pathlib import Path

outputs_dir = WORKSPACE_ROOT / "outputs"
drive_backup = Path(${JSON.stringify(config.driveBackupDir)})
AUTO_SYNC_TO_DRIVE = ${config.autoSyncOutputsToDrive ? 'True' : 'False'}
AUTO_UNASSIGN_ON_FINISH = ${config.autoUnassignOnFinish ? 'True' : 'False'}

if "comfy_proc" in globals() and comfy_proc.poll() is None:
    comfy_proc.terminate()

send_telemetry({
    "stage": "saving_local",
    "currentStepLabel": "ComfyUI çıktıları MCP yerel indirme dizini için indekslendi",
    "logLine": f"MCP yerel indirme hazır: {outputs_dir}",
    "logLevel": "info",
})

if AUTO_SYNC_TO_DRIVE:
    if Path("/content/drive/MyDrive").exists():
        send_telemetry({
            "stage": "backing_up_drive",
            "currentStepLabel": "Google Drive ek yedeği alınıyor...",
            "logLine": f"Drive ek yedeği kopyalanıyor -> {drive_backup}",
            "logLevel": "info",
        })
        drive_backup.mkdir(parents=True, exist_ok=True)
        shutil.copytree(outputs_dir, drive_backup / "latest_batch_run", dirs_exist_ok=True)
        print("[Drive Ek Yedek Tamam]", drive_backup / "latest_batch_run")
    else:
        print("[Bilgi] Drive bağlı değil; çıktılar MCP yerel indirme için hazır:", outputs_dir)
else:
    print("[Ayar] Google Drive yedeklemesi kapalı. Çıktılar yalnızca MCP ile yerele indirilir:", outputs_dir)

send_telemetry({
    "stage": "completed",
    "currentStepLabel": "Tüm ComfyUI Batch Queue tamamlandı",
    "logLine": "Batch Queue tamamlandı. Çıktılar yerel 05_outputs/renders/ klasörüne alınabilir.",
    "logLevel": "success",
})

if AUTO_UNASSIGN_ON_FINISH:
    try:
        from google.colab import runtime
        print("[Compute Unit Koruma] Tüm sahneler bitti, oturum kapatılıyor...")
        runtime.unassign()
    except ImportError:
        pass
`;

  const notebook = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      colab: {
        provenance: [],
        gpuType: 'A100',
        machine_shape: 'hm',
      },
      kernelspec: {
        display_name: 'Python 3',
        name: 'python3',
      },
      accelerator: 'GPU',
    },
    cells: [cell1, cell2, cell3, cell4, cell5, cell6].map((src) => ({
      cell_type: 'code',
      execution_count: null,
      metadata: {},
      outputs: [],
      source: splitLinesForNotebook(src),
    })),
  };

  return JSON.stringify(notebook, null, 2);
}

export function generateColabMcpServer(
  config: AutomationConfig,
  assets: ProjectAssetFile[]
): string {
  const activeCount = assets.filter((a) => a.included).length;
  return `"""
colab_mcp_server.py — ColabForge Yerel Klasör + ComfyUI MCP Kontrol + Çıktı İndirme Sunucusu
Resmi \`googlecolab/colab-mcp\` ile birlikte çalışır:
- \`google-colab\` MCP: list_runtimes, create_runtime (A100 + High-RAM), execute_code, open_notebook
- \`colabforge-local\` MCP (bu dosya): klasör tarama, ComfyUI /prompt /queue /free /interrupt MCP araçları, batch kuyruğu, yerel 05_outputs/renders/ çekme
Gereksinim: pip install mcp "huggingface_hub[hf_transfer]" hf_transfer pyyaml httpx
"""
import json
import os
import shutil
import urllib.request
from pathlib import Path
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("colabforge-local-orchestrator")

DEFAULT_WORKSPACE_ROOT = ${JSON.stringify(config.workspaceRoot)}
DRIVE_BACKUP_ENABLED_DEFAULT = ${config.autoSyncOutputsToDrive ? 'True' : 'False'}
DEFAULT_COMFY_URL = os.environ.get("COMFYUI_URL", ${JSON.stringify(config.comfyui.comfyMcpEndpoint)}).rstrip("/")
COMFY_CONTROL_MODE = os.environ.get("COMFYUI_CONTROL_MODE", ${JSON.stringify(config.comfyui.controlMode)})


def _comfy_request(endpoint: str, payload: dict | None = None) -> dict:
    url = f"{DEFAULT_COMFY_URL}{endpoint}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"Content-Type": "application/json"} if payload is not None else {}
    req = urllib.request.Request(url, data=data, headers=headers, method="POST" if payload is not None else "GET")
    with urllib.request.urlopen(req, timeout=10) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else {"ok": True}


@mcp.tool()
def comfy_get_system_stats() -> str:
    """ComfyUI sunucusunun VRAM, PyTorch sürümü ve aktif düğüm sağlığını kontrol eder (COMFYUI_URL üzerinden)."""
    try:
        stats = _comfy_request("/system_stats")
        return json.dumps({"ok": True, "control_mode": COMFY_CONTROL_MODE, "endpoint": DEFAULT_COMFY_URL, "stats": stats}, ensure_ascii=False, indent=2)
    except Exception as exc:
        return json.dumps({
            "ok": False,
            "control_mode": COMFY_CONTROL_MODE,
            "endpoint": DEFAULT_COMFY_URL,
            "error": str(exc),
            "hint": "in_vm_agent modundaysanız ComfyUI Colab VM içinde 127.0.0.1:8188 üzerinde çalışır; google-colab MCP execute_code ile sorgulayın.",
        }, ensure_ascii=False, indent=2)


@mcp.tool()
def comfy_get_queue_status() -> str:
    """ComfyUI bekleyen ve çalışan render kuyruğunu (/queue) döndürür."""
    try:
        q = _comfy_request("/queue")
        return json.dumps({"ok": True, "queue": q}, ensure_ascii=False, indent=2)
    except Exception as exc:
        return json.dumps({"ok": False, "error": str(exc)})


@mcp.tool()
def comfy_submit_workflow(workflow_json_path: str, prompt_override: str = "") -> str:
    """Projedeki comfyui_workflow_api.json dosyasını okur, varsa promptu günceller ve ComfyUI /prompt API'sine gönderir."""
    path = Path(workflow_json_path)
    if not path.exists():
        return json.dumps({"ok": False, "error": f"Workflow JSON bulunamadı: {workflow_json_path}"})
    wf = json.loads(path.read_text(encoding="utf-8"))
    if prompt_override.strip():
        for node in wf.values():
            if isinstance(node, dict) and node.get("class_type") == "CLIPTextEncode":
                node.setdefault("inputs", {})["text"] = prompt_override.strip()
    if COMFY_CONTROL_MODE == "in_vm_agent":
        return json.dumps({
            "ok": True,
            "mode": "in_vm_agent",
            "instruction": "google-colab MCP execute_code ile Colab içinde 127.0.0.1:${config.comfyui.comfyPort}/prompt adresine POST edin.",
            "workflow_payload": {"prompt": wf},
        }, ensure_ascii=False, indent=2)
    res = _comfy_request("/prompt", {"prompt": wf})
    return json.dumps({"ok": True, "mode": COMFY_CONTROL_MODE, "response": res}, ensure_ascii=False, indent=2)


@mcp.tool()
def comfy_free_vram(unload_models: bool = False) -> str:
    """ComfyUI VRAM önbelleğini temizlemek için POST /free uç noktasını çağırır."""
    try:
        res = _comfy_request("/free", {"unload_models": unload_models, "free_memory": True})
        return json.dumps({"ok": True, "result": res})
    except Exception as exc:
        return json.dumps({"ok": False, "error": str(exc)})


@mcp.tool()
def comfy_interrupt_render() -> str:
    """Çalışmakta olan ComfyUI render işlemini anında durdurur (/interrupt)."""
    try:
        res = _comfy_request("/interrupt", {})
        return json.dumps({"ok": True, "result": res})
    except Exception as exc:
        return json.dumps({"ok": False, "error": str(exc)})


@mcp.tool()
def comfy_install_model(
    model_id: str = "minimax-h3",
    target: str = "nvme",
    use_uv: bool = True,
    use_hf_transfer: bool = True,
) -> str:
    """MiniMax-H3, Wan 2.2 veya LTX 2.3 model kurulum komutunu (uv + HF_HUB_ENABLE_HF_TRANSFER=1) Colab NVMe veya Drive hedefi için döndürür."""
    repo_map = {
        "minimax-h3": "Comfy-Org/MiniMax-H3",
        "wan-2.2": "Comfy-Org/Wan_2.2_ComfyUI_Repackaged",
        "ltx-2.3": "Lightricks/LTX-2.3",
    }
    repo_id = repo_map.get(model_id, repo_map["minimax-h3"])
    dest = (
        f"/content/drive/MyDrive/${config.driveFolderName}/ComfyUI_Models/{model_id}"
        if target == "drive"
        else "${config.comfyui.comfyRootDir}/models"
    )
    return json.dumps({
        "ok": True,
        "model_id": model_id,
        "repo_id": repo_id,
        "target": target,
        "destination": dest,
        "env": {"HF_HUB_ENABLE_HF_TRANSFER": "1" if use_hf_transfer else "0"},
        "install_cmd": (
            'uv pip install --system -U "huggingface_hub[hf_transfer]" hf_transfer'
            if use_uv
            else 'pip -q install -U "huggingface_hub[hf_transfer]" hf_transfer'
        ),
    }, ensure_ascii=False, indent=2)


@mcp.tool()
def inspect_local_project_folder(folder_path: str) -> str:
    """Yerel klasördeki şema, prompt, ComfyUI workflow JSON, ayar, görsel/video ve Blender graybox dosyalarını tarar."""
    root = Path(folder_path)
    if not root.exists():
        return json.dumps({"ok": False, "error": f"Klasör bulunamadı: {folder_path}"})

    buckets = {
        "schema": [],
        "prompts": [],
        "comfyui_workflow": [],
        "settings": [],
        "blender_graybox": [],
        "reference_media": [],
    }
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        rel = str(path.relative_to(root)).lower()
        if any(k in rel for k in ["comfy", "workflow", "node_graph"]):
            buckets["comfyui_workflow"].append(str(path.relative_to(root)))
        elif any(k in rel for k in ["graybox", "greybox", "blender", "clay"]):
            buckets["blender_graybox"].append(str(path.relative_to(root)))
        elif "schema" in rel or "manifest" in rel:
            buckets["schema"].append(str(path.relative_to(root)))
        elif "prompt" in rel or rel.endswith(".txt"):
            buckets["prompts"].append(str(path.relative_to(root)))
        elif any(rel.endswith(ext) for ext in [".json", ".yaml", ".yml", ".toml", ".safetensors"]):
            buckets["settings"].append(str(path.relative_to(root)))
        elif any(rel.endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".mp4", ".mov"]):
            buckets["reference_media"].append(str(path.relative_to(root)))

    return json.dumps({"ok": True, "classified": buckets, "configured_assets": ${activeCount}}, ensure_ascii=False, indent=2)


@mcp.tool()
def evaluate_colab_gpu_policy(gpu_name: str, vram_gb: float, system_ram_gb: float, free_disk_gb: float) -> str:
    """Colab oturumu açıldığında A100 80GB/40GB + High-RAM politikasını kontrol eder; yanlış GPU gelirse kapatma komutu döndürür."""
    if system_ram_gb < ${config.minHighRamGb} and ${config.requireHighRam ? 'True' : 'False'}:
        return json.dumps({
            "action": "UNASSIGN_RUNTIME",
            "reason": f"High-RAM doğrulanamadı ({system_ram_gb} GB < ${config.minHighRamGb} GB).",
            "command": "from google.colab import runtime; runtime.unassign()",
        })
    if vram_gb >= 75:
        return json.dumps({
            "action": "PROCEED",
            "tier": "80GB",
            "repo_id": ${JSON.stringify(config.modelMatrix.repo80Gb)},
            "quant": ${JSON.stringify(config.modelMatrix.quant80Gb)},
        })
    if vram_gb >= 38:
        return json.dumps({
            "action": "PROCEED",
            "tier": "40GB",
            "repo_id": ${JSON.stringify(config.modelMatrix.repo40Gb)},
            "quant": ${JSON.stringify(config.modelMatrix.quant40Gb)},
        })
    return json.dumps({
        "action": "UNASSIGN_RUNTIME",
        "reason": f"Colab {gpu_name} ({vram_gb} GB VRAM) atadı; A100 politikasına uymadığı için kapatılıyor.",
        "command": "from google.colab import runtime; runtime.unassign()",
    })


@mcp.tool()
def get_batch_queue_manifest(manifest_path: str = "./batch_queue_manifest.json") -> str:
    """Tek 15 dakikalık Colab oturumunda sırayla işlenecek çoklu sahne Batch Queue listesini okur."""
    path = Path(manifest_path)
    if not path.exists():
        return json.dumps({"ok": False, "error": f"Batch manifest bulunamadı: {manifest_path}"})
    return path.read_text(encoding="utf-8")


@mcp.tool()
def pull_colab_outputs_to_local(
    source_outputs_dir: str,
    local_project_folder: str,
    drive_backup_dir: str = "",
    enable_drive_backup: bool = DRIVE_BACKUP_ENABLED_DEFAULT,
) -> str:
    """Colab çıktısındaki video ve görselleri doğrudan yerel 05_outputs/renders/ klasörüne indirir; ayar açıksa Drive ek yedeğini de alır."""
    src = Path(source_outputs_dir)
    dst = Path(local_project_folder) / "05_outputs" / "renders"
    dst.mkdir(parents=True, exist_ok=True)
    if not src.exists():
        return json.dumps({"ok": False, "error": f"Kaynak çıktı dizini bulunamadı: {source_outputs_dir}"})

    copied_files = []
    for item in src.rglob("*"):
        if item.is_file() and item.suffix.lower() in {".mp4", ".mov", ".webm", ".png", ".jpg", ".jpeg", ".json"}:
            rel = item.relative_to(src)
            target = dst / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, target)
            copied_files.append(str(target))

    backed_up = False
    if enable_drive_backup and drive_backup_dir.strip():
        drv = Path(drive_backup_dir.strip())
        drv.mkdir(parents=True, exist_ok=True)
        shutil.copytree(dst, drv / Path(local_project_folder).name, dirs_exist_ok=True)
        backed_up = True

    return json.dumps({
        "ok": True,
        "local_renders_dir": str(dst),
        "downloaded_count": len(copied_files),
        "files": copied_files,
        "drive_backup_written": backed_up,
    }, ensure_ascii=False, indent=2)


@mcp.tool()
def push_telemetry_event(
    telemetry_url: str,
    telemetry_token: str,
    stage: str,
    step_label: str,
    log_line: str = "",
    batch_index: int = 0,
    batch_total: int = 0,
) -> str:
    """ColabForge Canlı Telemetri Köprüsüne (/api/telemetry/ingest) anlık durum olayı gönderir."""
    payload = {
        "stage": stage,
        "currentStepLabel": step_label,
        "logLine": log_line or step_label,
        "batchIndex": batch_index,
        "batchTotal": batch_total,
    }
    req = urllib.request.Request(
        f"{telemetry_url.rstrip('/')}/api/telemetry/ingest",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-telemetry-token": telemetry_token,
        },
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        return resp.read().decode("utf-8")


@mcp.tool()
def read_project_feedback(project_folder: str) -> str:
    """Kullanıcının beğenmediği video çıktısı için yazdığı revizyon notlarını, ComfyUI workflow grafiğini ve mevcut ayarları okur."""
    root = Path(project_folder)
    feedback_file = root / "05_outputs" / "feedback_notes.json"
    settings_file = root / "03_settings" / "runtime_settings.json"
    workflow_file = root / "03_settings" / "comfyui_workflow_api.json"
    prompt_file = root / "02_prompts" / "master_prompt.txt"
    return json.dumps({
        "ok": True,
        "feedback": json.loads(feedback_file.read_text(encoding="utf-8")) if feedback_file.exists() else [],
        "comfyui_workflow_api": workflow_file.read_text(encoding="utf-8") if workflow_file.exists() else "",
        "runtime_settings": settings_file.read_text(encoding="utf-8") if settings_file.exists() else "",
        "master_prompt": prompt_file.read_text(encoding="utf-8") if prompt_file.exists() else "",
    }, ensure_ascii=False, indent=2)


@mcp.tool()
def update_project_file(project_folder: str, relative_target_path: str, new_content: str) -> str:
    """Claude'un revizyon sonrası yalnızca izinli proje alt dizinlerindeki prompt, ComfyUI workflow veya ayar dosyasını güncellemesini sağlar."""
    allowed_prefixes = ("02_prompts/", "03_settings/", "01_routing_manifest.json")
    clean_rel = relative_target_path.lstrip("/")
    if not clean_rel.startswith(allowed_prefixes):
        return json.dumps({"ok": False, "error": "Yalnızca 02_prompts, 03_settings veya manifest güncellenebilir."})
    target = (Path(project_folder) / clean_rel).resolve()
    if not str(target).startswith(str(Path(project_folder).resolve())):
        return json.dumps({"ok": False, "error": "Geçersiz dizin dışına çıkış engellendi."})
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(new_content, encoding="utf-8")
    return json.dumps({"ok": True, "updated": str(target)})


if __name__ == "__main__":
    mcp.run(transport="stdio")
`;
}

export function generateZeroCreditRunner(
  config: AutomationConfig,
  assets: ProjectAssetFile[]
): string {
  return `"""
local_zero_credit_runner.py — %100 Sıfır LLM Kredili Yerel Hazırlık Betiği
Claude kredisi harcamadan proje klasörünüzü ve Batch Queue manifestini doğrular.
"""
import shutil
import sys
from pathlib import Path

SOURCE_DIR = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("./project_input")
STAGING_DIR = Path("./colab_staging")


def main() -> None:
    if not SOURCE_DIR.exists():
        print(f"[Hata] Kaynak klasör yok: {SOURCE_DIR}")
        sys.exit(1)

    expected_files = ${JSON.stringify(assets.filter((a) => a.included).map((a) => a.relativePath))}
    staged = 0
    for rel in expected_files:
        src = SOURCE_DIR / rel
        if src.exists():
            dst = STAGING_DIR / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
            staged += 1
        else:
            print(f"[Uyarı] Klasörde eksik: {rel}")

    print(f"[Sıfır Kredi Hazırlık] {staged}/{len(expected_files)} dosya staging alanına alındı.")
    print("Artık googlecolab/colab-mcp (list_runtimes / create_runtime A100 High-RAM) veya .ipynb üzerinden çalıştırabilirsiniz.")


if __name__ == "__main__":
    main()
`;
}
