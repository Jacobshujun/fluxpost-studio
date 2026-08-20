import type { CanvasNodeConfig, CanvasSubtitlePreset, CanvasSubtitleStyle } from "./types";

export const CANVAS_SUBTITLE_STYLE_LIMITS = {
  fontSizePercent: { min: 2, max: 12 },
  outlineWidthPercent: { min: 0, max: 1.5 },
  backgroundOpacity: { min: 0, max: 100 },
  verticalMarginPercent: { min: 0, max: 30 },
  maxCharsPerLine: { min: 8, max: 30 },
} as const;

export const defaultCanvasSubtitleStyle: CanvasSubtitleStyle = {
  fontFamily: "Noto Sans CJK SC",
  fontSizePercent: 5,
  bold: true,
  textColor: "#FFFFFF",
  outlineColor: "#000000",
  outlineWidthPercent: 0.25,
  backgroundEnabled: false,
  backgroundColor: "#000000",
  backgroundOpacity: 70,
  verticalPosition: "bottom",
  horizontalAlign: "center",
  verticalMarginPercent: 6,
  maxCharsPerLine: 16,
};

const builtInDefinitions: Array<{ id: string; name: string; style: Partial<CanvasSubtitleStyle> }> = [
  { id: "builtin-white-outline", name: "白字黑边", style: {} },
  { id: "builtin-bottom-box", name: "底部黑底", style: { backgroundEnabled: true, outlineWidthPercent: 0, backgroundOpacity: 72 } },
  { id: "builtin-center-emphasis", name: "居中强调", style: { verticalPosition: "middle", fontSizePercent: 7, textColor: "#FFE66D", outlineWidthPercent: 0.35 } },
];

export function builtInCanvasSubtitlePresets(): CanvasSubtitlePreset[] {
  return builtInDefinitions.map((preset) => ({
    id: preset.id,
    ownerUserId: "builtin",
    ownerDisplayName: "系统",
    name: preset.name,
    normalizedName: normalizeCanvasSubtitlePresetName(preset.name),
    revision: 1,
    style: normalizeCanvasSubtitleStyle({ ...defaultCanvasSubtitleStyle, ...preset.style }),
    builtIn: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  }));
}

export function canvasSubtitleStyleFromConfig(config: CanvasNodeConfig): CanvasSubtitleStyle {
  return normalizeCanvasSubtitleStyle(config);
}

export function canvasSubtitleStyleConfig(style: CanvasSubtitleStyle): CanvasNodeConfig {
  return { ...normalizeCanvasSubtitleStyle(style) };
}

export function normalizeCanvasSubtitleStyle(value: Partial<CanvasSubtitleStyle> | CanvasNodeConfig | unknown): CanvasSubtitleStyle {
  const input = isRecord(value) ? value : {};
  return {
    fontFamily: stringValue(input.fontFamily, defaultCanvasSubtitleStyle.fontFamily).slice(0, 120),
    fontSizePercent: boundedNumber(input.fontSizePercent, CANVAS_SUBTITLE_STYLE_LIMITS.fontSizePercent, defaultCanvasSubtitleStyle.fontSizePercent),
    bold: booleanValue(input.bold, defaultCanvasSubtitleStyle.bold),
    textColor: colorValue(input.textColor, defaultCanvasSubtitleStyle.textColor),
    outlineColor: colorValue(input.outlineColor, defaultCanvasSubtitleStyle.outlineColor),
    outlineWidthPercent: boundedNumber(input.outlineWidthPercent, CANVAS_SUBTITLE_STYLE_LIMITS.outlineWidthPercent, defaultCanvasSubtitleStyle.outlineWidthPercent),
    backgroundEnabled: booleanValue(input.backgroundEnabled, defaultCanvasSubtitleStyle.backgroundEnabled),
    backgroundColor: colorValue(input.backgroundColor, defaultCanvasSubtitleStyle.backgroundColor),
    backgroundOpacity: boundedNumber(input.backgroundOpacity, CANVAS_SUBTITLE_STYLE_LIMITS.backgroundOpacity, defaultCanvasSubtitleStyle.backgroundOpacity),
    verticalPosition: enumValue(input.verticalPosition, ["top", "middle", "bottom"], defaultCanvasSubtitleStyle.verticalPosition),
    horizontalAlign: enumValue(input.horizontalAlign, ["left", "center", "right"], defaultCanvasSubtitleStyle.horizontalAlign),
    verticalMarginPercent: boundedNumber(input.verticalMarginPercent, CANVAS_SUBTITLE_STYLE_LIMITS.verticalMarginPercent, defaultCanvasSubtitleStyle.verticalMarginPercent),
    maxCharsPerLine: Math.round(boundedNumber(input.maxCharsPerLine, CANVAS_SUBTITLE_STYLE_LIMITS.maxCharsPerLine, defaultCanvasSubtitleStyle.maxCharsPerLine)),
  };
}

export function validateCanvasSubtitleStyle(value: Partial<CanvasSubtitleStyle> | CanvasNodeConfig | unknown) {
  if (!isRecord(value)) return ["Subtitle style must be an object."];
  const errors: string[] = [];
  if (!stringValue(value.fontFamily, "")) errors.push("Subtitle font is required.");
  validateBoundedNumber(errors, value.fontSizePercent, CANVAS_SUBTITLE_STYLE_LIMITS.fontSizePercent, "Subtitle font size");
  validateBoundedNumber(errors, value.outlineWidthPercent, CANVAS_SUBTITLE_STYLE_LIMITS.outlineWidthPercent, "Subtitle outline width");
  validateBoundedNumber(errors, value.backgroundOpacity, CANVAS_SUBTITLE_STYLE_LIMITS.backgroundOpacity, "Subtitle background opacity");
  validateBoundedNumber(errors, value.verticalMarginPercent, CANVAS_SUBTITLE_STYLE_LIMITS.verticalMarginPercent, "Subtitle vertical margin");
  validateBoundedNumber(errors, value.maxCharsPerLine, CANVAS_SUBTITLE_STYLE_LIMITS.maxCharsPerLine, "Subtitle characters per line", true);
  for (const key of ["textColor", "outlineColor", "backgroundColor"] as const) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(String(value[key] || ""))) errors.push(`${key} must be a six-digit hex color.`);
  }
  if (!["top", "middle", "bottom"].includes(String(value.verticalPosition))) errors.push("Subtitle vertical position is invalid.");
  if (!["left", "center", "right"].includes(String(value.horizontalAlign))) errors.push("Subtitle horizontal alignment is invalid.");
  if (typeof value.bold !== "boolean") errors.push("Subtitle bold setting must be boolean.");
  if (typeof value.backgroundEnabled !== "boolean") errors.push("Subtitle background setting must be boolean.");
  return errors;
}

export function normalizeCanvasSubtitlePresetName(value: unknown) {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function colorValue(value: unknown, fallback: string) {
  const normalized = String(value || "").trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : fallback;
}

function boundedNumber(value: unknown, limits: { min: number; max: number }, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(limits.min, Math.min(limits.max, numeric)) : fallback;
}

function enumValue<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return values.includes(value as T) ? value as T : fallback;
}

function validateBoundedNumber(errors: string[], value: unknown, limits: { min: number; max: number }, label: string, integer = false) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < limits.min || numeric > limits.max || (integer && !Number.isInteger(numeric))) {
    errors.push(`${label} must be ${integer ? "an integer " : ""}from ${limits.min} to ${limits.max}.`);
  }
}
