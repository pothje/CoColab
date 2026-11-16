import {
  BlenderRenderConfig,
  ColabProject,
  DeliveryPresetId,
  MediaRole,
  ProjectAssetFile,
} from '../types/automation';
import {
  buildTargetColabPath,
  classifyProjectFiles,
  inferMediaRole,
  type RawFileInput,
} from './guardrailEngine';

export interface DeliveryPresetSpec {
  id: DeliveryPresetId;
  label: string;
  shortLabel: string;
  channelLabel: string;
  width: number;
  height: number;
  aspectLabel: string;
  fps: number;
  durationSec: number;
}

export const DELIVERY_PRESETS: Record<DeliveryPresetId, DeliveryPresetSpec> = {
  etsy_4_3: {
    id: 'etsy_4_3',
    label: 'Etsy Vitrin (4:3)',
    shortLabel: 'Etsy 4:3',
    channelLabel: 'Etsy Mağaza Ürünü',
    width: 1024,
    height: 768,
    aspectLabel: '4:3',
    fps: 24,
    durationSec: 5,
  },
  etsy_1_1: {
    id: 'etsy_1_1',
    label: 'Etsy Kare (1:1)',
    shortLabel: 'Etsy 1:1',
    channelLabel: 'Etsy & Feed Kare',
    width: 960,
    height: 960,
    aspectLabel: '1:1',
    fps: 24,
    durationSec: 5,
  },
  social_9_16: {
    id: 'social_9_16',
    label: 'Sosyal Medya (9:16)',
    shortLabel: 'Reels 9:16',
    channelLabel: 'Reels · TikTok · Shorts',
    width: 720,
    height: 1280,
    aspectLabel: '9:16',
    fps: 24,
    durationSec: 5,
  },
  cinema_16_9: {
    id: 'cinema_16_9',
    label: 'Yatay Sahne (16:9)',
    shortLabel: 'Yatay 16:9',
    channelLabel: 'Geniş Vitrin / YouTube',
    width: 1280,
    height: 720,
    aspectLabel: '16:9',
    fps: 24,
    durationSec: 5,
  },
};

export function getDeliveryPreset(id?: DeliveryPresetId): DeliveryPresetSpec {
  if (id && DELIVERY_PRESETS[id]) {
    return DELIVERY_PRESETS[id];
  }
  return DELIVERY_PRESETS.etsy_4_3;
}

export function resolveAssetMediaRole(asset: ProjectAssetFile): MediaRole {
  if (asset.mediaRole) return asset.mediaRole;
  return inferMediaRole(asset.relativePath, asset.name, asset.kind);
}

export type ProjectBlenderStatus = 'needs_colab_render' | 'pre_rendered' | 'none';

export interface ProjectPipelineReadiness {
  deliveryPreset: DeliveryPresetSpec;
  firstFrameAsset: ProjectAssetFile | null;
  lastFrameAsset: ProjectAssetFile | null;
  unrenderedBlendAssets: ProjectAssetFile[];
  renderedGrayboxAssets: ProjectAssetFile[];
  styleRefAssets: ProjectAssetFile[];
  hasFirstFrame: boolean;
  hasLastFrame: boolean;
  hasKeyframesPair: boolean;
  hasPreRenderedScene: boolean;
  hasUnrenderedBlend: boolean;
  blenderStatus: ProjectBlenderStatus;
  requiresColabBlenderRender: boolean;
  blenderStatusLabel: string;
  hasPrompt: boolean;
  hasSettings: boolean;
  hasWorkflow: boolean;
  zeroConfigReady: boolean;
}

export function inspectProjectPipelineReadiness(
  project: ColabProject,
  blenderConfig?: BlenderRenderConfig
): ProjectPipelineReadiness {
  const active = project.assets.filter((a) => a.included);
  const roles = active.map((asset) => ({
    asset,
    role: resolveAssetMediaRole(asset),
  }));

  const firstFrameAsset =
    roles.find((r) => r.role === 'first_frame')?.asset ?? null;
  const lastFrameAsset =
    roles.find((r) => r.role === 'last_frame')?.asset ?? null;
  const unrenderedBlendAssets = roles
    .filter((r) => r.role === 'blender_scene')
    .map((r) => r.asset);
  const renderedGrayboxAssets = roles
    .filter((r) => r.role === 'blender_rendered')
    .map((r) => r.asset);
  const styleRefAssets = roles
    .filter((r) => r.role === 'style_ref')
    .map((r) => r.asset);

  const hasPreRenderedScene = renderedGrayboxAssets.length > 0;
  const hasUnrenderedBlend = unrenderedBlendAssets.length > 0;

  let blenderStatus: ProjectBlenderStatus = 'none';
  if (hasPreRenderedScene) {
    blenderStatus = 'pre_rendered';
  } else if (hasUnrenderedBlend) {
    blenderStatus = 'needs_colab_render';
  }

  const requiresColabBlenderRender =
    blenderStatus === 'needs_colab_render' && (blenderConfig?.enabled ?? true);

  let blenderStatusLabel = 'Blender Sahnesi Yok';
  if (blenderStatus === 'pre_rendered') {
    blenderStatusLabel = 'Render Hazır';
  } else if (requiresColabBlenderRender) {
    blenderStatusLabel = 'Colab’da Renderlanacak (.blend)';
  } else if (hasUnrenderedBlend) {
    blenderStatusLabel = '.blend Algılandı (Modül Kapalı)';
  }

  const hasPrompt = active.some(
    (a) => a.kind === 'prompts' && Boolean(a.previewText?.trim())
  );
  const hasSettings = active.some((a) => a.kind === 'settings');
  const hasWorkflow = active.some((a) => a.kind === 'comfyui_workflow');

  const deliveryPreset = getDeliveryPreset(project.deliveryPreset ?? 'cinema_16_9');

  return {
    deliveryPreset,
    firstFrameAsset,
    lastFrameAsset,
    unrenderedBlendAssets,
    renderedGrayboxAssets,
    styleRefAssets,
    hasFirstFrame: Boolean(firstFrameAsset),
    hasLastFrame: Boolean(lastFrameAsset),
    hasKeyframesPair: Boolean(firstFrameAsset && lastFrameAsset),
    hasPreRenderedScene,
    hasUnrenderedBlend,
    blenderStatus,
    requiresColabBlenderRender,
    blenderStatusLabel,
    hasPrompt,
    hasSettings,
    hasWorkflow,
    zeroConfigReady: hasPrompt && hasWorkflow && (hasPreRenderedScene || hasUnrenderedBlend || Boolean(firstFrameAsset)),
  };
}

function safeJsonParse(text?: string): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function inferDeliveryPresetFromMetadata(
  rawTextValues: Array<string | undefined>
): DeliveryPresetId {
  const joined = rawTextValues.filter(Boolean).join(' ').toLowerCase();
  if (
    joined.includes('social_9_16') ||
    joined.includes('9:16') ||
    joined.includes('720x1280') ||
    joined.includes('1080x1920') ||
    joined.includes('reels') ||
    joined.includes('tiktok') ||
    joined.includes('shorts')
  ) {
    return 'social_9_16';
  }
  if (
    joined.includes('etsy_1_1') ||
    joined.includes('1:1') ||
    joined.includes('960x960') ||
    joined.includes('1024x1024') ||
    joined.includes('1080x1080')
  ) {
    return 'etsy_1_1';
  }
  if (
    joined.includes('etsy_4_3') ||
    joined.includes('4:3') ||
    joined.includes('1024x768') ||
    joined.includes('etsy')
  ) {
    return 'etsy_4_3';
  }
  return 'cinema_16_9';
}

function deriveFolderDisplayName(files: RawFileInput[]): string | null {
  const withFolder = files.find((f) => f.relativePath.includes('/'));
  if (!withFolder) return null;
  const topFolder = withFolder.relativePath.split('/')[0]?.trim();
  if (!topFolder || topFolder.startsWith('0')) return null;
  return topFolder
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function parseClaudeBundleToProject(
  rawFiles: RawFileInput[],
  workspaceRoot: string,
  overrides?: {
    id?: string;
    name?: string;
    description?: string;
    deliveryPreset?: DeliveryPresetId;
  }
): ColabProject {
  const briefRaw = rawFiles.find((f) =>
    /(project_brief|etsy_brief|brief|manifest|01_routing_manifest)\.json$/i.test(f.name)
  );
  const settingsRaw = rawFiles.find((f) =>
    /(runtime_settings|settings|video_settings)\.json$/i.test(f.name)
  );
  const promptRaw = rawFiles.find(
    (f) => f.name.toLowerCase() === 'master_prompt.txt' || /prompt.*\.txt$/i.test(f.name)
  );

  const briefJson = safeJsonParse(briefRaw?.previewText);
  const settingsJson = safeJsonParse(settingsRaw?.previewText);

  const briefName =
    typeof briefJson?.project_name === 'string'
      ? briefJson.project_name
      : typeof briefJson?.title === 'string'
        ? briefJson.title
        : typeof briefJson?.product_name === 'string'
          ? briefJson.product_name
          : null;

  const briefDesc =
    typeof briefJson?.description === 'string'
      ? briefJson.description
      : typeof briefJson?.summary === 'string'
        ? briefJson.summary
        : null;

  const briefGpu =
    briefJson?.target_gpu_policy === '80GB_ONLY' ? '80GB_ONLY' : '80GB_OR_40GB';

  const detectedPreset =
    overrides?.deliveryPreset ??
    inferDeliveryPresetFromMetadata([
      typeof briefJson?.delivery_preset === 'string' ? briefJson.delivery_preset : undefined,
      typeof briefJson?.aspect_ratio === 'string' ? briefJson.aspect_ratio : undefined,
      typeof briefJson?.platform === 'string' ? briefJson.platform : undefined,
      typeof settingsJson?.resolution === 'string' ? settingsJson.resolution : undefined,
      typeof settingsJson?.aspect_ratio === 'string' ? settingsJson.aspect_ratio : undefined,
      briefRaw?.previewText,
      settingsRaw?.previewText,
    ]);

  const presetSpec = getDeliveryPreset(detectedPreset);
  const workingInputs: RawFileInput[] = [...rawFiles];

  // If project_brief.json embeds prompt text and master_prompt.txt is missing, synthesize it
  const embeddedPrompt =
    typeof briefJson?.prompt === 'string'
      ? briefJson.prompt
      : typeof briefJson?.master_prompt === 'string'
        ? briefJson.master_prompt
        : null;

  if (!promptRaw && embeddedPrompt) {
    workingInputs.push({
      name: 'master_prompt.txt',
      relativePath: '02_prompts/master_prompt.txt',
      sizeBytes: new TextEncoder().encode(embeddedPrompt).length,
      mimeType: 'text/plain',
      previewText: embeddedPrompt,
    });
  }

  if (!settingsRaw) {
    const synthesizedSettings = JSON.stringify(
      {
        comfyui_endpoint: 'http://127.0.0.1:8188',
        delivery_preset: presetSpec.id,
        resolution: `${presetSpec.width}x${presetSpec.height}`,
        aspect_ratio: presetSpec.aspectLabel,
        num_frames: 121,
        fps: presetSpec.fps,
        guidance_scale: 6.5,
        num_inference_steps: 28,
      },
      null,
      2
    );
    workingInputs.push({
      name: 'runtime_settings.json',
      relativePath: '03_settings/runtime_settings.json',
      sizeBytes: new TextEncoder().encode(synthesizedSettings).length,
      mimeType: 'application/json',
      previewText: synthesizedSettings,
    });
  }

  const hasWorkflow = workingInputs.some(
    (f) => /comfy|workflow/i.test(`${f.relativePath}/${f.name}`)
  );
  if (!hasWorkflow) {
    const defaultWorkflow = JSON.stringify(
      {
        '1': {
          class_type: 'UNETLoader',
          inputs: {
            unet_name: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors',
            weight_dtype: 'default',
          },
        },
        '2': {
          class_type: 'CLIPLoader',
          inputs: {
            clip_name: 'qwen3vl_32b_minimax_h3_int8_convrot.safetensors',
            type: 'minimax_h3',
          },
        },
        '3': {
          class_type: 'VAELoader',
          inputs: {
            vae_name: 'minimax_h3_video_vae_int8_convrot.safetensors',
          },
        },
        '4': {
          class_type: 'LoadImage',
          inputs: {
            image: 'first_frame.png',
            role: 'first_frame',
          },
        },
        '8': {
          class_type: 'LoadImage',
          inputs: {
            image: 'last_frame.png',
            role: 'last_frame',
          },
        },
        '5': {
          class_type: 'CLIPTextEncode',
          inputs: {
            text: '@master_prompt.txt',
            clip: ['2', 0],
          },
        },
        '6': {
          class_type: 'VAEDecodeTiled',
          inputs: {
            tile_size: 512,
            overlap: 64,
            temporal_size: 64,
            temporal_overlap: 8,
            vae: ['3', 0],
          },
        },
        '7': {
          class_type: 'VHS_VideoCombine',
          inputs: {
            frame_rate: presetSpec.fps,
            format: 'video/h264-mp4',
            filename_prefix: `${presetSpec.id}_Render`,
          },
        },
      },
      null,
      2
    );
    workingInputs.push({
      name: 'comfyui_workflow_api.json',
      relativePath: '03_settings/comfyui_workflow_api.json',
      sizeBytes: new TextEncoder().encode(defaultWorkflow).length,
      mimeType: 'application/json',
      previewText: defaultWorkflow,
    });
  }

  const assets = classifyProjectFiles(workingInputs, workspaceRoot).map((asset) => {
    if (asset.name === 'project_brief.json') {
      return {
        ...asset,
        kind: 'schema' as const,
        targetColabPath: buildTargetColabPath(workspaceRoot, 'schema', asset.name),
      };
    }
    return asset;
  });

  const resolvedName =
    overrides?.name?.trim() ||
    briefName ||
    deriveFolderDisplayName(rawFiles) ||
    'Claude Tasarım Paketi';

  const hasBlend = assets.some((a) => resolveAssetMediaRole(a) === 'blender_scene');
  const defaultDesc = hasBlend
    ? `${presetSpec.label} · Ham .blend sahnesi Colab OptiX ile renderlanıp videoya dönüştürülecek.`
    : `${presetSpec.label} · Claude paketinden otomatik yüklenen ürün video sahnesi.`;

  return {
    id: overrides?.id ?? `proj-${Date.now()}`,
    name: resolvedName,
    description: overrides?.description?.trim() || briefDesc || defaultDesc,
    updatedAt: new Date().toISOString().slice(0, 10),
    targetGpuPolicy: briefGpu,
    deliveryPreset: detectedPreset,
    sourceBundleFormat: 'claude_etsy_bundle',
    assets,
    outputs: [],
  };
}

export function createSampleEtsyClaudeBundleRawFiles(
  variant: 'unrendered_blend' | 'pre_rendered' = 'unrendered_blend'
): RawFileInput[] {
  const preset = DELIVERY_PRESETS.etsy_4_3;
  const briefObj = {
    schema_version: '2.3',
    project_name: 'Seramik Kahve Demleme Seti · Etsy',
    description:
      'Etsy mağaza vitrini için traverten tezgah üzerinde sabah ışığında el yapımı seramik pour-over kahve seti.',
    delivery_preset: preset.id,
    aspect_ratio: preset.aspectLabel,
    target_gpu_policy: '80GB_OR_40GB',
    blender_render_required: variant === 'unrendered_blend',
    keyframes: {
      first_frame: '04_assets/references/first_frame_masa.png',
      last_frame: '04_assets/references/last_frame_sunum.png',
    },
    prompt:
      'Handmade matte ceramic pour-over coffee dripper and carafe resting on warm travertine stone counter, gentle morning window sunbeams, subtle steam rising, slow 45-degree orbital camera glide from first frame to final presentation frame, crisp pottery glaze texture, commercial Etsy product cinematography.',
  };

  const settingsObj = {
    comfyui_endpoint: 'http://127.0.0.1:8188',
    delivery_preset: preset.id,
    resolution: `${preset.width}x${preset.height}`,
    aspect_ratio: preset.aspectLabel,
    num_frames: 121,
    fps: 24,
    guidance_scale: 6.0,
    num_inference_steps: 28,
    seed: 88124,
  };

  const files: RawFileInput[] = [
    {
      name: 'project_brief.json',
      relativePath: 'project_brief.json',
      sizeBytes: JSON.stringify(briefObj, null, 2).length,
      mimeType: 'application/json',
      previewText: JSON.stringify(briefObj, null, 2),
    },
    {
      name: 'master_prompt.txt',
      relativePath: '02_prompts/master_prompt.txt',
      sizeBytes: briefObj.prompt.length,
      mimeType: 'text/plain',
      previewText: briefObj.prompt,
    },
    {
      name: 'negative_prompt.txt',
      relativePath: '02_prompts/negative_prompt.txt',
      sizeBytes: 98,
      mimeType: 'text/plain',
      previewText:
        'warped ceramic, melted handle, floating cup, flicker, text watermark, harsh neon',
    },
    {
      name: 'runtime_settings.json',
      relativePath: '03_settings/runtime_settings.json',
      sizeBytes: JSON.stringify(settingsObj, null, 2).length,
      mimeType: 'application/json',
      previewText: JSON.stringify(settingsObj, null, 2),
    },
    {
      name: 'first_frame_masa.png',
      relativePath: '04_assets/references/first_frame_masa.png',
      sizeBytes: 1850200,
      mimeType: 'image/png',
      previewText: 'İlk Kare Referansı (Başlangıç kompozisyonu · Traverten tezgah)',
    },
    {
      name: 'last_frame_sunum.png',
      relativePath: '04_assets/references/last_frame_sunum.png',
      sizeBytes: 1920400,
      mimeType: 'image/png',
      previewText: 'Son Kare Referansı (Final yakın plan ürün sunumu)',
    },
  ];

  if (variant === 'unrendered_blend') {
    files.push({
      name: 'seramik_kahve_sahne.blend',
      relativePath: '04_assets/blender_graybox/seramik_kahve_sahne.blend',
      sizeBytes: 24600000,
      mimeType: 'application/x-blender',
      previewText: 'Blender 4.3 sahne dosyası (Cycles OptiX ile Colab A100 üzerinde renderlanacak)',
    });
  } else {
    files.push({
      name: 'seramik_kahve_graybox_anim.mp4',
      relativePath: '04_assets/blender_graybox/seramik_kahve_graybox_anim.mp4',
      sizeBytes: 12400000,
      mimeType: 'video/mp4',
      previewText: 'Önceden renderlanmış Blender graybox kamera geçiş videosu (Hazır)',
    });
  }

  return files;
}
