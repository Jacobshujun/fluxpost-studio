import { validateToApisDimensions } from "./toapis-image-api";

export function pixelSizeForRatio(ratio: string, resolution: string) {
  const dimensions = validateToApisDimensions(ratio, resolution);
  const [widthRatio, heightRatio] = dimensions.size.split(":").map(Number);
  const longestSide = dimensions.resolution === "4k" ? 4096 : dimensions.resolution === "2k" ? 2048 : 1024;
  const scale = longestSide / Math.max(widthRatio, heightRatio);
  return `${Math.max(64, Math.round(widthRatio * scale))}x${Math.max(64, Math.round(heightRatio * scale))}`;
}

export function resolveGptImageDimensionSettings(input: { imageRatio?: string; imageResolution?: string }) {
  if (!input.imageRatio || !input.imageResolution) throw new Error("请选择图片比例和分辨率");
  const dimensions = validateToApisDimensions(input.imageRatio, input.imageResolution);
  return {
    imageRatio: dimensions.size,
    imageResolution: dimensions.resolution,
    imageSize: pixelSizeForRatio(dimensions.size, dimensions.resolution),
  };
}
