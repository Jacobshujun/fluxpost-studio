import type { CanvasNodeConfig } from "./types";

export const IMAGE_PROCESS_LIMITS = { items: 20, bytes: 30 * 1024 * 1024, pixels: 40_000_000, edge: 8192 } as const;
export type ImageProcessConfig = {
  format: "jpeg" | "png" | "webp";
  compressionMode: "quality" | "percent" | "size";
  quality: number;
  minQuality: number;
  targetPercent: number;
  targetKB: number;
  resizeMode: "original" | "percent" | "longest" | "custom";
  scalePercent: number;
  longestEdge: number;
  width: number;
  height: number;
  fit: "inside" | "cover" | "contain";
  background: string;
};
export const defaultImageProcessConfig: ImageProcessConfig = {
  format: "jpeg", compressionMode: "quality", quality: 90, minQuality: 75,
  targetPercent: 50, targetKB: 500, resizeMode: "original", scalePercent: 100,
  longestEdge: 2160, width: 1080, height: 1440, fit: "inside", background: "#ffffff",
};
export type ImageProcessingReport = {
  configKey: string;
  sourceUrl: string;
  sourceWidth: number;
  sourceHeight: number;
  sourceBytes: number;
  outputBytes: number;
  outputWidth: number;
  outputHeight: number;
  quality?: number;
  targetBytes?: number;
  savingsPercent: number;
};

// Validate only effective fields; hidden settings stay editable/persisted without changing output identity.
export function resolveImageProcessConfig(config: CanvasNodeConfig): ImageProcessConfig {
  const merged = { ...defaultImageProcessConfig, ...config };
  const choice = <T extends string>(value: unknown, allowed: readonly T[], label: string): T => {
    if (typeof value !== "string" || !allowed.includes(value as T)) throw new Error(`${label}无效。`);
    return value as T;
  };
  const number = (value: unknown, min: number, max: number, label: string) => {
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new Error(`${label}必须是 ${min}–${max} 的整数。`);
    return value;
  };
  const result: ImageProcessConfig = { ...defaultImageProcessConfig,
    format: choice(merged.format, ["jpeg", "png", "webp"], "输出格式"),
    compressionMode: choice(merged.compressionMode, ["quality", "percent", "size"], "压缩模式"),
    resizeMode: choice(merged.resizeMode, ["original", "percent", "longest", "custom"], "分辨率模式"),
  };
  if (result.format !== "png") {
    result.quality = number(merged.quality, 1, 100, "画质");
    if (result.compressionMode !== "quality") result.minQuality = number(merged.minQuality, 1, result.quality, "最低画质");
  }
  if (result.compressionMode === "percent") result.targetPercent = number(merged.targetPercent, 1, 100, "原文件百分比");
  if (result.compressionMode === "size") result.targetKB = number(merged.targetKB, 1, 30720, "目标 KB");
  if (result.resizeMode === "percent") result.scalePercent = number(merged.scalePercent, 1, 400, "缩放百分比");
  if (result.resizeMode === "longest") result.longestEdge = number(merged.longestEdge, 1, IMAGE_PROCESS_LIMITS.edge, "最长边");
  if (result.resizeMode === "custom") {
    result.width = number(merged.width, 1, IMAGE_PROCESS_LIMITS.edge, "宽度");
    result.height = number(merged.height, 1, IMAGE_PROCESS_LIMITS.edge, "高度");
    result.fit = choice(merged.fit, ["inside", "cover", "contain"], "尺寸适配");
  }
  if (result.format === "jpeg" || (result.resizeMode === "custom" && result.fit === "contain")) {
    if (typeof merged.background !== "string" || !/^(#[0-9a-f]{6}|transparent)$/i.test(merged.background)) throw new Error("背景色必须为六位十六进制颜色或透明。");
    if (result.format === "jpeg" && merged.background === "transparent") throw new Error("JPEG 不支持透明背景，请选择背景色。");
    result.background = merged.background.toLowerCase();
  }
  return result;
}

export function imageProcessConfigKey(config: CanvasNodeConfig): string {
  return JSON.stringify(resolveImageProcessConfig(config));
}

export function validateImageProcessConfig(config: CanvasNodeConfig): string[] {
  try { resolveImageProcessConfig(config); return []; }
  catch (error) { return [error instanceof Error ? error.message : "图片处理参数无效。"]; }
}
