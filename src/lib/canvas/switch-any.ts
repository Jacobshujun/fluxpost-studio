import { CANVAS_GRAPH_LIMITS } from "./types";
import type { CanvasArtifact, CanvasNode } from "./types";

// The last port is a spare. The graph's edge budget limits actual connections.
export const canvasSwitchValuePortIds = Array.from({ length: CANVAS_GRAPH_LIMITS.maxEdges + 1 }, (_, index) => `value${index}`);

export function parseCanvasSwitchIndex(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return undefined;
  const index = Number(text);
  return Number.isSafeInteger(index) && index <= CANVAS_GRAPH_LIMITS.maxEdges ? index : undefined;
}

export function resolveCanvasSwitchValue(node: CanvasNode, inputs: Record<string, CanvasArtifact[]>):
  { artifact: CanvasArtifact; error?: never } | { artifact?: never; error: string } {
  const label = `${node.label?.trim() || "Switch Any"} (${node.id})`;
  let rawIndex: unknown = node.config.index;
  if (Object.hasOwn(inputs, "index")) {
    const values = inputs.index;
    if (values.length !== 1 || values[0].kind !== "text") return { error: `${label}: index 需要一路数字文本，上游结果缺失或类型不正确。` };
    rawIndex = values[0].value;
  }
  const index = parseCanvasSwitchIndex(rawIndex);
  if (index === undefined) return { error: `${label}: index 必须是 0–${CANVAS_GRAPH_LIMITS.maxEdges} 的非负十进制整数。` };
  const values = inputs[`value${index}`];
  if (values?.length !== 1) return { error: `${label}: 选中的 value${index} 未连接或没有可用结果。` };
  return { artifact: structuredClone(values[0]) };
}
