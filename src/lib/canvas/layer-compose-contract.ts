import type { CanvasMediaReference } from "./types";

export type LayerSource = { kind: "image" | "video"; key: string };
export type ComposeSource = LayerSource & { media: CanvasMediaReference; width?: number; height?: number; durationSeconds?: number; hasAudio?: boolean };
export type ComposeLayer = {
  id: string; name: string; kind: "solid" | "image" | "video";
  visible: boolean; locked: boolean; opacity: number;
  x: number; y: number; width: number; height: number;
  color: string; fit: "contain" | "cover";
  crop: { x: number; y: number; width: number; height: number };
  source?: LayerSource; endBehavior: "hold" | "loop" | "hide";
};
export type LayerComposeConfig = {
  protocolVersion: 1; width: number; height: number; background: string;
  durationMode: "longest" | "custom"; durationSeconds: number;
  audioLayerId: string | null; layers: ComposeLayer[];
};
export const LAYER_COMPOSE_LIMITS = { layers: 24, videos: 4, edge: 4096, duration: 600, imageBytes: 30 * 1024 * 1024, videoBytes: 512 * 1024 * 1024 } as const;
export const fullLayerCrop = { x: 0, y: 0, width: 1, height: 1 };
export function newComposeLayer(id: string, kind: ComposeLayer["kind"], width: number, height: number): ComposeLayer {
  return { id, name: kind === "solid" ? "纯色层" : kind === "image" ? "图片层" : "视频层", kind,
    visible: true, locked: false, opacity: 1, x: 0, y: 0, width, height,
    color: "#ffffff", fit: "contain", crop: { ...fullLayerCrop }, endBehavior: "hold" };
}
export function defaultLayerComposeConfig(): LayerComposeConfig {
  return { protocolVersion: 1, width: 1080, height: 1920, background: "#ffffff", durationMode: "longest",
    durationSeconds: 10, audioLayerId: null, layers: [{ ...newComposeLayer("background", "solid", 1080, 1920), name: "背景" }] };
}
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const finite = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const color = (value: unknown) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
export function isLayerComposeConfig(value: unknown): value is LayerComposeConfig {
  if (!record(value) || value.protocolVersion !== 1 || !finite(value.width, 64, 4096) || !Number.isInteger(value.width)
    || !finite(value.height, 64, 4096) || !Number.isInteger(value.height) || !(color(value.background) || value.background === "transparent")
    || !["longest", "custom"].includes(String(value.durationMode)) || !finite(value.durationSeconds, 1 / 30, 600)
    || !(value.audioLayerId === null || typeof value.audioLayerId === "string") || !Array.isArray(value.layers) || value.layers.length > 24) return false;
  const ids = new Set<string>();
  return value.layers.every((layer) => {
    if (!record(layer) || typeof layer.id !== "string" || !layer.id || layer.id.length > 128 || ids.has(layer.id)
      || typeof layer.name !== "string" || layer.name.length > 200 || !["solid", "image", "video"].includes(String(layer.kind))
      || typeof layer.visible !== "boolean" || typeof layer.locked !== "boolean" || !finite(layer.opacity, 0, 1)
      || !finite(layer.x, -32768, 32768) || !finite(layer.y, -32768, 32768) || !finite(layer.width, 1, 16384) || !finite(layer.height, 1, 16384)
      || !color(layer.color) || !["contain", "cover"].includes(String(layer.fit)) || !["hold", "loop", "hide"].includes(String(layer.endBehavior))
      || !record(layer.crop) || !finite(layer.crop.x, 0, 1) || !finite(layer.crop.y, 0, 1)
      || !finite(layer.crop.width, 0.00001, 1) || !finite(layer.crop.height, 0.00001, 1)
      || layer.crop.x + layer.crop.width > 1.000001 || layer.crop.y + layer.crop.height > 1.000001) return false;
    if (layer.source !== undefined && (layer.kind === "solid" || !record(layer.source) || layer.source.kind !== layer.kind || typeof layer.source.key !== "string" || !layer.source.key || layer.source.key.length > 8192)) return false;
    ids.add(layer.id); return true;
  }) && value.layers.filter((layer) => layer.kind === "video").length <= 4;
}
export function validateLayerComposeConfig(value: unknown): string[] {
  if (!isLayerComposeConfig(value)) return ["图层合成参数无效，请检查尺寸、裁剪范围和图层数量。"];
  const visible = value.layers.filter((layer) => layer.visible);
  const errors: string[] = [];
  if (!visible.length) errors.push("请添加至少一个可见图层。");
  if (visible.some((layer) => layer.kind !== "solid" && !layer.source)) errors.push("请为图片和视频图层选择素材。");
  if (visible.some((layer) => layer.kind === "video")) {
    if (value.width % 2 || value.height % 2) errors.push("视频输出宽高必须为偶数。");
    if (value.background === "transparent") errors.push("MP4 不支持透明背景，请选择不透明底色。");
  }
  if (value.audioLayerId !== null && !visible.some((layer) => layer.id === value.audioLayerId && layer.kind === "video")) errors.push("声音来源已隐藏或删除，请重新选择声音来源或静音。");
  return errors;
}
export function composeSourceKey(media: CanvasMediaReference) { return media.sha256 ? `sha256:${media.sha256}` : `url:${media.url}`; }
export function composeSources(images: CanvasMediaReference[], videos: CanvasMediaReference[]): ComposeSource[] {
  const sources = new Map<string, ComposeSource>();
  for (const [kind, items] of [["image", images], ["video", videos]] as const) for (const media of items) {
    const key = composeSourceKey(media);
    sources.set(`${kind}:${key}`, { kind, key, media, width: media.width, height: media.height, durationSeconds: media.durationSeconds, hasAudio: media.hasAudio ?? media.layerComposition?.hasAudio });
  }
  return [...sources.values()];
}
export function findComposeSource(layer: ComposeLayer, sources: ComposeSource[]) {
  return sources.find((source) => source.kind === layer.source?.kind && source.key === layer.source.key);
}
export function composeDuration(config: LayerComposeConfig, sources: ComposeSource[]) {
  const longest = Math.max(0, ...config.layers.filter((layer) => layer.visible && layer.kind === "video").map((layer) => findComposeSource(layer, sources)?.durationSeconds || 0));
  return config.durationMode === "custom" ? config.durationSeconds : longest;
}
export function composeConfigKey(config: LayerComposeConfig) {
  return JSON.stringify({ ...config, layers: config.layers.map((layer) => ({ ...layer, name: undefined, locked: undefined })) });
}
// A single integer-pixel geometry contract drives DOM, Sharp and FFmpeg.
export function composeLayerGeometry(layer: ComposeLayer, sourceWidth: number, sourceHeight: number) {
  let left = Math.min(sourceWidth - 1, Math.round(layer.crop.x * sourceWidth));
  let top = Math.min(sourceHeight - 1, Math.round(layer.crop.y * sourceHeight));
  let width = Math.max(1, Math.min(sourceWidth - left, Math.round(layer.crop.width * sourceWidth)));
  let height = Math.max(1, Math.min(sourceHeight - top, Math.round(layer.crop.height * sourceHeight)));
  if (layer.fit === "cover") {
    const ratio = layer.width / layer.height;
    if (width / height > ratio) { const next = Math.max(1, Math.round(height * ratio)); left += Math.floor((width - next) / 2); width = next; }
    else { const next = Math.max(1, Math.round(width / ratio)); top += Math.floor((height - next) / 2); height = next; }
  }
  const scale = Math.min(layer.width / width, layer.height / height);
  const outputWidth = Math.max(1, Math.round(width * scale));
  const outputHeight = Math.max(1, Math.round(height * scale));
  return { crop: { left, top, width, height }, width: outputWidth, height: outputHeight,
    x: Math.round(layer.x + (layer.width - outputWidth) / 2), y: Math.round(layer.y + (layer.height - outputHeight) / 2) };
}
