import { getCanvasNodeDefinition } from "./registry";
import {
  areCanvasPortKindsCompatible,
  CANVAS_GRAPH_LIMITS,
  CANVAS_SCHEDULER_ROLES,
  isCanvasNodeSize,
} from "./types";
import type { CanvasEdge, CanvasGraph, CanvasNode, CanvasPosition, CanvasViewport } from "./types";

const maxCoordinate = 10_000_000;
const maxIdentifierLength = 160;
const maxNodeLabelLength = 120;
const maxViewportZoom = 16;
const schedulerRoles = new Set<string>(CANVAS_SCHEDULER_ROLES);

export class CanvasSerializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanvasSerializationError";
  }
}

export function decodeCanvasGraph(value: unknown): CanvasGraph {
  if (!isRecord(value)) throw new CanvasSerializationError("Canvas graph must be an object.");
  const fragment = decodeCanvasGraphFragment(value.nodes, value.edges, true);
  return { ...fragment, viewport: decodeCanvasViewport(value.viewport) };
}

export function decodeCanvasGraphFragment(nodesValue: unknown, edgesValue: unknown, allowEmpty = false) {
  if (!Array.isArray(nodesValue) || (!allowEmpty && nodesValue.length === 0)) {
    throw new CanvasSerializationError("Canvas graph must contain at least one node.");
  }
  if (nodesValue.length > CANVAS_GRAPH_LIMITS.maxNodes) {
    throw new CanvasSerializationError(`Canvas supports at most ${CANVAS_GRAPH_LIMITS.maxNodes} nodes.`);
  }
  if (!Array.isArray(edgesValue)) throw new CanvasSerializationError("Canvas graph edges must be an array.");
  if (edgesValue.length > CANVAS_GRAPH_LIMITS.maxEdges) {
    throw new CanvasSerializationError(`Canvas supports at most ${CANVAS_GRAPH_LIMITS.maxEdges} edges.`);
  }

  const nodes: CanvasNode[] = [];
  const nodeIds = new Set<string>();
  for (const valueNode of nodesValue) {
    if (!isRecord(valueNode) || !isCanvasIdentifier(valueNode.id) || nodeIds.has(valueNode.id)) {
      throw new CanvasSerializationError("Canvas nodes must have unique valid ids.");
    }
    const definition = typeof valueNode.type === "string" && typeof valueNode.version === "number"
      ? getCanvasNodeDefinition(valueNode.type as CanvasNode["type"], valueNode.version)
      : undefined;
    if (!definition || valueNode.version !== definition.version) {
      throw new CanvasSerializationError(`Unknown canvas node type or version: ${String(valueNode.type || "(missing)")}.`);
    }
    if (!isCanvasPosition(valueNode.position)) throw new CanvasSerializationError(`Node ${valueNode.id} has an invalid position.`);
    if (!isCanvasNodeConfig(valueNode.config)) throw new CanvasSerializationError(`Node ${valueNode.id} has an invalid config.`);
    if (valueNode.label !== undefined && (typeof valueNode.label !== "string" || valueNode.label.length > maxNodeLabelLength)) {
      throw new CanvasSerializationError(`Node ${valueNode.id} has an invalid label.`);
    }
    if (valueNode.executionMode !== undefined && !["enabled", "bypass", "disabled"].includes(String(valueNode.executionMode))) {
      throw new CanvasSerializationError(`Node ${valueNode.id} has an invalid execution mode.`);
    }
    if (valueNode.size !== undefined && !isCanvasNodeSize(valueNode.size)) {
      throw new CanvasSerializationError(`Node ${valueNode.id} has an invalid size.`);
    }
    if (valueNode.schedulerRole !== undefined && (typeof valueNode.schedulerRole !== "string" || !schedulerRoles.has(valueNode.schedulerRole))) {
      throw new CanvasSerializationError(`Node ${valueNode.id} has an invalid scheduler role.`);
    }
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
      ...(typeof valueNode.schedulerRole === "string" ? { schedulerRole: valueNode.schedulerRole as CanvasNode["schedulerRole"] } : {}),
    });
  }

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const edges: CanvasEdge[] = [];
  const edgeIds = new Set<string>();
  for (const valueEdge of edgesValue) {
    if (!isRecord(valueEdge) || !isCanvasIdentifier(valueEdge.id) || edgeIds.has(valueEdge.id)) {
      throw new CanvasSerializationError("Canvas edges must have unique valid ids.");
    }
    if (typeof valueEdge.source !== "string" || typeof valueEdge.target !== "string") {
      throw new CanvasSerializationError(`Edge ${valueEdge.id} has invalid node references.`);
    }
    const source = nodesById.get(valueEdge.source);
    const target = nodesById.get(valueEdge.target);
    if (!source || !target) throw new CanvasSerializationError(`Edge ${valueEdge.id} references a missing node.`);
    if (typeof valueEdge.sourcePort !== "string" || typeof valueEdge.targetPort !== "string") {
      throw new CanvasSerializationError(`Edge ${valueEdge.id} has invalid ports.`);
    }
    const output = getCanvasNodeDefinition(source.type, source.version)?.outputs.find((port) => port.id === valueEdge.sourcePort);
    const input = getCanvasNodeDefinition(target.type, target.version)?.inputs.find((port) => port.id === valueEdge.targetPort);
    if (!output || !input) throw new CanvasSerializationError(`Edge ${valueEdge.id} uses a missing port.`);
    if (!areCanvasPortKindsCompatible(output.kind, input.kind)) {
      throw new CanvasSerializationError(`Edge ${valueEdge.id} connects incompatible ports.`);
    }
    edgeIds.add(valueEdge.id);
    edges.push({
      id: valueEdge.id,
      source: valueEdge.source,
      sourcePort: valueEdge.sourcePort,
      target: valueEdge.target,
      targetPort: valueEdge.targetPort,
    });
  }
  if (hasCycle(nodes, edges)) throw new CanvasSerializationError("Canvas graph must not contain cycles.");
  return { nodes, edges };
}

function decodeCanvasViewport(value: unknown): CanvasViewport {
  if (!isRecord(value) || !isCanvasCoordinate(value.x) || !isCanvasCoordinate(value.y)
    || typeof value.zoom !== "number" || !Number.isFinite(value.zoom) || value.zoom <= 0 || value.zoom > maxViewportZoom) {
    throw new CanvasSerializationError("Canvas workflow viewport is invalid.");
  }
  return { x: value.x, y: value.y, zoom: value.zoom };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCanvasPosition(value: unknown): value is CanvasPosition {
  return isRecord(value) && isCanvasCoordinate(value.x) && isCanvasCoordinate(value.y);
}

function isCanvasCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= maxCoordinate;
}

function isCanvasIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxIdentifierLength;
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
