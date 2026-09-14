import { validateToApisDimensions } from "./toapis-image-api";

export function pixelSizeForRatio(ratio: string, resolution: string) {
  const dimensions = validateToApisDimensions(ratio, resolution);
  const [widthRatio, heightRatio] = dimensions.size.split(":").map(Number);
  // Match the documented 2.5 tier examples; 4K is an area budget, not a 4096px edge.
  const longestSide = dimensions.resolution === "4k" ? 3840 : dimensions.resolution === "2k" ? 2048 : widthRatio === heightRatio ? 1024 : 1536;
  const scale = Math.min(
    longestSide / Math.max(widthRatio, heightRatio),
    Math.sqrt(8_294_400 / (widthRatio * heightRatio)),
  );
  const align = (value: number) => Math.floor(value / 16) * 16;
  return `${align(widthRatio * scale)}x${align(heightRatio * scale)}`;
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
