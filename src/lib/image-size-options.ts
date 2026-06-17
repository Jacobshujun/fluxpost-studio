export type ImageGenerationSize = "1024x1536" | "1536x1024" | "1024x1024" | "1536x864" | "3840x2160";

export type ImageGenerationSizeOption = {
  value: ImageGenerationSize;
  ratio: string;
  label: string;
};

export const imageGenerationSizeOptions: ImageGenerationSizeOption[] = [
  { value: "1024x1536", ratio: "2:3", label: "2:3 · 1024x1536" },
  { value: "1536x1024", ratio: "3:2", label: "3:2 · 1536x1024" },
  { value: "1024x1024", ratio: "1:1", label: "1:1 · 1024x1024" },
  { value: "1536x864", ratio: "16:9", label: "16:9 · 1536x864" },
  { value: "3840x2160", ratio: "16:9", label: "16:9 4K · 3840x2160" },
];

export const defaultImageGenerationSize: ImageGenerationSize = "1024x1536";

const imageGenerationSizeValues = new Set<string>(imageGenerationSizeOptions.map((option) => option.value));

export function isImageGenerationSize(value: unknown): value is ImageGenerationSize {
  return typeof value === "string" && imageGenerationSizeValues.has(value);
}

export function normalizeImageGenerationSize(value: unknown): ImageGenerationSize {
  const normalized = normalizeSizeCandidate(value);
  if (isImageGenerationSize(normalized)) return normalized;
  if (!normalized || !/^\d{2,5}x\d{2,5}$/.test(normalized)) return defaultImageGenerationSize;

  const [width, height] = normalized.split("x").map((item) => Number(item));
  if (!Number.isFinite(width) || !Number.isFinite(height) || !width || !height) return defaultImageGenerationSize;

  const ratio = width / height;
  if (Math.abs(ratio - 1) < 0.12) return "1024x1024";
  if (ratio > 1.6) return width >= 3000 ? "3840x2160" : "1536x864";
  if (ratio > 1) return "1536x1024";
  return "1024x1536";
}

function normalizeSizeCandidate(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, "").replace(/×/g, "x") : "";
}
