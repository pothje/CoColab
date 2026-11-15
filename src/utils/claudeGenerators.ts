import { AutomationConfig, ColabProject, OutputRenderItem } from '../types/automation';

export function generateRoutingManifestJson(
  project: ColabProject,
  config: AutomationConfig
): string {
  const activeAssets = project.assets.filter((a) => a.included);
  const manifest = {
    schema_version: '2.1',
    project_id: project.id,
    project_name: project.name,
    target_gpu_policy: project.targetGpuPolicy,
    require_high_ram: config.requireHighRam,
    colab_workspace_root: config.workspaceRoot,
    local_output_primary: config.localOutputPrimary,
    auto_sync_outputs_to_drive: config.autoSyncOutputsToDrive,
    drive_project_folder: `${config.driveFolderName}/${project.id}`,
    stack_directories: {
      routing_manifest: '01_routing_manifest.json',
      prompts: '02_prompts/',
      settings: '03_settings/',
      reference_media: '04_assets/references/',
      blender_graybox: '04_assets/blender_graybox/',
      outputs: '05_outputs/renders/',
      feedback: '05_outputs/feedback_notes.json',
    },
    file_routes: activeAssets.map((a) => ({
      file_name: a.name,
      role: a.kind,
      local_stack_path: a.relativePath,
      colab_pipeline_target: a.targetColabPath,
      size_bytes: a.sizeBytes,
    })),
  };
  return JSON.stringify(manifest, null, 2);
}

export function generateClaudeSkillMd(
  project: ColabProject,
  config: AutomationConfig
): string {
  const plugins = [
    config.comfyui.enableVideoHelperSuite ? 'ComfyUI-VideoHelperSuite' : null,
    config.comfyui.enableKjNodes ? 'ComfyUI-KJNodes (TeaCache & Yardımcı Düğümler)' : null,
    config.comfyui.enableManager ? 'ComfyUI-Manager' : null,
    config.comfyui.enableSageAttention ? 'SageAttention' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return `---
name: minimax-h3-pipeline
description: >
  Başsız ComfyUI + Comfy-Org/MiniMax-H3 + ön ayarlı yan eklentiler, resmi
  googlecolab/colab-mcp + ComfyUI MCP kontrolü, A100 High-RAM guardrail,
  Çoklu Sahne Batch Queue ve yerel 05_outputs/renders/ çıktısı kuralları.
---

# ComfyUI + MiniMax H3 + Resmi Colab & ComfyUI MCP İş Akışı

Bu skill, Claude'un **\`google-colab\` (googlecolab/colab-mcp)** ve **\`colabforge-local\`**
(yerel klasör + ComfyUI MCP kontrol araçları) sunucularını kullanarak Colab üzerinde
başsız **ComfyUI** ve **\`Comfy-Org/MiniMax-H3\`** çalıştırmasını yönetir.

## 1. Uzaktan Colab MCP & ComfyUI MCP Protokolü

1. **Önce Mevcut Runtime Kontrolü:** \`list_runtimes\` aracını çağır. Halihazırda uygun
   bir A100 + High-RAM oturumu varsa Compute Unit yakmamak için onu yeniden kullan.
2. **A100 High-RAM & Dead-Man's Switch:** Uygun oturum yoksa \`create_runtime\` aracını
   \`A100\` ve High-RAM (\`machine_shape: hm\`) hedefiyle çağır. Hücre 1 L4/T4/Standart RAM
   atanırsa \`runtime.unassign()\` çağırır ve \`${config.comfyui.deadManSwitchMinutes} dk\` zombi koruması kurar.
3. **Ön Ayarlı Yan Eklentiler & Torch/NumPy Kilidi:**
   - Aktif eklentiler: ${plugins || 'Standart ComfyUI'}
   - Bağımlılıklar \`uv pip install --system -c /tmp/constraints.txt\` ile torch/numpy ezilmeden kurulur.
4. **3 Katmanlı NVMe + hf_transfer Depolama (Drive Symlink YERİNE):**
   - Büyük modeller (20–68 GB) Drive FUSE \`Errno 5\` riskine karşı Drive'a symlinklenmez;
     doğrudan \`HF_HUB_ENABLE_HF_TRANSFER=1\` ile Colab yerel NVMe diske indirilir:
     - Diffusion: \`ComfyUI/models/${config.comfyui.diffusionModel80Gb}\`
     - Text Encoder (80GB): \`ComfyUI/models/${config.comfyui.textEncoder80Gb}\`
     - Text Encoder (40GB): \`ComfyUI/models/${config.comfyui.textEncoder40Gb}\`
     - Video/Audio VAE: \`ComfyUI/models/${config.comfyui.videoVaeFile}\` & \`${config.comfyui.audioVaeFile}\`
     - Blender Graybox & Referanslar: \`ComfyUI/input/\`
5. **ComfyUI MCP Kontrol Modu (\`${config.comfyui.controlMode}\`):**
   - \`in_vm_agent\` (Önerilen): ComfyUI dış dünyaya açılmaz (\`${config.comfyui.headlessFlags}\`);
     \`google-colab\` MCP \`execute_code\` + \`ws://127.0.0.1:${config.comfyui.comfyPort}/ws\`
     üzerinden çalışır (\`${config.comfyui.wsStallTimeoutSec}s\` stall koruması).
   - \`remote_comfy_mcp\`: \`comfy_get_system_stats\`, \`comfy_get_queue_status\`,
     \`comfy_submit_workflow\`, \`comfy_free_vram\`, \`comfy_interrupt_render\` araçlarını
     doğrudan \`${config.comfyui.comfyMcpEndpoint}\` ucuna uygular.
6. **%99 SIGKILL & VRAM Koruması:**
   - \`VAEDecodeTiled\` (\`${config.comfyui.vaeTileSize}px\`) ${config.comfyui.useTiledVaeDecode ? 'aktif' : 'pasif'}.
   - Her \`${config.comfyui.freeMemoryEveryNVideos}\` videoda \`POST /free\` bellek tazelemesi.
   - Opsiyonel Hız Ön Ayarı: TeaCache=${config.comfyui.enableTeaCache ? 'Açık' : 'Kapalı'}, 8-Step Turbo LoRA=${config.comfyui.enableTurboLora ? config.comfyui.turboLoraFile : 'Kapalı'}.
7. **Doğrudan Yerel Depolamaya İndirme:** Üretilen video ve görselleri \`pull_colab_outputs_to_local\`
   ile doğrudan \`05_outputs/renders/\` klasörüne indir.

## 2. Zorunlu 5 Katmanlı Proje Hiyerarşisi

\`\`\`text
<proje_adi>/
├── 01_routing_manifest.json       # Her dosyanın ComfyUI / Colab hedefini belirler
├── 02_prompts/
│   ├── master_prompt.txt
│   └── negative_prompt.txt
├── 03_settings/
│   ├── comfyui_workflow_api.json  # Başsız ComfyUI /prompt API düğüm grafiği (VAEDecodeTiled dahil)
│   ├── system_schema.json
│   ├── runtime_settings.json
│   └── finetune_lora.yaml
├── 04_assets/
│   ├── references/                # ComfyUI/input/ içerisine yerleşen stil medya dosyaları
│   └── blender_graybox/           # Blender clay / depth / camera pass çıktıları
└── 05_outputs/
    ├── renders/                   # MCP ile doğrudan yerele inen .mp4/.png çıktıları
    └── feedback_notes.json        # "Yeniden Değerlendir" revizyon notları
\`\`\`

## 3. Revizyon ("Yeniden Değerlendir") Akışı
- Kullanıcı \`05_outputs/feedback_notes.json\` içine not bıraktığında önce
  \`read_project_feedback\` aracını çağır, ardından ilgili \`02_prompts/\`,
  \`03_settings/comfyui_workflow_api.json\` veya \`runtime_settings.json\` dosyasını
  \`update_project_file\` ile güncelle.
- Aktif Colab kök dizini: \`${config.workspaceRoot}\`
`;
}

export function generateClaudeRulesMd(
  project: ColabProject,
  config: AutomationConfig
): string {
  return `# CLAUDE.md — ColabForge ComfyUI + MiniMax H3 & Çift MCP Kuralları

Aktif Varsayılan Proje: ${project.name} (${project.id})
Motor: ComfyUI (${config.comfyui.comfyRootDir}) · Model: ${config.modelMatrix.repo80Gb}
ComfyUI MCP Kontrol Modu: ${config.comfyui.controlMode} (${config.comfyui.comfyMcpEndpoint})
Ön Ayarlı Eklentiler: VHS=${config.comfyui.enableVideoHelperSuite}, KJNodes=${config.comfyui.enableKjNodes}, SageAttention=${config.comfyui.enableSageAttention}, uv+Constraints=${config.comfyui.pinTorchNumpyConstraints}
MCP Yerel Çıktı Önceliği: ${config.localOutputPrimary ? 'Aktif (05_outputs/renders/)' : 'Pasif'}
Opsiyonel Drive Ek Yedeği: ${config.autoSyncOutputsToDrive ? `Açık (${config.driveFolderName})` : 'Kapalı'}

## Kesin Kurallar
- Selenium, Playwright veya tarayıcı otomasyonu KULLANMA; Colab'a yalnızca resmi \`googlecolab/colab-mcp\` (\`list_runtimes\`, \`create_runtime\`, \`execute_code\`) ve \`colabforge-local\` MCP araçlarıyla bağlan.
- Büyük model ağırlıklarını (20–68 GB) Google Drive FUSE symlink ile OKUMA; \`HF_HUB_ENABLE_HF_TRANSFER=1\` ile doğrudan Colab NVMe diskine çek.
- Custom node kurulumlarında mutlaka \`torch\`/\`numpy\` constraints kilidi ve \`uv\` kullan; aksi halde Colab CUDA ortamı bozulur.
- %99 aşamasında SIGKILL (Exit 137) önlemek için \`VAEDecodeTiled\` (${config.comfyui.vaeTileSize}px) + High-RAM zorunluluğunu koru.
- Kuyruk takibini kör HTTP polling yerine \`ws://127.0.0.1:${config.comfyui.comfyPort}/ws\` üzerinden yap ve her ${config.comfyui.freeMemoryEveryNVideos} videoda \`POST /free\` çağır.
- Kişiye özel sabit disk yolları yazma; her zaman göreceli proje yolları kullan.
`;
}

export function generateClaudeDesktopConfigSnippet(
  os: 'windows' | 'macos_linux',
  config?: AutomationConfig
): string {
  const pythonCmd =
    os === 'windows'
      ? '%USERPROFILE%\\.colabforge-mcp\\.venv\\Scripts\\python.exe'
      : '$HOME/.colabforge-mcp/.venv/bin/python';
  const serverPath =
    os === 'windows'
      ? '%USERPROFILE%\\.colabforge-mcp\\colab_mcp_server.py'
      : '$HOME/.colabforge-mcp/colab_mcp_server.py';

  return JSON.stringify(
    {
      mcpServers: {
        'google-colab': {
          command: 'uvx',
          args: ['git+https://github.com/googlecolab/colab-mcp'],
          timeout: 30000,
        },
        'colabforge-local': {
          command: pythonCmd,
          args: [serverPath],
          env: {
            COLABFORGE_PROJECTS_DIR:
              os === 'windows'
                ? '%USERPROFILE%\\ColabForge_Projects'
                : '$HOME/ColabForge_Projects',
            COMFYUI_CONTROL_MODE: config?.comfyui.controlMode ?? 'in_vm_agent',
            COMFYUI_URL: config?.comfyui.comfyMcpEndpoint ?? 'http://127.0.0.1:8188',
          },
        },
      },
    },
    null,
    2
  );
}

export function generateMcpInstallerScript(
  os: 'windows' | 'macos_linux',
  project: ColabProject,
  config: AutomationConfig,
  mcpServerPython: string
): string {
  const skillMd = generateClaudeSkillMd(project, config);
  const claudeMd = generateClaudeRulesMd(project, config);
  const desktopConfig = generateClaudeDesktopConfigSnippet(os, config);

  if (os === 'windows') {
    return `# install_colabforge_mcp.ps1 — Evrensel Windows Tek Komut Kurulum Betigi
# Resmi googlecolab/colab-mcp (uvx) + ColabForge yerel MCP + SKILL.md kurulumu
$ErrorActionPreference = "Stop"

$BaseDir = Join-Path $env:USERPROFILE ".colabforge-mcp"
$ProjectsDir = Join-Path $env:USERPROFILE "ColabForge_Projects"
$SkillDir = Join-Path $ProjectsDir ".claude\\skills\\minimax-h3-pipeline"

New-Item -ItemType Directory -Force -Path $BaseDir | Out-Null
New-Item -ItemType Directory -Force -Path $SkillDir | Out-Null

Write-Host "[1/5] Python sanal ortami, uv ve MCP paketleri kuruluyor..."
python -m venv (Join-Path $BaseDir ".venv")
& (Join-Path $BaseDir ".venv\\Scripts\\pip.exe") install -q --upgrade pip mcp huggingface_hub pyyaml httpx uv

Write-Host "[2/5] colabforge-local MCP sunucusu yaziliyor..."
@'
${mcpServerPython}
'@ | Set-Content -Encoding UTF8 (Join-Path $BaseDir "colab_mcp_server.py")

Write-Host "[3/5] Claude SKILL.md ve CLAUDE.md kurallari yukleniyor..."
@'
${skillMd}
'@ | Set-Content -Encoding UTF8 (Join-Path $SkillDir "SKILL.md")

@'
${claudeMd}
'@ | Set-Content -Encoding UTF8 (Join-Path $ProjectsDir "CLAUDE.md")

Write-Host "[4/5] googlecolab/colab-mcp + colabforge-local config ornegi kaydediliyor..."
@'
${desktopConfig}
'@ | Set-Content -Encoding UTF8 (Join-Path $BaseDir "claude_desktop_config.json")

Write-Host "[5/5] Kurulum tamamlandi! Projeler: $ProjectsDir"
Write-Host "Not: Claude Code / Desktop icinde google-colab + colabforge-local MCP baglantisi hazir."
`;
  }

  return `#!/usr/bin/env bash
# install_colabforge_mcp.sh — Evrensel macOS / Linux Tek Komut Kurulum Betiği
# Resmi googlecolab/colab-mcp (uvx) + ColabForge yerel MCP + SKILL.md kurulumu
set -euo pipefail

BASE_DIR="$HOME/.colabforge-mcp"
PROJECTS_DIR="$HOME/ColabForge_Projects"
SKILL_DIR="$PROJECTS_DIR/.claude/skills/minimax-h3-pipeline"

mkdir -p "$BASE_DIR" "$SKILL_DIR"

echo "[1/5] Python sanal ortamı, uv ve MCP paketleri kuruluyor..."
python3 -m venv "$BASE_DIR/.venv"
"$BASE_DIR/.venv/bin/pip" install -q --upgrade pip mcp huggingface_hub pyyaml httpx uv

echo "[2/5] colabforge-local MCP sunucusu yazılıyor..."
cat << 'EOF_MCP' > "$BASE_DIR/colab_mcp_server.py"
${mcpServerPython}
EOF_MCP

echo "[3/5] Claude SKILL.md ve CLAUDE.md kuralları yükleniyor..."
cat << 'EOF_SKILL' > "$SKILL_DIR/SKILL.md"
${skillMd}
EOF_SKILL

cat << 'EOF_CLAUDE' > "$PROJECTS_DIR/CLAUDE.md"
${claudeMd}
EOF_CLAUDE

echo "[4/5] googlecolab/colab-mcp + colabforge-local config örneği kaydediliyor..."
cat << 'EOF_CFG' > "$BASE_DIR/claude_desktop_config.json"
${desktopConfig}
EOF_CFG

echo "[5/5] Kurulum tamamlandı! Proje dizini: $PROJECTS_DIR"
`;
}

export function buildClaudeRevisionBrief(
  project: ColabProject,
  outputItem: OutputRenderItem,
  noteText: string
): string {
  const promptFiles = project.assets.filter((a) => a.kind === 'prompts' && a.included);
  const workflowFiles = project.assets.filter(
    (a) => a.kind === 'comfyui_workflow' && a.included
  );
  const settingsFiles = project.assets.filter((a) => a.kind === 'settings' && a.included);
  const grayboxFiles = project.assets.filter(
    (a) => a.kind === 'blender_graybox' && a.included
  );

  return `# Claude Yeniden Değerlendirme & ComfyUI Revizyon Talebi

- **Proje:** ${project.name} (\`${project.id}\`)
- **İncelenen Çıktı:** ${outputItem.title} (\`${outputItem.fileName}\`)
- **Kullanılan GPU:** ${outputItem.gpuUsed} · **Çözünürlük:** ${outputItem.resolution} · **Süre:** ${outputItem.durationSec}s
- **Çıktı Yolu:** \`${outputItem.relativeOutputPath}\`

## Kullanıcının Beğenmediği Nokta / Revizyon Notu
> ${noteText.trim()}

## Claude'un Yapması Gereken Adımlar (SKILL.md + ComfyUI + colab-mcp Kurallarına Göre)
1. Aşağıdaki aktif ComfyUI grafiği, ayar ve prompt dosyalarını incele:
   - ComfyUI API Workflow: ${workflowFiles.map((f) => `\`${f.relativePath}\``).join(', ') || 'Yok'}
   - Promptlar: ${promptFiles.map((f) => `\`${f.relativePath}\``).join(', ') || 'Yok'}
   - Ayarlar/Şema: ${settingsFiles.map((f) => `\`${f.relativePath}\``).join(', ') || 'Yok'}
   - Blender Graybox: ${grayboxFiles.map((f) => `\`${f.relativePath}\``).join(', ') || 'Yok'}
2. Eleştiriye göre \`03_settings/comfyui_workflow_api.json\`, \`03_settings/runtime_settings.json\` ve \`02_prompts/master_prompt.txt\` dosyalarını nokta atışı güncelle.
3. Güncellenen projeyi \`batch_queue_manifest.json\` içine ekleyip resmi \`google-colab\` MCP üzerinden başsız ComfyUI (\`/prompt\`) API ile yeniden render al ve çıktıyı \`pull_colab_outputs_to_local\` ile \`05_outputs/renders/\` klasörüne çek.
`;
}
