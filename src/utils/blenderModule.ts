import { BlenderRenderConfig } from '../types/automation';

export const DEFAULT_BLENDER_RENDER_CONFIG: BlenderRenderConfig = {
  enabled: true,
  autoDetectUnrenderedBlend: true,
  blenderVersion: '4.3.2',
  engine: 'CYCLES',
  device: 'OPTIX',
  samples: 64,
  outputMode: 'keyframes_only',
  frameStart: 1,
  frameEnd: 121,
};

export function buildBlenderRenderHelperPython(
  blenderConfig: BlenderRenderConfig,
  width: number,
  height: number
): string {
  return `"""
blender_render_helper.py — Colab A100 OptiX/CUDA Headless Blender Render Modülü
Ham .blend dosyasından Etsy/Sosyal Medya video üretimi için ilk/son kare veya graybox video üretir.
"""
import os
import sys
import bpy

OUTPUT_DIR = sys.argv[-1] if len(sys.argv) > 1 and not sys.argv[-1].endswith(".py") else "/content/blender_renders"
ENGINE = ${JSON.stringify(blenderConfig.engine)}
DEVICE = ${JSON.stringify(blenderConfig.device)}
SAMPLES = ${Math.max(8, Math.min(512, blenderConfig.samples))}
OUTPUT_MODE = ${JSON.stringify(blenderConfig.outputMode)}
FRAME_START = ${Math.max(1, blenderConfig.frameStart)}
FRAME_END = ${Math.max(blenderConfig.frameStart + 1, blenderConfig.frameEnd)}
RES_X = ${Math.max(256, width)}
RES_Y = ${Math.max(256, height)}

os.makedirs(OUTPUT_DIR, exist_ok=True)
scene = bpy.context.scene
scene.render.engine = ENGINE
scene.render.resolution_x = RES_X
scene.render.resolution_y = RES_Y
scene.render.resolution_percentage = 100
scene.frame_start = FRAME_START
scene.frame_end = FRAME_END

# Gömülü olmayan harici dokuları kontrol et (Pack Resources uyarısı)
missing_imgs = [img.filepath for img in bpy.data.images if img.source == 'FILE' and not img.packed_file and not os.path.exists(bpy.path.abspath(img.filepath))]
if missing_imgs:
    print(f"[Blender Uyarı] Gömülü olmayan {len(missing_imgs)} harici doku bulundu: {missing_imgs[:3]}")

if ENGINE == "CYCLES":
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    prefs = bpy.context.preferences.addons.get("cycles")
    if prefs:
        cprefs = prefs.preferences
        for dev_type in ([DEVICE, "CUDA"] if DEVICE == "OPTIX" else ["CUDA", "OPTIX"]):
            try:
                cprefs.compute_device_type = dev_type
                cprefs.get_devices()
                gpu_devs = [d for d in cprefs.devices if d.type != "CPU"]
                if gpu_devs:
                    for d in cprefs.devices:
                        d.use = (d.type != "CPU")
                    scene.cycles.device = "GPU"
                    print(f"[Blender GPU] Cycles {dev_type} aktif ({len(gpu_devs)} GPU)")
                    break
            except Exception:
                continue

if OUTPUT_MODE == "clay_depth_pass":
    clay_mat = bpy.data.materials.new(name="ColabForge_Clay")
    clay_mat.use_nodes = True
    bsdf = clay_mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.68, 0.68, 0.7, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.55
    for view_layer in scene.view_layers:
        view_layer.material_override = clay_mat
        view_layer.use_pass_z = True

# 1. Her modda ilk kare ve son kare referanslarını PNG olarak çıkar
scene.render.image_settings.file_format = "PNG"
scene.frame_set(FRAME_START)
scene.render.filepath = os.path.join(OUTPUT_DIR, "first_frame_blender.png")
bpy.ops.render.render(write_still=True)

scene.frame_set(FRAME_END)
scene.render.filepath = os.path.join(OUTPUT_DIR, "last_frame_blender.png")
bpy.ops.render.render(write_still=True)

# 2. Tam animasyon veya clay/depth isteniyorsa MP4 çıkar
if OUTPUT_MODE in ("full_animation", "clay_depth_pass"):
    scene.render.image_settings.file_format = "FFMPEG"
    scene.render.ffmpeg.format = "MPEG4"
    scene.render.ffmpeg.codec = "H264"
    scene.render.ffmpeg.constant_rate_factor = "HIGH"
    scene.render.filepath = os.path.join(OUTPUT_DIR, "cam01_graybox_anim.mp4")
    bpy.ops.render.render(animation=True)

print("[Blender Tamamlandı] Çıktılar:", os.listdir(OUTPUT_DIR))
`;
}

export function buildBlenderColabStagePython(
  blenderConfig: BlenderRenderConfig,
  width: number,
  height: number
): string {
  const helperPy = buildBlenderRenderHelperPython(blenderConfig, width, height);
  const ver = blenderConfig.blenderVersion || '4.3.2';
  const majorMinor = ver.split('.').slice(0, 2).join('.');
  const tarballUrl = `https://download.blender.org/release/Blender${majorMinor}/blender-${ver}-linux-x64.tar.xz`;

  return `
BLENDER_MODULE_ENABLED = ${blenderConfig.enabled ? 'True' : 'False'}
BLENDER_AUTO_DETECT = ${blenderConfig.autoDetectUnrenderedBlend ? 'True' : 'False'}
BLENDER_TARBALL_URL = ${JSON.stringify(tarballUrl)}
BLENDER_BIN = Path("/content/blender/blender")
BLENDER_OUT_DIR = WORKSPACE_ROOT / "blender_renders"

blend_files = [
    item for item in MANIFEST.get("files", [])
    if item["name"].lower().endswith((".blend", ".blend1"))
]
already_prerendered = any(
    item["kind"] == "blender_graybox" and item["name"].lower().endswith((".mp4", ".mov", ".webm"))
    for item in MANIFEST.get("files", [])
)

should_run_blender = bool(
    BLENDER_MODULE_ENABLED
    and blend_files
    and (not BLENDER_AUTO_DETECT or not already_prerendered)
)

if should_run_blender:
    if not BLENDER_BIN.exists():
        send_telemetry({
            "stage": "injecting",
            "currentStepLabel": "Colab Blender ${ver} (OptiX) indiriliyor...",
            "logLine": "Ham .blend algılandı -> Blender ${ver} headless kurulumu başlıyor",
            "logLevel": "info",
        })
        subprocess.run(["wget", "-q", BLENDER_TARBALL_URL, "-O", "/tmp/blender.tar.xz"], check=True)
        Path("/content/blender").mkdir(parents=True, exist_ok=True)
        subprocess.run(["tar", "-xf", "/tmp/blender.tar.xz", "-C", "/content/blender", "--strip-components=1"], check=True)

    helper_script_path = WORKSPACE_ROOT / "blender_render_helper.py"
    helper_script_path.write_text(${JSON.stringify(helperPy)}, encoding="utf-8")

    for bf in blend_files:
        blend_path = Path(bf["colab_target_path"])
        if not blend_path.exists():
            continue
        send_telemetry({
            "stage": "injecting",
            "currentStepLabel": f"Blender GPU Render (${blenderConfig.engine}/${blenderConfig.device}): {bf['name']}",
            "logLine": f"Blender render çalışıyor: {blend_path.name} (${blenderConfig.outputMode})",
            "logLevel": "info",
        })
        BLENDER_OUT_DIR.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            [str(BLENDER_BIN), "-b", str(blend_path), "-P", str(helper_script_path), "--", str(BLENDER_OUT_DIR)],
            check=True,
        )
        for produced in BLENDER_OUT_DIR.glob("*"):
            if produced.is_file():
                shutil.copy2(produced, COMFY_ROOT / "input" / produced.name)
                shutil.copy2(produced, COMFY_ROOT / "input/blender_graybox" / produced.name)
        send_telemetry({
            "stage": "injecting",
            "currentStepLabel": f"Blender render bitti -> ComfyUI input güncellendi ({bf['name']})",
            "logLine": f"Blender çıktıları ComfyUI/input/ içerisine aktarıldı: {[p.name for p in BLENDER_OUT_DIR.glob('*')]}",
            "logLevel": "success",
        })
else:
    print("[Blender Atlandı] Sahne zaten renderlanmış veya .blend dosyası yok; doğrudan ComfyUI aşamasına geçiliyor.")
`;
}
