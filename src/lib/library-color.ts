import type { LibraryPaletteColor } from "./types";

export const libraryColorVersion = 1;
export const libraryColorMinCoverage = 0.05;
export const libraryColorDistance = 25;
export const libraryColorPresets = [
  ["红色", "#D43C3C"], ["橙色", "#E88B35"], ["黄色", "#E5CD45"],
  ["绿色", "#4B9855"], ["青色", "#45AFAE"], ["蓝色", "#3876C7"],
  ["紫色", "#8856B3"], ["粉色", "#D68AA8"], ["棕色", "#90633F"],
  ["黑色", "#171717"], ["灰色", "#888888"], ["白色", "#F4F4F4"],
] as const;

export function normalizeLibraryColor(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !/^#[\da-f]{6}$/i.test(value)) throw new Error("请选择有效的六位颜色值。");
  return value.toUpperCase();
}

export function rgbToLab(rgb: readonly number[]): [number, number, number] {
  const [r, g, b] = rgb.map((value) => {
    const v = value / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const f = (v: number) => v > 216 / 24389 ? Math.cbrt(v) : (24389 / 27 * v + 16) / 116;
  const x = f((r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047);
  const y = f(r * 0.2126729 + g * 0.7151522 + b * 0.0721750);
  const z = f((r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function hexToLab(hex: string) {
  const color = normalizeLibraryColor(hex);
  if (!color) throw new Error("颜色不能为空。");
  return rgbToLab([1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16)));
}

export function labDistanceSquared(left: readonly number[], right: readonly number[]) {
  return left.reduce((sum, value, index) => sum + (value - right[index]) ** 2, 0);
}

export function libraryColorMatches(colors: LibraryPaletteColor[], hex: string) {
  const target = hexToLab(hex);
  return colors.some((color) => color.coverage >= libraryColorMinCoverage && labDistanceSquared(hexToLab(color.hex), target) <= libraryColorDistance ** 2);
}
