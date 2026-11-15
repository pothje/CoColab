import architecturalFinalRender from '../assets/images/architectural_final_render_1794734963893.jpg';
import blenderGrayboxClay from '../assets/images/blender_graybox_clay_1794734964037.jpg';
import styleReferenceMood from '../assets/images/style_reference_mood_1794734964081.jpg';
import productTurntablePreview from '../assets/images/product_turntable_preview_1794734964722.jpg';
import { AssetKind } from '../types/automation';

export const STUDIO_VISUALS = {
  architecturalFinal: architecturalFinalRender,
  blenderGraybox: blenderGrayboxClay,
  styleReference: styleReferenceMood,
  productTurntable: productTurntablePreview,
} as const;

export function getSeedVisualForProject(projectId: string) {
  const isProduct = projectId.includes('urun');
  const isVitrin = projectId.includes('vitrin');
  return {
    finalPreview: isProduct
      ? productTurntablePreview
      : isVitrin
        ? styleReferenceMood
        : architecturalFinalRender,
    grayboxPreview: blenderGrayboxClay,
    stylePreview: styleReferenceMood,
  };
}

export function getFallbackPreviewForAsset(
  name: string,
  kind: AssetKind,
  projectId: string
): string | null {
  const lower = name.toLowerCase();
  if (kind === 'blender_graybox' || lower.includes('graybox') || lower.includes('clay')) {
    return blenderGrayboxClay;
  }
  if (kind === 'reference_media' || lower.includes('style') || lower.includes('motion')) {
    return projectId.includes('urun') ? productTurntablePreview : styleReferenceMood;
  }
  if (lower.includes('render') || lower.endsWith('.mp4')) {
    return projectId.includes('urun') ? productTurntablePreview : architecturalFinalRender;
  }
  return null;
}
