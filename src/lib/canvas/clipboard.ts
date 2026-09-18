import { decodeCanvasGraphFragment, decodeCanvasGroups } from "./serialization";
import { getCanvasGraphBudget, stripPortableCanvasNode } from "./iteration";
import { isLayerComposeConfig } from "./layer-compose-contract";
import { CANVAS_GRAPH_LIMITS } from "./types";
import type { CanvasEdge, CanvasGraph, CanvasGroup, CanvasNode, CanvasPosition, CanvasSchedulerRole } from "./types";

export const CANVAS_CLIPBOARD_MIME = "application/x-fluxpost-canvas-nodes";
const clipboardKind = "fluxpost.canvas.nodes";

export type CanvasClipboardPayload = {
  kind: typeof clipboardKind;
  version: 1;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  groups?: CanvasGroup[];
};

export function createCanvasClipboardPayload(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  selectedNodeIds: Iterable<string>,
  groups: CanvasGroup[] = [],
): CanvasClipboardPayload | undefined {
  const selected = new Set(selectedNodeIds);
  const copiedNodes = nodes.filter((node) => selected.has(node.id)).map(stripPortableCanvasNode);
  if ((!copiedNodes.length && !groups.length) || copiedNodes.length > CANVAS_GRAPH_LIMITS.maxNodes) return undefined;
  const copiedIds = new Set(copiedNodes.map((node) => node.id));
  const copiedEdges = edges.filter((edge) => copiedIds.has(edge.source) && copiedIds.has(edge.target)).map((edge) => structuredClone(edge));
  if (copiedEdges.length > CANVAS_GRAPH_LIMITS.maxEdges) return undefined;
  const budget = getCanvasGraphBudget({ nodes: copiedNodes, edges: copiedEdges });
  if (budget.nodes > CANVAS_GRAPH_LIMITS.maxNodes || budget.edges > CANVAS_GRAPH_LIMITS.maxEdges) return undefined;
  return { kind: clipboardKind, version: 1, nodes: copiedNodes, edges: copiedEdges, ...(groups.length ? { groups: structuredClone(groups) } : {}) };
}

export function parseCanvasClipboardPayload(value: string): CanvasClipboardPayload | undefined {
  if (!value.trim()) return undefined;
  try {
    const candidate = JSON.parse(value) as unknown;
    if (!isRecord(candidate) || candidate.kind !== clipboardKind || candidate.version !== 1) return undefined;
    const groups = candidate.groups === undefined ? undefined : decodeCanvasGroups(candidate.groups);
    const fragment = decodeCanvasGraphFragment(candidate.nodes, candidate.edges, Boolean(groups?.length));
    return { kind: clipboardKind, version: 1, ...fragment, ...(groups ? { groups } : {}) };
  } catch {
    return undefined;
  }
}

export function instantiateCanvasClipboardPayload(
  payload: CanvasClipboardPayload,
  anchor: CanvasPosition,
  createId: (kind: "node" | "edge" | "group", index: number) => string,
) {
  const positions = [...payload.nodes, ...(payload.groups || [])].map((entry) => entry.position);
  const minX = Math.min(...positions.map((position) => position.x));
  const minY = Math.min(...positions.map((position) => position.y));
  const idMap = new Map(payload.nodes.map((node, index) => [node.id, createId("node", index)]));
  let nodeIndex = payload.nodes.length;
  let edgeIndex = payload.edges.length;
  let groupIndex = payload.groups?.length || 0;
  const cloneNode = (source: CanvasNode, copiedIds: Map<string, string>): CanvasNode => {
    const cloned = stripPortableCanvasNode(source);
    if (isLayerComposeConfig(cloned.config.composition)) {
      for (const layer of cloned.config.composition.layers) {
        if (layer.source?.binding && copiedIds.has(layer.source.binding.nodeId)) {
          layer.source.binding.nodeId = copiedIds.get(layer.source.binding.nodeId)!;
        }
      }
    }
    if (!cloned.iteration) return cloned;
    const graph = cloned.iteration.graph;
    if (graph.groups) graph.groups = graph.groups.map((group) => ({ ...group, id: createId("group", groupIndex++) }));
    const innerIds = new Map(graph.nodes.map((node) => [node.id, createId("node", nodeIndex++)]));
    graph.nodes = graph.nodes.map((node) => ({ ...cloneNode(node, innerIds), id: innerIds.get(node.id)! }));
    graph.edges = graph.edges.map((edge) => ({ ...edge, id: createId("edge", edgeIndex++), source: innerIds.get(edge.source)!, target: innerIds.get(edge.target)! }));
    for (const selector of Object.values(cloned.iteration.outputs)) selector.nodeId = innerIds.get(selector.nodeId)!;
    return cloned;
  };
  const nodes = payload.nodes.map((node) => ({
    ...cloneNode(node, idMap),
    id: idMap.get(node.id) as string,
    position: { x: anchor.x + node.position.x - minX, y: anchor.y + node.position.y - minY },
  }));
  const edges = payload.edges.map((edge, index) => ({
    ...structuredClone(edge),
    id: createId("edge", index),
    source: idMap.get(edge.source) as string,
    target: idMap.get(edge.target) as string,
  }));
  const groups = payload.groups?.map((group, index) => ({ ...structuredClone(group), id: createId("group", index),
    position: { x: anchor.x + group.position.x - minX, y: anchor.y + group.position.y - minY } }));
  return { nodes, edges, ...(groups ? { groups } : {}) };
}

export function prepareCanvasClipboardPaste(
  currentGraph: CanvasGraph,
  payload: CanvasClipboardPayload,
  anchor: CanvasPosition,
  createId: (kind: "node" | "edge" | "group", index: number) => string,
) {
  const fragment = instantiateCanvasClipboardPayload(payload, anchor, createId);
  const budget = getCanvasGraphBudget({ nodes: [...currentGraph.nodes, ...fragment.nodes], edges: [...currentGraph.edges, ...fragment.edges] });
  if (budget.nodes > CANVAS_GRAPH_LIMITS.maxNodes) {
    throw new Error(`Canvas supports at most ${CANVAS_GRAPH_LIMITS.maxNodes} nodes.`);
  }
  if (budget.edges > CANVAS_GRAPH_LIMITS.maxEdges) {
    throw new Error(`Canvas supports at most ${CANVAS_GRAPH_LIMITS.maxEdges} edges.`);
  }
  const currentNodeIds = new Set(currentGraph.nodes.map((node) => node.id));
  const currentEdgeIds = new Set(currentGraph.edges.map((edge) => edge.id));
  const groups = [...(currentGraph.groups || []), ...(fragment.groups || [])];
  if (groups.length > CANVAS_GRAPH_LIMITS.maxNodes || new Set(groups.map((group) => group.id)).size !== groups.length) {
    throw new Error("Pasted Canvas groups exceed the limit or conflict with existing ids.");
  }
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
    ...(fragment.groups ? { groups: fragment.groups } : {}),
    clearedSchedulerRoles: Array.from(new Set(clearedSchedulerRoles)),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
