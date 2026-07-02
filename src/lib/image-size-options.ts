export type ImageGenerationSize = string;

export type ImageGenerationSizeOption = {
  value: ImageGenerationSize;
  ratio: string;
  label: string;
};

export const imageGenerationSizeOptions: ImageGenerationSizeOption[] = [
  { value: "auto", ratio: "auto", label: "auto" },
  { value: "1024x1024", ratio: "1:1", label: "1024x1024" },
  { value: "1024x1536", ratio: "2:3", label: "1024x1536" },
  { value: "1536x1024", ratio: "3:2", label: "1536x1024" },
  { value: "2048x2048", ratio: "1:1", label: "2048x2048" },
  { value: "2048x1152", ratio: "16:9", label: "2048x1152" },
  { value: "1152x2048", ratio: "9:16", label: "1152x2048" },
  { value: "3840x2160", ratio: "16:9", label: "3840x2160" },
  { value: "2160x3840", ratio: "9:16", label: "2160x3840" },
];

export const defaultImageGenerationSize: ImageGenerationSize = "1024x1536";

const imageGenerationSizeValues = new Set<string>(imageGenerationSizeOptions.map((option) => option.value));

export function isImageGenerationSize(value: unknown): value is ImageGenerationSize {
  return Boolean(normalizeValidImageGenerationSize(value));
}

export function normalizeImageGenerationSize(value: unknown): ImageGenerationSize {
  return normalizeValidImageGenerationSize(value) || defaultImageGenerationSize;
}

function normalizeValidImageGenerationSize(value: unknown) {
  const normalized = normalizeSizeCandidate(value);
  if (imageGenerationSizeValues.has(normalized)) return normalized;
  if (!normalized || !/^\d{2,5}x\d{2,5}$/.test(normalized)) return "";

  const [width, height] = normalized.split("x").map((item) => Number(item));
  if (!Number.isInteger(width) || !Number.isInteger(height)) return "";
  if (width < 64 || height < 64 || width > 8192 || height > 8192) return "";

  return `${width}x${height}`;
}

function normalizeSizeCandidate(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, "").replace(/\u00d7/g, "x") : "";
}
