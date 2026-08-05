import { decodeCanvasGraphFragment } from "./serialization";
import { CANVAS_GRAPH_LIMITS } from "./types";
import type { CanvasEdge, CanvasGraph, CanvasNode, CanvasPosition, CanvasSchedulerRole } from "./types";

export const CANVAS_CLIPBOARD_MIME = "application/x-fluxpost-canvas-nodes";
const clipboardKind = "fluxpost.canvas.nodes";

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
  if (!copiedNodes.length || copiedNodes.length > CANVAS_GRAPH_LIMITS.maxNodes) return undefined;
  const copiedIds = new Set(copiedNodes.map((node) => node.id));
  const copiedEdges = edges.filter((edge) => copiedIds.has(edge.source) && copiedIds.has(edge.target)).map((edge) => structuredClone(edge));
  if (copiedEdges.length > CANVAS_GRAPH_LIMITS.maxEdges) return undefined;
  return { kind: clipboardKind, version: 1, nodes: copiedNodes, edges: copiedEdges };
}

export function parseCanvasClipboardPayload(value: string): CanvasClipboardPayload | undefined {
  if (!value.trim()) return undefined;
  try {
    const candidate = JSON.parse(value) as unknown;
    if (!isRecord(candidate) || candidate.kind !== clipboardKind || candidate.version !== 1) return undefined;
    const fragment = decodeCanvasGraphFragment(candidate.nodes, candidate.edges);
    return { kind: clipboardKind, version: 1, ...fragment };
  } catch {
    return undefined;
  }
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

export function prepareCanvasClipboardPaste(
  currentGraph: CanvasGraph,
  payload: CanvasClipboardPayload,
  anchor: CanvasPosition,
  createId: (kind: "node" | "edge", index: number) => string,
) {
  const fragment = instantiateCanvasClipboardPayload(payload, anchor, createId);
  if (currentGraph.nodes.length + fragment.nodes.length > CANVAS_GRAPH_LIMITS.maxNodes) {
    throw new Error(`Canvas supports at most ${CANVAS_GRAPH_LIMITS.maxNodes} nodes.`);
  }
  if (currentGraph.edges.length + fragment.edges.length > CANVAS_GRAPH_LIMITS.maxEdges) {
    throw new Error(`Canvas supports at most ${CANVAS_GRAPH_LIMITS.maxEdges} edges.`);
  }
  const currentNodeIds = new Set(currentGraph.nodes.map((node) => node.id));
  const currentEdgeIds = new Set(currentGraph.edges.map((edge) => edge.id));
  if (fragment.nodes.some((node) => currentNodeIds.has(node.id)) || fragment.edges.some((edge) => currentEdgeIds.has(edge.id))) {
    throw new Error("Pasted Canvas ids conflict with the target workflow.");
  }

  const occupiedRoles = new Set(currentGraph.nodes.flatMap((node) => node.schedulerRole ? [node.schedulerRole] : []));
  const clearedSchedulerRoles: CanvasSchedulerRole[] = [];
  const nodes = fragment.nodes.map((node) => {
    if (!node.schedulerRole) return node;
    if (occupiedRoles.has(node.schedulerRole)) {
      clearedSchedulerRoles.push(node.schedulerRole);
      return { ...node, schedulerRole: undefined };
    }
    occupiedRoles.add(node.schedulerRole);
    return node;
  });
  return {
    nodes,
    edges: fragment.edges,
    clearedSchedulerRoles: Array.from(new Set(clearedSchedulerRoles)),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
