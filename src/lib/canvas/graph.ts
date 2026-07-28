import { getCanvasNodeDefinition, getCanvasNodeExecutionMode, validateCanvasNodeConfig } from "./registry";
import { areCanvasPortKindsCompatible, CANVAS_NODE_SIZE_LIMITS, CANVAS_SCHEDULER_ROLES, isCanvasNodeSize } from "./types";
import type { CanvasEdge, CanvasGraph, CanvasGraphValidation, CanvasNodeCapability, CanvasRunPlan, CanvasSchedulerRole } from "./types";

const maxGraphNodes = 200;
const maxGraphEdges = 600;
const schedulerRoles = new Set<CanvasSchedulerRole>(CANVAS_SCHEDULER_ROLES);

export function validateCanvasGraph(graph: CanvasGraph): CanvasGraphValidation {
  const errors: string[] = [];
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    return { valid: false, errors: ["Canvas graph must contain nodes and edges."], order: [] };
  }
  if (graph.nodes.length > maxGraphNodes) errors.push(`Canvas supports at most ${maxGraphNodes} nodes.`);
  if (graph.edges.length > maxGraphEdges) errors.push(`Canvas supports at most ${maxGraphEdges} edges.`);

  const nodes = new Map<string, (typeof graph.nodes)[number]>();
  const schedulerRoleNodes = new Map<CanvasSchedulerRole, string>();
  for (const node of graph.nodes) {
    if (!node.id?.trim()) {
      errors.push("Canvas node id is required.");
      continue;
    }
    if (nodes.has(node.id)) errors.push(`Duplicate canvas node id: ${node.id}.`);
    nodes.set(node.id, node);
    const definition = getCanvasNodeDefinition(node.type, node.version);
    if (!definition) {
      errors.push(`Unknown canvas node type: ${node.type}.`);
      continue;
    }
    if (node.version !== definition.version) errors.push(`${definition.label} node ${node.id} uses unsupported version ${node.version}.`);
    const executionMode = getCanvasNodeExecutionMode(node);
    const schedulerBoundImageInput = (node.schedulerRole === "scene-input" || node.schedulerRole === "vehicle-input")
      && (node.type === "input.images" || node.type === "input.library-images");
    const schedulerBoundCopyInput = node.schedulerRole === "copy-input" && node.type === "input.copy-library";
    if (executionMode === "enabled" && !schedulerBoundImageInput && !schedulerBoundCopyInput) errors.push(...validateCanvasNodeConfig(node.type, node.config || {}, node.version));
    if (executionMode === "bypass" && !definition.bypass) errors.push(`${definition.label} does not support bypass mode.`);
    if (!Number.isFinite(node.position?.x) || !Number.isFinite(node.position?.y)) errors.push(`Node ${node.id} has an invalid position.`);
    if (node.size !== undefined && !isCanvasNodeSize(node.size)) {
      errors.push(`Node ${node.id} size must be between ${CANVAS_NODE_SIZE_LIMITS.minWidth}x${CANVAS_NODE_SIZE_LIMITS.minHeight} and ${CANVAS_NODE_SIZE_LIMITS.maxWidth}x${CANVAS_NODE_SIZE_LIMITS.maxHeight}.`);
    }
    if (node.schedulerRole !== undefined) {
      if (!schedulerRoles.has(node.schedulerRole)) {
        errors.push(`Node ${node.id} has an invalid scheduler role.`);
      } else if (schedulerRoleNodes.has(node.schedulerRole)) {
        errors.push(`Scheduler role ${node.schedulerRole} is already assigned to node ${schedulerRoleNodes.get(node.schedulerRole)}.`);
      } else {
        schedulerRoleNodes.set(node.schedulerRole, node.id);
      }
    }
  }

  const edgeIds = new Set<string>();
  const incoming = new Map<string, CanvasEdge[]>();
  for (const edge of graph.edges) {
    if (!edge.id?.trim() || edgeIds.has(edge.id)) errors.push(`Invalid or duplicate edge id: ${edge.id || "(empty)"}.`);
    edgeIds.add(edge.id);
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (!source || !target) {
      errors.push(`Edge ${edge.id} references a missing node.`);
      continue;
    }
    if (source.id === target.id) errors.push(`Edge ${edge.id} cannot connect a node to itself.`);
    const sourceDefinition = getCanvasNodeDefinition(source.type, source.version);
    const targetDefinition = getCanvasNodeDefinition(target.type, target.version);
    const output = sourceDefinition?.outputs.find((port) => port.id === edge.sourcePort);
    const input = targetDefinition?.inputs.find((port) => port.id === edge.targetPort);
    if (!output) errors.push(`Edge ${edge.id} uses missing output port ${edge.sourcePort}.`);
    if (!input) errors.push(`Edge ${edge.id} uses missing input port ${edge.targetPort}.`);
    if (output && input && !areCanvasPortKindsCompatible(output.kind, input.kind)) errors.push(`Edge ${edge.id} connects ${output.kind} to incompatible ${input.kind}.`);
    const inputKey = `${edge.target}:${edge.targetPort}`;
    const existing = incoming.get(inputKey) || [];
    existing.push(edge);
    incoming.set(inputKey, existing);
    if (input && !input.multiple && existing.length > 1) errors.push(`${targetDefinition?.label || target.id} input ${input.label} accepts one connection.`);
  }

  for (const node of graph.nodes) {
    const definition = getCanvasNodeDefinition(node.type, node.version);
    const executionMode = getCanvasNodeExecutionMode(node);
    const requiredInputs = executionMode === "disabled"
      ? []
      : executionMode === "bypass"
        ? (definition?.inputs || []).filter((input) => input.id === definition?.bypass?.inputPort)
        : (definition?.inputs || []).filter((input) => input.required);
    for (const input of requiredInputs) {
      if (!(incoming.get(`${node.id}:${input.id}`) || []).length) {
        errors.push(`${definition?.label || node.id} requires input ${input.label}.`);
      }
    }
  }

  const order = topologicalOrder(graph, nodes);
  if (order.length !== nodes.size) errors.push("Canvas graph must not contain cycles.");
  return { valid: errors.length === 0, errors: Array.from(new Set(errors)), order };
}

export function buildCanvasRunPlan(graph: CanvasGraph, targetNodeIds?: string[]): CanvasRunPlan {
  const validation = validateCanvasGraph(graph);
  if (!validation.valid) throw new Error(validation.errors.join(" "));
  const allIds = new Set(graph.nodes.map((node) => node.id));
  const targets = Array.from(new Set((targetNodeIds || []).map((id) => id.trim()).filter(Boolean)));
  if (targets.some((id) => !allIds.has(id))) throw new Error("One or more target canvas nodes were not found.");
  const included = targets.length ? collectAncestors(graph, targets) : allIds;
  includePassivePreviewSinks(graph, included);
  const includedNodeIds = validation.order.filter((id) => included.has(id));
  const availableOutputs = new Set<string>();
  const confirmationNodeIds: string[] = [];
  const capabilities: CanvasNodeCapability[] = [];
  const steps = includedNodeIds.map((nodeId) => {
    const node = graph.nodes.find((item) => item.id === nodeId);
    if (!node) return { nodeId, action: "blocked" as const, message: `Canvas node ${nodeId} was not found.` };
    const definition = getCanvasNodeDefinition(node.type, node.version);
    if (!definition) return { nodeId, action: "blocked" as const, message: `Unknown canvas node type: ${node.type}.` };
    const executionMode = getCanvasNodeExecutionMode(node);
    if (executionMode === "disabled") return { nodeId, action: "disabled" as const };

    const requiredInputs = executionMode === "bypass"
      ? definition.inputs.filter((input) => input.id === definition.bypass?.inputPort)
      : definition.inputs.filter((input) => input.required);
    const missingInput = requiredInputs.find((input) => !graph.edges.some((edge) =>
      edge.target === nodeId
      && edge.targetPort === input.id
      && availableOutputs.has(`${edge.source}:${edge.sourcePort}`),
    ));
    if (missingInput) {
      return {
        nodeId,
        action: "blocked" as const,
        message: `${definition.label}: Missing required input ${missingInput.label}.`,
      };
    }

    const action = executionMode === "bypass" ? "bypass" as const : "execute" as const;
    for (const output of definition.outputs) availableOutputs.add(`${nodeId}:${output.id}`);
    if (action === "execute" && definition.capability) {
      confirmationNodeIds.push(nodeId);
      if (!capabilities.includes(definition.capability)) capabilities.push(definition.capability);
    }
    return { nodeId, action };
  });
  const blockers = steps
    .filter((step): step is typeof step & { action: "blocked"; message: string } => step.action === "blocked" && Boolean(step.message))
    .map((step) => ({ nodeId: step.nodeId, message: step.message }));
  return { order: includedNodeIds, includedNodeIds, confirmationNodeIds, capabilities, steps, blockers, preflightBlocked: false };
}

export function collectDescendants(graph: CanvasGraph, nodeIds: string[]) {
  const included = new Set(nodeIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of graph.edges) {
      if (included.has(edge.source) && !included.has(edge.target)) {
        included.add(edge.target);
        changed = true;
      }
    }
  }
  return included;
}

function collectAncestors(graph: CanvasGraph, nodeIds: string[]) {
  const included = new Set(nodeIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of graph.edges) {
      if (included.has(edge.target) && !included.has(edge.source)) {
        included.add(edge.source);
        changed = true;
      }
    }
  }
  return included;
}

function includePassivePreviewSinks(graph: CanvasGraph, included: Set<string>) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of graph.edges) {
      const target = graph.nodes.find((node) => node.id === edge.target);
      const targetDefinition = target && getCanvasNodeDefinition(target.type, target.version);
      if (included.has(edge.source) && targetDefinition?.passiveSink && !included.has(edge.target)) {
        included.add(edge.target);
        changed = true;
      }
    }
  }
}

function topologicalOrder(graph: CanvasGraph, nodes: Map<string, (typeof graph.nodes)[number]>) {
  const indegree = new Map(Array.from(nodes.keys()).map((id) => [id, 0]));
  const outgoing = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) continue;
    indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) || []), edge.target]);
  }
  const ready = Array.from(indegree.entries()).filter(([, value]) => value === 0).map(([id]) => id).sort();
  const order: string[] = [];
  while (ready.length) {
    const id = ready.shift();
    if (!id) break;
    order.push(id);
    for (const target of outgoing.get(id) || []) {
      const next = (indegree.get(target) || 0) - 1;
      indegree.set(target, next);
      if (next === 0) ready.push(target);
    }
    ready.sort();
  }
  return order;
}
