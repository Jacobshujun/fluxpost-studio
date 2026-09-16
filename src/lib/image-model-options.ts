export type ToApisRequestFormat = "ratio" | "pixels" | "legacy";

// Convenience metadata only; custom IDs are never checked against this list.
export const imageModelPresets: { model: string; format: ToApisRequestFormat }[] = [
  { model: "gpt-image-2", format: "legacy" },
  { model: "gpt-image-2.0", format: "legacy" },
  { model: "gpt-image-2.0-vip", format: "legacy" },
  { model: "gpt-image-2.5-sunburst", format: "ratio" },
  { model: "gpt-image-2.5-flare", format: "ratio" },
  { model: "gpt-image-2.5-flare-vip", format: "pixels" },
  { model: "gpt-image-2.5-sunburst-vip", format: "pixels" },
  { model: "gpt-image-2.5-official", format: "pixels" },
  { model: "gpt-image-2.5-flare-official", format: "pixels" },
  { model: "gpt-image-2.5-sunburst-official", format: "pixels" },
];

export function normalizeImageModel(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new Error("图片模型 ID 不能为空。");
  return value.trim();
}

export function normalizeToApisRequestFormat(value: unknown): ToApisRequestFormat | undefined {
  if (value === undefined || value === "") return undefined;
  if (value !== "ratio" && value !== "pixels" && value !== "legacy") throw new Error("ToAPIs 请求格式必须为 ratio、pixels 或 legacy。");
  return value;
}

export function legacyRouteRequestFormat(defaultModel: string): ToApisRequestFormat {
  // Only migrate the route's historical default, never the submitted node model.
  if (["gpt-image-2", "gpt-image-2.0", "gpt-image-2.0-vip"].includes(defaultModel)) return "legacy";
  if (["gpt-image-2.5-flare-official", "gpt-image-2.5-sunburst-official", "gpt-image-2.5-flare-vip", "gpt-image-2.5-sunburst-vip"].includes(defaultModel)) return "pixels";
  return "ratio";
}
