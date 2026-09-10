import { getCanvasNodeDefinition, createCanvasNode, getCanvasNodeExecutionMode, validateCanvasNodeConfig } from "./registry";
import { validateCanvasGraph, validateCanvasGraphForPersistence } from "./graph";
import { CANVAS_GRAPH_LIMITS } from "./types";
import type { CanvasArtifact, CanvasGraph, CanvasIterationDefinition, CanvasNode, CanvasNodeConfig, CanvasNodeType, CanvasPortDefinition } from "./types";

export const canvasIterationAllowedNodeTypes: readonly CanvasNodeType[] = [
  "input.iteration-item", "input.text", "input.images", "model.gpt-text", "model.gpt-image", "model.gpt-vision",
  "utility.prompt-template", "utility.text-concatenate", "utility.prompt-switch", "utility.text-split",
  "utility.image-select", "utility.image-transform", "utility.media-mask", "utility.image-preview", "utility.display-any",
];

export function createCanvasIterationDefinition(): CanvasIterationDefinition {
  const root = createCanvasNode("input.iteration-item", "iteration-item", { x: 80, y: 120 });
  const vision = createCanvasNode("model.gpt-vision", "iteration-vision", { x: 420, y: 120 });
  return {
    graph: {
      nodes: [root, vision],
      edges: [
        { id: "iteration-images", source: root.id, sourcePort: "images", target: vision.id, targetPort: "images" },
        { id: "iteration-text", source: root.id, sourcePort: "text", target: vision.id, targetPort: "instruction" },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    outputs: { text: { nodeId: vision.id, outputPort: "text" } },
  };
}

export function getCanvasIterationOutputPorts(node: CanvasNode): CanvasPortDefinition[] {
  const ports = getCanvasNodeDefinition(node.type, node.version)?.outputs || [];
  return node.type === "utility.image-iterate"
    ? ports.filter((port) => Object.hasOwn(node.iteration?.outputs || {}, port.id))
    : ports;
}

export function getCanvasGraphBudget(graph: Pick<CanvasGraph, "nodes" | "edges">) {
  let nodes = graph.nodes.length;
  let edges = graph.edges.length;
  const pending = [...graph.nodes];
  const visited = new Set<CanvasNode>();
  while (pending.length) {
    const node = pending.pop()!;
    if (visited.has(node)) return { nodes: Infinity, edges: Infinity };
    visited.add(node);
    if (!node.iteration?.graph) continue;
    nodes += node.iteration.graph.nodes.length;
    edges += node.iteration.graph.edges.length;
    pending.push(...node.iteration.graph.nodes);
  }
  return { nodes, edges };
}

export function validateCanvasIteration(node: CanvasNode, validateExecution = true): string[] {
  const errors: string[] = [];
  if (node.type !== "utility.image-iterate") {
    if (node.iteration !== undefined) errors.push("Only image iteration regions may contain an inner graph.");
    if (node.frozenOutputs !== undefined) errors.push("Only image iteration regions may contain frozen outputs.");
    return errors;
  }
  const iteration = node.iteration;
  if (validateExecution && !node.frozenOutputs) errors.push(...validateCanvasNodeConfig(node.type, node.config, node.version));
  if (!iteration || !iteration.graph || !Array.isArray(iteration.graph.nodes) || !Array.isArray(iteration.graph.edges)
    || !iteration.outputs || typeof iteration.outputs !== "object" || Array.isArray(iteration.outputs)) {
    return ["Image iteration requires an inner graph and output selectors."];
  }
  const children = iteration.graph.nodes;
  if (children.some((child) => child.type === "utility.image-iterate" || child.iteration !== undefined)) return ["Nested iteration regions are not allowed."];
  const roots = children.filter((child) => child.type === "input.iteration-item");
  if (roots.length !== 1) errors.push("Image iteration requires exactly one iteration item root.");
  if (roots.some((root) => getCanvasNodeExecutionMode(root) !== "enabled" || Object.keys(root.config).length)) errors.push("Iteration item root must be enabled with empty config.");
  if (iteration.graph.edges.some((edge) => roots.some((root) => edge.target === root.id))) errors.push("Iteration item root cannot have incoming edges.");
  for (const child of children) {
    if (!canvasIterationAllowedNodeTypes.includes(child.type)) errors.push(`Node type ${child.type} is not allowed inside image iteration.`);
    if (child.schedulerRole !== undefined) errors.push("Iteration inner nodes cannot declare scheduler roles.");
  }
  const validation = validateExecution && !node.frozenOutputs ? validateCanvasGraph(iteration.graph) : validateCanvasGraphForPersistence(iteration.graph);
  errors.push(...validation.errors);
  const outputs = Object.entries(iteration.outputs);
  if (validateExecution && !outputs.length) errors.push("Image iteration requires at least one selected output.");
  for (const [kind, selector] of outputs) {
    if (kind !== "text" && kind !== "images") { errors.push(`Unsupported iteration output: ${kind}.`); continue; }
    const selected = selector && children.find((child) => child.id === selector.nodeId);
    const port = selected && getCanvasNodeDefinition(selected.type, selected.version)?.outputs.find((output) => output.id === selector.outputPort);
    if (!selected || !port || port.kind !== kind) errors.push(`Iteration ${kind} output must select a matching inner node port.`);
    else if (getCanvasNodeExecutionMode(selected) === "disabled") errors.push(`Iteration ${kind} output selects a disabled node.`);
  }
  const budget = getCanvasGraphBudget({ nodes: [node], edges: [] });
  if (budget.nodes > CANVAS_GRAPH_LIMITS.maxNodes || budget.edges > CANVAS_GRAPH_LIMITS.maxEdges) errors.push("Iteration exceeds the total Canvas graph budget.");
  if (node.frozenOutputs !== undefined) {
    if (!node.frozenOutputs || typeof node.frozenOutputs !== "object" || Array.isArray(node.frozenOutputs)) errors.push("Iteration frozen outputs must be an object.");
    else {
      for (const [kind, artifact] of Object.entries(node.frozenOutputs)) {
        if (!Object.hasOwn(iteration.outputs, kind) || (kind !== "text" && kind !== "images") || artifact?.kind !== kind
          || (artifact.kind === "text" && typeof artifact.value !== "string")
          || (artifact.kind === "images" && (!Array.isArray(artifact.items) || artifact.items.some((item) => !item || typeof item.url !== "string" || !item.url.trim())))) errors.push(`Invalid frozen iteration output: ${kind}.`);
      }
      for (const [kind] of outputs) if (!node.frozenOutputs[kind as "text" | "images"]) errors.push(`Frozen iteration output ${kind} is missing.`);
    }
  }
  return Array.from(new Set(errors));
}

export function freezeCanvasIterationOutputs(node: CanvasNode, outputs: Record<string, CanvasArtifact>): CanvasNode {
  if (node.type !== "utility.image-iterate") throw new Error("Only image iteration regions can freeze iteration outputs.");
  const frozen = { ...structuredClone(node), frozenOutputs: structuredClone(outputs) };
  const errors = validateCanvasIteration(frozen, false);
  if (errors.length) throw new Error(errors.join(" "));
  return frozen;
}

export function stripCanvasConfigSecrets(config: CanvasNodeConfig): CanvasNodeConfig {
  const strip = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(strip);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => !/^(?:api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|authorization|password|secret|client[_-]?secret|private[_-]?key|cookie|credentials)$/i.test(key)).map(([key, entry]) => [key, strip(entry)]));
  };
  return strip(config) as CanvasNodeConfig;
}

export function stripPortableCanvasNode(node: CanvasNode): CanvasNode {
  const portable = structuredClone(node);
  delete portable.frozenOutputs;
  portable.config = stripCanvasConfigSecrets(portable.config);
  if (portable.iteration) portable.iteration.graph.nodes = portable.iteration.graph.nodes.map(stripPortableCanvasNode);
  return portable;
}
