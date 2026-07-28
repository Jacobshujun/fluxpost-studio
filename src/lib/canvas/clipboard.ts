import { getCanvasNodeDefinition } from "./registry";
import { areCanvasPortKindsCompatible, isCanvasNodeSize } from "./types";
import type { CanvasEdge, CanvasNode, CanvasPosition } from "./types";

export const CANVAS_CLIPBOARD_MIME = "application/x-fluxpost-canvas-nodes";
const clipboardKind = "fluxpost.canvas.nodes";
const maxClipboardNodes = 100;
const maxClipboardEdges = 300;

export type CanvasClipboardPayload = {
  kind: typeof clipboardKind;
  version: 1;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
};

export function createCanvasClipboardPayload(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  selectedNodeIds: Iterable<string>,
): CanvasClipboardPayload | undefined {
  const selected = new Set(selectedNodeIds);
  const copiedNodes = nodes.filter((node) => selected.has(node.id)).map((node) => structuredClone(node));
  if (!copiedNodes.length || copiedNodes.length > maxClipboardNodes) return undefined;
  const copiedIds = new Set(copiedNodes.map((node) => node.id));
  return {
    kind: clipboardKind,
    version: 1,
    nodes: copiedNodes,
    edges: edges.filter((edge) => copiedIds.has(edge.source) && copiedIds.has(edge.target)).map((edge) => structuredClone(edge)),
  };
}

export function parseCanvasClipboardPayload(value: string): CanvasClipboardPayload | undefined {
  if (!value.trim()) return undefined;
  let candidate: unknown;
  try {
    candidate = JSON.parse(value);
  } catch {
    return undefined;
  }
  if (!isRecord(candidate) || candidate.kind !== clipboardKind || candidate.version !== 1) return undefined;
  if (!Array.isArray(candidate.nodes) || !candidate.nodes.length || candidate.nodes.length > maxClipboardNodes) return undefined;
  if (!Array.isArray(candidate.edges) || candidate.edges.length > maxClipboardEdges) return undefined;

  const nodes: CanvasNode[] = [];
  const nodeIds = new Set<string>();
  for (const valueNode of candidate.nodes) {
    if (!isRecord(valueNode) || !isClipboardId(valueNode.id) || nodeIds.has(valueNode.id)) return undefined;
    const definition = typeof valueNode.type === "string" && typeof valueNode.version === "number"
      ? getCanvasNodeDefinition(valueNode.type as CanvasNode["type"], valueNode.version)
      : undefined;
    if (!definition || valueNode.version !== definition.version || !isPosition(valueNode.position) || !isCanvasNodeConfig(valueNode.config)) return undefined;
    if (valueNode.label !== undefined && (typeof valueNode.label !== "string" || valueNode.label.length > 120)) return undefined;
    if (valueNode.executionMode !== undefined && !["enabled", "bypass", "disabled"].includes(String(valueNode.executionMode))) return undefined;
    if (valueNode.size !== undefined && !isCanvasNodeSize(valueNode.size)) return undefined;
    nodeIds.add(valueNode.id);
    nodes.push({
      id: valueNode.id,
      type: definition.type,
      version: definition.version,
      position: { x: valueNode.position.x, y: valueNode.position.y },
      config: structuredClone(valueNode.config),
      ...(isCanvasNodeSize(valueNode.size) ? { size: structuredClone(valueNode.size) } : {}),
      ...(typeof valueNode.label === "string" ? { label: valueNode.label } : {}),
      ...(typeof valueNode.executionMode === "string" ? { executionMode: valueNode.executionMode as CanvasNode["executionMode"] } : {}),
    });
  }

  const edges: CanvasEdge[] = [];
  const edgeIds = new Set<string>();
  for (const valueEdge of candidate.edges) {
    if (!isRecord(valueEdge) || !isClipboardId(valueEdge.id) || edgeIds.has(valueEdge.id)) return undefined;
    if (typeof valueEdge.source !== "string" || typeof valueEdge.target !== "string" || !nodeIds.has(valueEdge.source) || !nodeIds.has(valueEdge.target)) return undefined;
    if (typeof valueEdge.sourcePort !== "string" || typeof valueEdge.targetPort !== "string") return undefined;
    const source = nodes.find((node) => node.id === valueEdge.source);
    const target = nodes.find((node) => node.id === valueEdge.target);
    const output = source && getCanvasNodeDefinition(source.type, source.version)?.outputs.find((port) => port.id === valueEdge.sourcePort);
    const input = target && getCanvasNodeDefinition(target.type, target.version)?.inputs.find((port) => port.id === valueEdge.targetPort);
    if (!output || !input || !areCanvasPortKindsCompatible(output.kind, input.kind)) return undefined;
    edgeIds.add(valueEdge.id);
    edges.push({
      id: valueEdge.id,
      source: valueEdge.source,
      sourcePort: valueEdge.sourcePort,
      target: valueEdge.target,
      targetPort: valueEdge.targetPort,
    });
  }
  if (hasCycle(nodes, edges)) return undefined;
  return { kind: clipboardKind, version: 1, nodes, edges };
}

export function instantiateCanvasClipboardPayload(
  payload: CanvasClipboardPayload,
  anchor: CanvasPosition,
  createId: (kind: "node" | "edge", index: number) => string,
) {
  const minX = Math.min(...payload.nodes.map((node) => node.position.x));
  const minY = Math.min(...payload.nodes.map((node) => node.position.y));
  const idMap = new Map(payload.nodes.map((node, index) => [node.id, createId("node", index)]));
  const nodes = payload.nodes.map((node) => ({
    ...structuredClone(node),
    id: idMap.get(node.id) as string,
    position: { x: anchor.x + node.position.x - minX, y: anchor.y + node.position.y - minY },
  }));
  const edges = payload.edges.map((edge, index) => ({
    ...structuredClone(edge),
    id: createId("edge", index),
    source: idMap.get(edge.source) as string,
    target: idMap.get(edge.target) as string,
  }));
  return { nodes, edges };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPosition(value: unknown): value is CanvasPosition {
  return isRecord(value) && typeof value.x === "number" && typeof value.y === "number"
    && Number.isFinite(value.x) && Number.isFinite(value.y) && Math.abs(value.x) <= 10_000_000 && Math.abs(value.y) <= 10_000_000;
}

function isClipboardId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 160;
}

function isCanvasNodeConfig(value: unknown): value is CanvasNode["config"] {
  if (!isRecord(value)) return false;
  return Object.values(value).every((item) =>
    item === null || item === undefined || typeof item === "string" || typeof item === "boolean"
      || (typeof item === "number" && Number.isFinite(item))
      || (Array.isArray(item) && item.every((entry) => typeof entry === "string")),
  );
}

function hasCycle(nodes: CanvasNode[], edges: CanvasEdge[]) {
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    outgoing.get(edge.source)?.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1);
  }
  const ready = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  let visited = 0;
  while (ready.length) {
    const id = ready.pop() as string;
    visited += 1;
    for (const target of outgoing.get(id) || []) {
      const next = (indegree.get(target) || 0) - 1;
      indegree.set(target, next);
      if (next === 0) ready.push(target);
    }
  }
  return visited !== nodes.length;
}
