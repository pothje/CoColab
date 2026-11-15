import {
  AuditFinding,
  AutomationConfig,
  BatchQueueItem,
  ColabProject,
  GpuProfileSpec,
  OnboardingState,
} from '../types/automation';
import { classifyProjectFiles } from '../utils/guardrailEngine';

export const INITIAL_ONBOARDING_STATE: OnboardingState = {
  colabPlanConfirmed: false,
  hfAccountReady: false,
  hfTokenVerified: false,
  mcpInstalledConfirmed: false,
  preferredOs: 'windows',
};

export const INITIAL_AUDIT_FINDINGS: AuditFinding[] = [
  {
    id: 'comfyui-minimax-h3-engine',
    title: 'MiniMax H3 Kurulumu & Çalıştırılması İçin Başsız ComfyUI Motoru + API Grafiği',
    category: 'kritik_hata',
    affectedStep: 'ComfyUI Runtime & MiniMax H3 Ağırlık Yerleşimi',
    problem:
      'MiniMax H3 (`Comfy-Org/MiniMax-H3`), tek parça bir Python scripti değil ComfyUI düğüm grafiği üzerinden çalışan modüler bir mimaridir (`diffusion_models/`, `text_encoders/`, `vae/`, `loras/`, `input/`). ComfyUI kurulmadan ve ağırlıklar ilgili ComfyUI alt klasörlerine indirilmeden model çalışmaz.',
    solution:
      'Otomasyona tam başsız ComfyUI kurulumu (`ComfyUI` + `ComfyUI-VideoHelperSuite` + `--listen 127.0.0.1 --port 8188`), `Comfy-Org/MiniMax-H3` ağırlıklarının 80GB/40GB varyantlarına göre ComfyUI klasörlerine indirilmesi ve `/prompt` HTTP API üzerinden toplu render döngüsü entegre edildi.',
    codeImpactLabel: 'ComfyUI + Comfy-Org/MiniMax-H3 API',
    enabledInExport: true,
  },
  {
    id: 'official-colab-mcp-bridge',
    title: 'Selenium/Playwright Yerine Resmi `googlecolab/colab-mcp` + High-RAM A100 Bağlantısı',
    category: 'kritik_hata',
    affectedStep: 'Colab Uzaktan Kontrol & Oturum Açma',
    problem:
      'Tarayıcı botlarıyla Colab arayüzüne tıklatmak CAPTCHA, oturum kopması ve hesap kısıtlaması riski taşır. Colab MCP (`colaboratory.googleapis.com/mcp`) üzerinden doğrudan uzaktan oturum ve hücre yönetimi yapılmalıdır.',
    solution:
      'Kurulum ve Claude konfigürasyonuna resmi `googlecolab/colab-mcp` (`list_runtimes`, `create_runtime`, `execute_code`) entegre edildi. Notebook `gpuType: A100` + `machine_shape: hm` (High-RAM) metaverisiyle açılır; Playwright/Selenium kullanılmaz.',
    codeImpactLabel: 'googlecolab/colab-mcp + High-RAM',
    enabledInExport: true,
  },
  {
    id: 'gpu-a100-downgrade',
    title: 'Colab A100 High-RAM Bulamazsa Başka GPU’ya Atar — Anında `runtime.unassign()` Koruması',
    category: 'kritik_hata',
    affectedStep: 'Colab Runtime Guardrail',
    problem:
      'Colab, `A100` + `High-RAM` istense bile yoğunluk anlarında kullanıcıyı sessizce L4 (24 GB), T4 (16 GB) veya Standart RAM makinesine yönlendirebilir. Fark edilmezse Compute Unit yanmaya devam eder.',
    solution:
      'Hücre 1 `nvidia-smi` ile VRAM kovasını (≥75 GB A100 80GB veya ≥38 GB A100 40GB) ve `/proc/meminfo` ile High-RAM (≥50 GB) durumunu doğrular; uyumsuzlukta `google.colab.runtime.unassign()` ile oturumu anında kapatır.',
    codeImpactLabel: 'A100 + High-RAM Kill-Switch',
    enabledInExport: true,
  },
  {
    id: 'mcp-local-primary-drive-backup',
    title: 'Çıktıları MCP ile Doğrudan Yerele İndirme & Açılır/Kapanır Google Drive Yedeği',
    category: 'yeni_ozellik',
    affectedStep: 'Üretilen Video/Görsel Depolama',
    problem:
      'Çıktıları yalnızca Google Drive üzerinden geri okumak hem scope sınırlamasına takılır hem de büyük .mp4 dosyaları için gereksiz gecikme yaratır.',
    solution:
      'En başta Google Drive OAuth izni alınır; ancak birincil çıktı indirme kanalı MCP üzerinden doğrudan yerel `05_outputs/renders/` klasörüdür. Google Drive yedeklemesi ise Ayarlar’dan tek anahtarla açılıp kapatılabilir.',
    codeImpactLabel: 'MCP Yerel İndirme + Drive Toggle',
    enabledInExport: true,
  },
  {
    id: 'batch-queue-amortization',
    title: '15 Dakikalık Oturum Kurulumunu Tek Seferde Kullanmak İçin Çoklu Sahne Batch Queue',
    category: 'optimizasyon',
    affectedStep: 'Toplu Proje & Sahne Sıralama',
    problem:
      'Her yeni Colab oturumunda ComfyUI kurulumu ve MiniMax H3 ağırlık indirmesi ~15 dakika sürer. Her sahne/proje için ayrı oturum açmak hem zamanı hem Compute Unit kredilerini katlar.',
    solution:
      'Projeleri ve sahneleri sıraya alan Çoklu Sahne Batch Queue eklendi. ComfyUI ve ağırlıklar 1 kez ayağa kalkar, `batch_queue_manifest.json` içindeki tüm sahneler art arda `/prompt` API’sine gönderilir.',
    codeImpactLabel: 'Batch Queue Loop + Tek Kurulum',
    enabledInExport: true,
  },
  {
    id: 'live-telemetry-bridge',
    title: 'Colab Canlı Telemetri Köprüsü (WebSocket + HTTP Ingest)',
    category: 'yeni_ozellik',
    affectedStep: 'Gerçek Zamanlı GPU & Kuyruk İzleme',
    problem:
      '15 dakikalık hazırlık ve toplu sahne render sürecinde Colab sekmesine sürekli bakmadan VRAM, sistem RAM’i, ComfyUI düğüm durumu ve hangi sahnenin işlendiği izlenemiyordu.',
    solution:
      'Sunucu tabanlı `/ws/telemetry` WebSocket + `/api/telemetry/ingest` canlı telemetri köprüsü kuruldu. Üretilen `.ipynb` defteri her adımda anlık GPU, RAM, disk ve ComfyUI ilerlemesini doğrudan masaüstü arayüze aktarır.',
    codeImpactLabel: 'WebSocket Canlı Telemetri',
    enabledInExport: true,
  },
  {
    id: 'five-ten-min-boot-budget',
    title: '`hf_transfer` + Seçici Dosya İndirme ile ComfyUI Kurulum Süresini Kısaltma',
    category: 'optimizasyon',
    affectedStep: 'Her Oturumda Model İndirme',
    problem:
      'MiniMax H3 diffusion + Qwen3-VL-32B text encoder + Video/Audio VAE dosyalarının standart indiriciyle çekilmesi 25+ dakikaya çıkarabilir.',
    solution:
      'HF_HUB_ENABLE_HF_TRANSFER=1 (5x–10x hızlı indirme) ve yalnızca aktif GPU kademesine (80GB INT8 vs 40GB NVFP4) uygun safetensors dosyaları çekilerek gereksiz varyantlar dışlanır.',
    codeImpactLabel: 'hf_transfer + Seçici Varyant',
    enabledInExport: true,
  },
  {
    id: 'claude-routing-manifest',
    title: 'Claude İçin `01_routing_manifest.json`, ComfyUI API JSON ve `SKILL.md` Sözleşmesi',
    category: 'yeni_ozellik',
    affectedStep: 'Claude Skill & Klasör Hiyerarşisi',
    problem:
      'Claude proje klasörüne prompt, ComfyUI workflow JSON ve Blender graybox eklerken kesin kurallar verilmezse dosya adları ve ComfyUI düğüm ID’leri şaşabilir.',
    solution:
      'Her proje klasöründe `01_routing_manifest.json` ve `comfyui_workflow_api.json` zorunlu tutulur; Claude’a hem `google-colab` MCP hem de `colabforge-local` MCP araçlarını tanımlayan evrensel `SKILL.md` sunulur.',
    codeImpactLabel: 'Claude SKILL.md + ComfyUI Yolu',
    enabledInExport: true,
  },
  {
    id: 'video-revision-loop',
    title: 'Video Çıktılarını İzleme, Not Düşme ve Claude ile "Yeniden Değerlendir" Döngüsü',
    category: 'yeni_ozellik',
    verdict: 'uygulandi',
    affectedStep: 'Kalite Kontrol & İterasyon',
    problem:
      'Üretilen videoda beğenilmeyen bir detay olduğunda hatayı manuel olarak prompt, ComfyUI sampler ayarları ve Blender graybox ağırlıklarına geri çevirmek zaman alır.',
    solution:
      'Her çıktının altına revizyon notu eklenir. "Yeniden Değerlendir" düğmesi mevcut ComfyUI workflow ayarlarını, promptu, graybox ağırlığını ve notu birleştirip Claude MCP için revizyon özeti oluşturur.',
    codeImpactLabel: 'Revizyon Notu & Claude Yetkilendirme',
    enabledInExport: true,
  },
  {
    id: 'constraints-uv-sageattention',
    title: 'uv + Torch/NumPy Constraints Kilidi, ComfyUI-KJNodes ve SageAttention Ön Ayarı',
    category: 'kritik_hata',
    verdict: 'uygulandi',
    affectedStep: 'Hücre 2: Eklenti Kurulumu & CUDA Kararlılığı',
    problem:
      'Custom node bağımlılıkları pip ile 4–5 dakika sürer ve sıkça Colab’ın CUDA uyumlu PyTorch/NumPy sürümünü ezerek (NumPy 2.x hatası) tüm ComfyUI oturumunu bozar.',
    solution:
      'Kurulumdan önce mevcut torch ve numpy sürümleri `/tmp/constraints.txt` içine kilitlenir; `uv pip install --system -c /tmp/constraints.txt` ile VideoHelperSuite, KJNodes, Manager ve `sageattention` (~%25-35 hız artışı) 20 saniyede güvenli kurulur.',
    codeImpactLabel: 'uv + constraints.txt + SageAttention',
    enabledInExport: true,
  },
  {
    id: 'vaedecode-tiled-highram',
    title: '%99 Aşamasında Sessiz SIGKILL (Exit 137) Önleyici: High-RAM + VAEDecodeTiled (512px)',
    category: 'kritik_hata',
    verdict: 'uygulandi',
    affectedStep: 'Hücre 5: VAE Decode & Bellek Yönetimi',
    problem:
      'Difüzyon bitse bile 81–121 karelik latent verisini MP4 karesine çözen standart VAEDecode, RAM/VRAM zirvesiyle 12.7 GB standart Colab makinelerini veya VRAM sınırını aniden taşırıp oturumu öldürür.',
    solution:
      'Oturum `high_ram=True` (≥50 GB RAM) ile başlatılır ve Hücre 5 çalıştırma öncesi workflow içindeki tüm `VAEDecode` düğümlerini otomatik olarak `VAEDecodeTiled` (`tile_size=512`, zamansal örtüşmeli) düğümüne dönüştürür.',
    codeImpactLabel: 'High-RAM + Auto VAEDecodeTiled',
    enabledInExport: true,
  },
  {
    id: 'ws-watchdog-deadman-vram-free',
    title: 'WebSocket /ws Watchdog, Dead-Man’s Switch (Kill Timer) ve Periyodik POST /free',
    category: 'optimizasyon',
    verdict: 'uygulandi',
    affectedStep: 'Hücre 1 & 5: Zombi Oturum & Polling Koruması',
    problem:
      'Sadece `/history` sorgulayan scriptler düğüm hatasında sonsuza dek bekler; internet koparsa oturum açık kalıp Compute Unit yakar; arka arkaya videolarda PyTorch VRAM önbelleği şişer.',
    solution:
      'Hücre 1’de Dead-Man’s Switch (`sleep 7200 && kill 1`) kurulur. Hücre 5 `ws://127.0.0.1:8188/ws` üzerinden canlı ilerleme/hata dinler (120 sn stall koruması) ve her 5 videoda `POST /free` çağırır.',
    codeImpactLabel: 'WS /ws Watchdog + Kill-Switch + /free',
    enabledInExport: true,
  },
  {
    id: 'comfyui-vs-wan2gp-in-vm-agent',
    title: 'Mimari Karar: Wan2GP Yerine Başsız ComfyUI JSON API + Tünel Yerine VM-İçi Ajan',
    category: 'yeni_ozellik',
    verdict: 'uygulandi',
    affectedStep: 'ComfyUI MCP & Uzaktan Kontrol Mimarisi',
    problem:
      'Wan2GP Gradio odaklıdır ve T4/küçük kartlarda offloading için iyidir ancak saf JSON API otomasyonu zayıftır. Dışa açılan ngrok/trycloudflare tünelleri ise render ortasında kopabilir.',
    solution:
      'ComfyUI `/prompt`, `/history`, `/ws`, `/free` JSON API’si standart seçildi. Varsayılan MCP modu ComfyUI’yi dışa açmadan `127.0.0.1:8188` üzerinde VM-içi ajanla çalıştırır; istenirse Doğrudan ComfyUI MCP ucu da açılabilir.',
    codeImpactLabel: 'ComfyUI API + In-VM Agent MCP',
    enabledInExport: true,
  },
  {
    id: 'nvme-hf-transfer-vs-drive-symlink',
    title: 'Drive Symlink Yerine 3 Katmanlı NVMe + hf_transfer Model İndirme (Errno 5 Koruması)',
    category: 'optimizasyon',
    verdict: 'reddedildi',
    affectedStep: 'Hücre 3: Depolama Hiyerarşisi',
    problem:
      '20–68 GB model ağırlıklarını Google Drive’a koyup `ln -s` ile Drive FUSE üzerinden okumak büyük dosyalarda `Errno 5` I/O hatalarına ve API hız limitlerine takılır.',
    solution:
      'Büyük checkpoint’ler için Drive Symlink REDDEDİLDİ. Bunun yerine Colab veri merkezi omurgasından `HF_HUB_ENABLE_HF_TRANSFER=1` ile doğrudan `/content` yerel NVMe diskine (~35–45 sn) indirilir; Drive yalnızca opsiyonel çıktı yedeği ve küçük LoRA’lar içindir.',
    codeImpactLabel: 'NVMe + hf_transfer (Drive Symlink Yerine)',
    enabledInExport: true,
  },
  {
    id: 'turbo-lora-teacache-preset',
    title: 'Koşullu Hız Ön Ayarı: 8-Step Turbo LoRA + TeaCache Düğüm Enjeksiyonu',
    category: 'optimizasyon',
    verdict: 'kosullu',
    affectedStep: 'Hücre 5: Opsiyonel Hızlı Örnekleme',
    problem:
      'A100 (40GB) üzerinde 25–36 adımlı standart üretim 25–30 dk sürebilir; ancak sistemde mevcut olmayan bir Turbo LoRA dosyasını varsayılan zorlamak ComfyUI grafiğini çökertebilir.',
    solution:
      'Ayarlar paneline koşullu TeaCache + 8-Step Turbo LoRA ön ayarı eklendi. Kullanıcı ComfyUI/models/loras/ içinde uyumlu Turbo LoRA bulundurduğunda ve anahtarı açtığında workflow otomatik olarak 8 adıma + TeaCache’e uyarlanır (6–8 dk).',
    codeImpactLabel: 'Koşullu TeaCache + 8-Step LoRA',
    enabledInExport: true,
  },
];

export const GPU_SIMULATION_PRESETS: GpuProfileSpec[] = [
  {
    id: 'a100-80',
    label: 'NVIDIA A100 80GB · High-RAM',
    nvidiaSmiName: 'NVIDIA A100-SXM4-80GB',
    vramGb: 80,
    systemRamGb: 167,
    diskFreeGb: 235,
    cudaVersion: '12.4',
  },
  {
    id: 'a100-40',
    label: 'NVIDIA A100 40GB · High-RAM',
    nvidiaSmiName: 'NVIDIA A100-SXM4-40GB',
    vramGb: 40,
    systemRamGb: 83.5,
    diskFreeGb: 166,
    cudaVersion: '12.4',
  },
  {
    id: 'l4-24',
    label: 'NVIDIA L4 24GB (Oto-Yönlendirme)',
    nvidiaSmiName: 'NVIDIA L4',
    vramGb: 24,
    systemRamGb: 53,
    diskFreeGb: 112,
    cudaVersion: '12.4',
  },
  {
    id: 't4-16',
    label: 'Tesla T4 16GB (Düşük RAM / Uyumsuz)',
    nvidiaSmiName: 'Tesla T4',
    vramGb: 16,
    systemRamGb: 12.7,
    diskFreeGb: 78,
    cudaVersion: '12.2',
  },
];

export const DEFAULT_AUTOMATION_CONFIG: AutomationConfig = {
  workspaceRoot: '/content/minimax_h3_workspace',
  driveFolderName: 'ColabForge_Projects',
  driveBackupDir: '/content/drive/MyDrive/ColabForge_Projects/outputs',
  minDiskFreeGb: 65,
  requireHighRam: true,
  minHighRamGb: 50,
  strictKillOnMismatch: true,
  autoUnassignOnFinish: true,
  enableHfTransfer: true,
  localOutputPrimary: true,
  autoSyncOutputsToDrive: true,
  setupMinutesEstimate: 15,
  webhookNotifyOnFailure: false,
  webhookUrlPlaceholder: '',
  hfTokenEnvVar: 'HF_TOKEN',
  modelMatrix: {
    repo80Gb: 'Comfy-Org/MiniMax-H3',
    quant80Gb: 'int8_convrot + bf16_text_encoder (ComfyUI High-VRAM)',
    repo40Gb: 'Comfy-Org/MiniMax-H3',
    quant40Gb: 'pruned_int8 + nvfp4_awq_qwen3vl (ComfyUI Offload)',
    allow24GbFallback: false,
    repo24Gb: 'Comfy-Org/MiniMax-H3',
    quant24Gb: 'nvfp4_awq + sequential_cpu_offload',
  },
  comfyui: {
    installComfyUi: true,
    comfyRepoUrl: 'https://github.com/comfyanonymous/ComfyUI.git',
    comfyRootDir: '/content/minimax_h3_workspace/ComfyUI',
    comfyPort: 8188,
    enableManager: true,
    enableVideoHelperSuite: true,
    enableKjNodes: true,
    enableSageAttention: true,
    enableUvInstaller: true,
    pinTorchNumpyConstraints: true,
    enableTeaCache: false,
    enableTurboLora: false,
    turboLoraFile: 'minimax_h3_8step_turbo_lora.safetensors',
    turboSteps: 8,
    useTiledVaeDecode: true,
    vaeTileSize: 512,
    freeMemoryEveryNVideos: 5,
    wsStallTimeoutSec: 120,
    deadManSwitchMinutes: 120,
    controlMode: 'in_vm_agent',
    comfyMcpEndpoint: 'http://127.0.0.1:8188',
    headlessFlags: '--listen 127.0.0.1 --port 8188 --highvram --preview-method none',
    diffusionModel80Gb: 'diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors',
    diffusionModel40Gb: 'diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors',
    textEncoder80Gb: 'text_encoders/qwen3vl_32b_minimax_h3_int8_convrot.safetensors',
    textEncoder40Gb: 'text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
    videoVaeFile: 'vae/minimax_h3_video_vae_int8_convrot.safetensors',
    audioVaeFile: 'vae/minimax_h3_audio_vae_fp32.safetensors',
  },
  modelInstaller: {
    selectedModelId: 'minimax-h3',
    installTarget: 'nvme',
    selectedVariants: {
      'minimax-h3': 'balanced_40gb',
      'wan-2.2': 'balanced_40gb',
      'ltx-2.3': 'balanced_40gb',
    },
    useUvAcceleration: true,
    installRecommendedNodes: true,
    createDriveSymlinks: true,
    installedModels: {},
  },
  batchSchedule: {
    enabled: false,
    mode: 'time',
    scheduledDate: '2026-11-15',
    scheduledTime: '02:00',
    recurrence: 'daily',
    maxVramLoadPct: 35,
    maxRamLoadPct: 60,
    loadSource: 'simulated',
    simulatedLoadPct: 68,
    lastTriggeredAt: null,
    lastTriggerReason: null,
  },
};

export const SAMPLE_PROJECT_FILES_SEED = [
  {
    name: '01_routing_manifest.json',
    relativePath: '01_routing_manifest.json',
    sizeBytes: 1940,
    mimeType: 'application/json',
    previewText: `{
  "schema_version": "2.2",
  "engine": "ComfyUI",
  "pipeline_target": "Comfy-Org/MiniMax-H3",
  "routes": {
    "prompts": "02_prompts/",
    "settings": "03_settings/",
    "comfyui_workflow": "03_settings/comfyui_workflow_api.json",
    "blender_graybox": "04_assets/blender_graybox/",
    "references": "04_assets/references/",
    "outputs": "05_outputs/renders/"
  }
}`,
  },
  {
    name: 'comfyui_workflow_api.json',
    relativePath: '03_settings/comfyui_workflow_api.json',
    sizeBytes: 4210,
    mimeType: 'application/json',
    previewText: `{
  "1": {
    "class_type": "UNETLoader",
    "inputs": {
      "unet_name": "minimax_h3_fl2va_pruned_int8_convrot.safetensors",
      "weight_dtype": "default"
    }
  },
  "2": {
    "class_type": "CLIPLoader",
    "inputs": {
      "clip_name": "qwen3vl_32b_minimax_h3_int8_convrot.safetensors",
      "type": "minimax_h3"
    }
  },
  "3": {
    "class_type": "VAELoader",
    "inputs": {
      "vae_name": "minimax_h3_video_vae_int8_convrot.safetensors"
    }
  },
  "4": {
    "class_type": "LoadVideo",
    "inputs": {
      "file": "cam01_graybox_anim.mp4"
    }
  },
  "5": {
    "class_type": "CLIPTextEncode",
    "inputs": {
      "text": "@master_prompt.txt",
      "clip": ["2", 0]
    }
  },
  "6": {
    "class_type": "VAEDecodeTiled",
    "inputs": {
      "tile_size": 512,
      "overlap": 64,
      "temporal_size": 64,
      "temporal_overlap": 8,
      "vae": ["3", 0]
    }
  },
  "7": {
    "class_type": "VHS_VideoCombine",
    "inputs": {
      "frame_rate": 24,
      "format": "video/h264-mp4",
      "filename_prefix": "MiniMaxH3_Render"
    }
  }
}`,
  },
  {
    name: 'system_schema.json',
    relativePath: '03_settings/system_schema.json',
    sizeBytes: 3420,
    mimeType: 'application/json',
    previewText: `{
  "pipeline": "comfyui_minimax_h3_graybox_to_final",
  "version": "2.2.0",
  "stages": ["preflight_gpu_guard", "install_comfyui", "fetch_minimax_h3_weights", "queue_comfy_prompt", "pull_renders_local"],
  "conditioning": {
    "blender_graybox_weight": 0.82,
    "temporal_consistency": "high"
  }
}`,
  },
  {
    name: 'master_prompt.txt',
    relativePath: '02_prompts/master_prompt.txt',
    sizeBytes: 1280,
    mimeType: 'text/plain',
    previewText:
      'Architectural interior flythrough matching Blender graybox camera path, natural overcast daylight, brushed concrete and warm oak textures, 24fps cinematic motion, zero geometry drift.',
  },
  {
    name: 'negative_prompt.txt',
    relativePath: '02_prompts/negative_prompt.txt',
    sizeBytes: 540,
    mimeType: 'text/plain',
    previewText:
      'flicker, warped walls, melted furniture, watermark, oversaturated neon, camera jitter',
  },
  {
    name: 'runtime_settings.json',
    relativePath: '03_settings/runtime_settings.json',
    sizeBytes: 1890,
    mimeType: 'application/json',
    previewText: `{
  "comfyui_endpoint": "http://127.0.0.1:8188",
  "resolution": "1280x720",
  "num_frames": 121,
  "fps": 24,
  "guidance_scale": 6.5,
  "num_inference_steps": 36,
  "seed": 42091
}`,
  },
  {
    name: 'finetune_lora.yaml',
    relativePath: '03_settings/finetune_lora.yaml',
    sizeBytes: 960,
    mimeType: 'text/yaml',
    previewText: `target_comfy_dir: models/loras
lora_strength_model: 0.78
lora_strength_clip: 0.65
lora_rank: 32
mixed_precision: bf16`,
  },
  {
    name: 'style_ref_lobby.png',
    relativePath: '04_assets/references/style_ref_lobby.png',
    sizeBytes: 2480120,
    mimeType: 'image/png',
    previewText: 'Referans stil görseli · 1920x1080 PNG · ComfyUI/input/style_ref_lobby.png',
  },
  {
    name: 'motion_ref_pan.mp4',
    relativePath: '04_assets/references/motion_ref_pan.mp4',
    sizeBytes: 14820400,
    mimeType: 'video/mp4',
    previewText: 'Referans hareket videosu · 24fps 5.0s MP4 · ComfyUI/input/motion_ref_pan.mp4',
  },
  {
    name: 'cam01_graybox_clay.png',
    relativePath: '04_assets/blender_graybox/cam01_graybox_clay.png',
    sizeBytes: 1840500,
    mimeType: 'image/png',
    previewText: 'Blender graybox ilk kare clay referansı · ComfyUI/input/cam01_graybox_clay.png',
  },
  {
    name: 'cam01_graybox_anim.mp4',
    relativePath: '04_assets/blender_graybox/cam01_graybox_anim.mp4',
    sizeBytes: 19240100,
    mimeType: 'video/mp4',
    previewText: 'Blender graybox kamera animasyonu (depth/clay) · ComfyUI/input/cam01_graybox_anim.mp4',
  },
];

export function createInitialProjects(workspaceRoot: string): ColabProject[] {
  return [
    {
      id: 'proj-mimari-graybox',
      name: 'Mimari İç Mekan Graybox',
      description:
        'ComfyUI + MiniMax H3 grafiği üzerinde Blender clay kamera animasyonu ve stil referansıyla 720p 24fps iç mekan flythrough sahnesi.',
      updatedAt: '2026-11-14',
      targetGpuPolicy: '80GB_OR_40GB',
      assets: classifyProjectFiles(SAMPLE_PROJECT_FILES_SEED, workspaceRoot),
      outputs: [
        {
          id: 'out-render-01',
          title: 'Sahne 01 — Lobi Kamera Geçişi (v1)',
          fileName: 'render_cam01_v1.mp4',
          relativeOutputPath: '05_outputs/renders/render_cam01_v1.mp4',
          createdAt: '2026-11-14 13:10',
          gpuUsed: 'A100 80GB',
          durationSec: 5.0,
          resolution: '1280x720',
          status: 'tamamlandi',
          mimeType: 'video/mp4',
          notes: [],
        },
      ],
    },
    {
      id: 'proj-urun-studyo',
      name: 'Ürün Stüdyo Turu (40GB Mod)',
      description:
        'ComfyUI INT8 + NVFP4 offload ile 360 derece Blender turntable graybox koşullandırmalı tanıtım klibi.',
      updatedAt: '2026-11-13',
      targetGpuPolicy: '80GB_OR_40GB',
      assets: classifyProjectFiles(
        SAMPLE_PROJECT_FILES_SEED.slice(0, 8),
        workspaceRoot
      ),
      outputs: [],
    },
    {
      id: 'proj-vitrin-sahne',
      name: 'Konsept Vitrin Kamera Geçişi',
      description:
        'Doğal gün ışığı ve traverten materyal referansıyla 24fps mağaza vitrini kamera hareketi sahnesi.',
      updatedAt: '2026-11-15',
      targetGpuPolicy: '80GB_ONLY',
      assets: classifyProjectFiles(
        SAMPLE_PROJECT_FILES_SEED.slice(0, 6),
        workspaceRoot
      ),
      outputs: [],
    },
  ];
}

export function createInitialBatchQueue(projects: ColabProject[]): BatchQueueItem[] {
  const sceneLabels = [
    'Sahne 01 · Lobi Flythrough',
    'Sahne 02 · Stüdyo Turntable',
    'Sahne 03 · Vitrin Panoraması',
  ];
  return projects.map((proj, index) => {
    const status: BatchQueueItem['status'] =
      proj.outputs.length > 0 || index === 0
        ? 'tamamlandi'
        : index === 1
          ? 'isleniyor'
          : 'kuyrukta';
    return {
      id: `batch-${proj.id}-${index + 1}`,
      projectId: proj.id,
      projectName: proj.name,
      sceneLabel: sceneLabels[index] ?? `${proj.name} · Sahne 0${index + 1}`,
      status,
      addedAt: '2026-11-14 14:00',
      estimatedRenderMin: 3,
    };
  });
}
