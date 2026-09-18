import { getCanvasNodeDefinition, getCanvasNodeExecutionMode } from "./registry";
import type { CanvasGroup, CanvasNode, CanvasNodeExecutionMode, CanvasPosition } from "./types";

export type CanvasNodeBounds = { id: string; position: CanvasPosition; width: number; height: number };

export function canvasGroupMembers(group: CanvasGroup, nodes: CanvasNodeBounds[]): string[] {
  return nodes.filter(({ position: p, width, height }) => p.x >= group.position.x && p.y >= group.position.y
    && p.x + width <= group.position.x + group.size.width
    && p.y + height <= group.position.y + group.size.height).map((node) => node.id);
}

export function createCanvasGroup(id: string, nodes: CanvasNodeBounds[]): CanvasGroup | undefined {
  if (!nodes.length) return undefined;
  const x = Math.min(...nodes.map((node) => node.position.x)) - 24;
  const y = Math.min(...nodes.map((node) => node.position.y)) - 56;
  return { id, title: "分组", color: "#3b82f6", position: { x, y }, size: {
    width: Math.max(...nodes.map((node) => node.position.x + node.width)) - x + 24,
    height: Math.max(...nodes.map((node) => node.position.y + node.height)) - y + 24,
  } };
}

export function toggleCanvasNodeModes(nodes: CanvasNode[], ids: Iterable<string>, mode: Exclude<CanvasNodeExecutionMode, "enabled">) {
  const selected = new Set(ids);
  const skipped: string[] = [];
  const changed = nodes.map((node) => {
    if (!selected.has(node.id)) return node;
    if (node.type === "input.iteration-item" || (mode === "bypass" && !getCanvasNodeDefinition(node.type, node.version)?.bypass)) {
      skipped.push(node.id);
      return node;
    }
    return { ...node, executionMode: getCanvasNodeExecutionMode(node) === mode ? "enabled" as const : mode };
  });
  return { nodes: changed, skipped };
}
