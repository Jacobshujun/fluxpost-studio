import { randomUUID } from "node:crypto";
import { buildCanvasRunPlan } from "./graph";
import { getCanvasBatchBindableFields, getCanvasNodeDefinition, getCanvasNodeExecutionMode } from "./registry";
import { canvasSourceVideoSnapshotConfig, isCanvasSourceVideoSnapshot } from "./source-video-contract";
import type {
  CanvasArtifact,
  CanvasGraph,
  CanvasNode,
  CanvasScheduleAggregateArtifact,
  CanvasScheduleAssetSnapshot,
  CanvasScheduleExpansionMode,
  CanvasScheduleParameter,
  CanvasScheduleParameterScope,
  CanvasScheduleParameterValue,
  CanvasScheduleSampleCount,
  CanvasScheduleV2ChildTask,
  CanvasScheduleV2Definition,
  CanvasScheduleV2MainTask,
  CanvasScheduleV2SharedArtifact,
  CanvasScheduleV2SharedOutput,
} from "./types";

export type ResolvedCanvasScheduleParameter = CanvasScheduleParameter & {
  source: { mode: "fixed" | "manual-list"; values: CanvasScheduleParameterValue[] };
};

export type CanvasScheduleV2Expansion = {
  mainTasks: CanvasScheduleV2MainTask[];
  totalMainTasks: number;
  totalChildTasks: number;
};

const maxCanvasScheduleV2Children = 2_000;

export function validateCanvasScheduleV2Definition(graph: CanvasGraph, definition: CanvasScheduleV2Definition) {
  if (!definition || !Array.isArray(definition.parameters)) throw new Error("Batch parameter definition is required.");
  if (!definition.parameters.length) throw new Error("Add at least one batch parameter.");
  if (!definition.childResult?.nodeId || !definition.childResult.outputPort) throw new Error("Select a child result node and output.");
  if (!['text', 'images', 'videos'].includes(definition.childResult.artifactKind)) throw new Error("Child results must be text, images, or videos.");
  if (!['cartesian', 'zip'].includes(definition.expansion?.main) || !['cartesian', 'zip'].includes(definition.expansion?.child)) {
    throw new Error("Main and child expansion modes are required.");
  }
  if (!['at-least-one', 'all'].includes(definition.aggregationPolicy)) throw new Error("Aggregation policy is invalid.");

  const parameterIds = new Set<string>();
  const bindings = new Set<string>();
  for (const parameter of definition.parameters) {
    const name = parameter.name?.trim();
    if (!parameter.id?.trim() || parameterIds.has(parameter.id)) throw new Error("Batch parameter ids must be unique.");
    parameterIds.add(parameter.id);
    if (!name || name.length > 80) throw new Error("Batch parameter names must contain 1-80 characters.");
    if (!['main', 'child'].includes(parameter.scope)) throw new Error(`${name}: task scope is invalid.`);
    if (!['fixed', 'each', 'random'].includes(parameter.expansion)) throw new Error(`${name}: expansion mode is invalid.`);
    if (parameter.expansion === "random") validateCanvasScheduleSampleCount(canvasScheduleParameterSampleCount(parameter), name);
    const node = graph.nodes.find((item) => item.id === parameter.binding?.nodeId);
    if (!node) throw new Error(`${name}: bound Canvas node was not found.`);
    const field = getCanvasBatchBindableFields(node).find((item) => item.key === parameter.binding.fieldKey);
    if (!field) throw new Error(`${name}: bound node field is not batch-injectable.`);
    if (!field.parameterTypes.includes(parameter.valueType)) throw new Error(`${name}: parameter type is incompatible with ${field.label}.`);
    const bindingKey = `${node.id}:${field.key}`;
    if (bindings.has(bindingKey)) throw new Error(`${name}: another parameter already binds the same node field.`);
    bindings.add(bindingKey);
    validateCanvasScheduleParameterSource(parameter);
  }

  validateCanvasScheduleV2SharedOutputs(graph, definition);

  const childNode = graph.nodes.find((node) => node.id === definition.childResult.nodeId);
  const childOutput = childNode && getCanvasNodeDefinition(childNode.type, childNode.version)?.outputs.find((port) => port.id === definition.childResult.outputPort);
  if (!childNode || !childOutput) throw new Error("The selected child result output no longer exists.");
  if (childOutput.kind !== definition.childResult.artifactKind) throw new Error("Child result artifact type does not match the selected output.");
  if (definition.mainTargetNodeId) {
    if (!graph.nodes.some((node) => node.id === definition.mainTargetNodeId)) throw new Error("The selected main target node no longer exists.");
    if (!hasCanvasGraphPath(graph, childNode.id, definition.mainTargetNodeId)) throw new Error("The main target must be downstream of the child result node.");
    const ancestors = collectCanvasGraphAncestors(graph, definition.mainTargetNodeId);
    if (graph.nodes.some((node) => ancestors.has(node.id) && getCanvasNodeDefinition(node.type, node.version)?.capability === "external_write")) {
      throw new Error("Batch schedules cannot execute external-write nodes.");
    }
  }
}

export function validateCanvasScheduleV2ExpandedGraph(graph: CanvasGraph, definition: CanvasScheduleV2Definition) {
  const plan = buildCanvasRunPlan(graph, [definition.childResult.nodeId]);
  if (plan.blockers.length) throw new Error(plan.blockers[0].message || "A child task is blocked.");
}

export function validateCanvasScheduleV2SharedGraph(graph: CanvasGraph, definition: CanvasScheduleV2Definition) {
  const targets = (definition.sharedOutputs || []).map((output) => output.nodeId);
  if (!targets.length) return;
  const plan = buildCanvasRunPlan(graph, targets);
  if (plan.blockers.length) throw new Error(plan.blockers[0].message || "The shared stage is blocked.");
}

export function validateCanvasScheduleV2AggregateGraph(graph: CanvasGraph, definition: CanvasScheduleV2Definition) {
  if (!definition.mainTargetNodeId) return;
  const placeholder = definition.childResult.artifactKind === "text"
    ? { kind: "text" as const, value: "Batch preview" }
    : definition.childResult.artifactKind === "images"
      ? { kind: "images" as const, items: [{ url: "/canvas-batch-preview.png" }] }
      : { kind: "videos" as const, items: [{ url: "/canvas-batch-preview.mp4" }] };
  const plan = buildCanvasRunPlan(createCanvasScheduleV2AggregateGraph(graph, definition, [placeholder]), [definition.mainTargetNodeId]);
  if (plan.blockers.length) throw new Error(plan.blockers[0].message || "The main task target is blocked.");
}

export function expandCanvasScheduleV2(
  parameters: ResolvedCanvasScheduleParameter[],
  definition: Pick<CanvasScheduleV2Definition, "expansion">,
  now = new Date().toISOString(),
  createId: (level: "main" | "child") => string = defaultTaskId,
  random: () => number = Math.random,
): CanvasScheduleV2Expansion {
  const mainAssignments = expandCanvasParameterAssignments(parameters, "main", definition.expansion.main, random);
  let totalChildTasks = 0;
  const mainTasks = mainAssignments.map((mainValues): CanvasScheduleV2MainTask => {
    const childAssignments = expandCanvasParameterAssignments(parameters, "child", definition.expansion.child, random);
    totalChildTasks += childAssignments.length;
    if (totalChildTasks > maxCanvasScheduleV2Children) {
      throw new Error(`This schedule expands to ${totalChildTasks} child tasks, exceeding the limit of ${maxCanvasScheduleV2Children}.`);
    }
    return {
      id: createId("main"),
      parameterValues: structuredClone(mainValues),
      childTasks: childAssignments.map((childValues): CanvasScheduleV2ChildTask => ({
        id: createId("child"),
        parameterValues: structuredClone(childValues),
        status: "pending",
        resultArtifacts: [],
        createdAt: now,
        updatedAt: now,
      })),
      status: "pending",
      resultArtifacts: [],
      createdAt: now,
      updatedAt: now,
    };
  });
  return { mainTasks, totalMainTasks: mainTasks.length, totalChildTasks };
}

export function expandCanvasParameterAssignments(
  parameters: ResolvedCanvasScheduleParameter[],
  scope: CanvasScheduleParameterScope,
  mode: CanvasScheduleExpansionMode,
  random: () => number = Math.random,
) {
  const scoped = parameters.filter((parameter) => parameter.scope === scope);
  const fixed = scoped.filter((parameter) => parameter.expansion === "fixed");
  const iterated = scoped.filter((parameter) => parameter.expansion === "each" || parameter.expansion === "random");
  const base: Record<string, CanvasScheduleParameterValue> = {};
  for (const parameter of fixed) {
    if (parameter.source.values.length !== 1) throw new Error(`${parameter.name}: fixed parameters require exactly one value.`);
    base[parameter.id] = structuredClone(parameter.source.values[0]);
  }
  if (!iterated.length) return [base];
  for (const parameter of iterated) {
    if (!parameter.source.values.length) throw new Error(`${parameter.name}: expanded parameters require at least one value.`);
    if (parameter.expansion === "random") assertCanvasScheduleSampleCapacity(parameter);
  }
  let expandedParameters: Array<{ parameter: ResolvedCanvasScheduleParameter; values: CanvasScheduleParameterValue[] }>;
  if (mode === "zip") {
    const ranges = iterated.map(canvasScheduleParameterAllowedCountRange);
    const minimum = Math.max(...ranges.map((range) => range.min));
    const maximum = Math.min(...ranges.map((range) => range.max));
    if (minimum > maximum) throw new Error(`${scope} zip parameters must have equal value counts or overlapping random ranges.`);
    const count = randomIntegerInRange(minimum, maximum, random);
    expandedParameters = iterated.map((parameter) => ({
      parameter,
      values: parameter.expansion === "random"
        ? sampleUniqueCanvasScheduleParameterValues(parameter.source.values, count, parameter.name, random)
        : structuredClone(parameter.source.values),
    }));
    return Array.from({ length: count }, (_, index) => Object.fromEntries([
      ...Object.entries(base),
      ...expandedParameters.map(({ parameter, values }) => [parameter.id, structuredClone(values[index])]),
    ]));
  }
  expandedParameters = iterated.map((parameter) => ({
    parameter,
    values: parameter.expansion === "random"
      ? sampleUniqueCanvasScheduleParameterValues(
        parameter.source.values,
        selectCanvasScheduleSampleCount(canvasScheduleParameterSampleCount(parameter), parameter.name, random),
        parameter.name,
        random,
      )
      : structuredClone(parameter.source.values),
  }));
  return expandedParameters.reduce<Record<string, CanvasScheduleParameterValue>[]>((assignments, { parameter, values }) => assignments.flatMap((assignment) =>
    values.map((value) => ({ ...assignment, [parameter.id]: structuredClone(value) }))), [base]);
}

export function canvasScheduleParameterSampleCount(parameter: CanvasScheduleParameter): CanvasScheduleSampleCount | undefined {
  if (parameter.sampleCount) return parameter.sampleCount;
  return parameter.randomCount === undefined ? undefined : { mode: "exact", value: parameter.randomCount };
}

export function selectCanvasScheduleSampleCount(
  sampleCount: CanvasScheduleSampleCount | undefined,
  parameterName: string,
  random: () => number = Math.random,
) {
  validateCanvasScheduleSampleCount(sampleCount, parameterName);
  if (sampleCount!.mode === "exact") return sampleCount!.value;
  return randomIntegerInRange(sampleCount!.min, sampleCount!.max, random);
}

export function sampleUniqueCanvasScheduleParameterValues(
  values: CanvasScheduleParameterValue[],
  count: number,
  parameterName: string,
  random: () => number = Math.random,
) {
  if (!Number.isInteger(count) || count < 1) throw new Error(`${parameterName}: random count must be a positive integer.`);
  const uniqueValues = uniqueCanvasScheduleParameterValues(values);
  if (count > uniqueValues.length) {
    throw new Error(`${parameterName}: only ${uniqueValues.length} unique candidate values are available; cannot randomly select ${count} without duplicates.`);
  }
  const pool = uniqueValues.map((value) => structuredClone(value));
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(normalizeCanvasRandom(random()) * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool.slice(0, count);
}

function validateCanvasScheduleSampleCount(sampleCount: CanvasScheduleSampleCount | undefined, parameterName: string) {
  if (!sampleCount || (sampleCount.mode !== "exact" && sampleCount.mode !== "range")) {
    throw new Error(`${parameterName}: random count must be a positive integer.`);
  }
  if (sampleCount.mode === "exact") {
    if (!Number.isInteger(sampleCount.value) || sampleCount.value < 1) throw new Error(`${parameterName}: random count must be a positive integer.`);
    return;
  }
  if (!Number.isInteger(sampleCount.min) || sampleCount.min < 1 || !Number.isInteger(sampleCount.max) || sampleCount.max < 1) {
    throw new Error(`${parameterName}: random range minimum and maximum must be positive integers.`);
  }
  if (sampleCount.min > sampleCount.max) throw new Error(`${parameterName}: random range minimum cannot exceed maximum.`);
}

function canvasScheduleParameterAllowedCountRange(parameter: ResolvedCanvasScheduleParameter) {
  if (parameter.expansion !== "random") return { min: parameter.source.values.length, max: parameter.source.values.length };
  const sampleCount = canvasScheduleParameterSampleCount(parameter);
  validateCanvasScheduleSampleCount(sampleCount, parameter.name);
  return sampleCount!.mode === "exact"
    ? { min: sampleCount!.value, max: sampleCount!.value }
    : { min: sampleCount!.min, max: sampleCount!.max };
}

function assertCanvasScheduleSampleCapacity(parameter: ResolvedCanvasScheduleParameter) {
  const range = canvasScheduleParameterAllowedCountRange(parameter);
  const uniqueCount = uniqueCanvasScheduleParameterValues(parameter.source.values).length;
  if (range.max > uniqueCount) {
    throw new Error(`${parameter.name}: only ${uniqueCount} unique candidate values are available; cannot randomly select ${range.max} without duplicates.`);
  }
}

function uniqueCanvasScheduleParameterValues(values: CanvasScheduleParameterValue[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = stableCanvasParameterValue(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function randomIntegerInRange(minimum: number, maximum: number, random: () => number) {
  if (minimum === maximum) return minimum;
  return minimum + Math.floor(normalizeCanvasRandom(random()) * (maximum - minimum + 1));
}

function normalizeCanvasRandom(value: number) {
  return !Number.isFinite(value) || value <= 0 ? 0 : Math.min(value, 0.9999999999999999);
}

export function applyCanvasScheduleV2Parameters(
  source: CanvasGraph,
  parameters: CanvasScheduleParameter[],
  values: Record<string, CanvasScheduleParameterValue>,
) {
  const graph = structuredClone(source);
  const byNode = new Map<string, Array<{ parameter: CanvasScheduleParameter; value: CanvasScheduleParameterValue }>>();
  for (const parameter of parameters) {
    if (!(parameter.id in values)) continue;
    byNode.set(parameter.binding.nodeId, [...(byNode.get(parameter.binding.nodeId) || []), { parameter, value: values[parameter.id] }]);
  }
  graph.nodes = graph.nodes.map((node) => {
    const injections = byNode.get(node.id);
    if (!injections) return node;
    return injections.reduce((current, injection) => applyCanvasParameterValue(current, injection.parameter, injection.value), node);
  });
  return graph;
}

export function createCanvasScheduleV2AggregateGraph(
  source: CanvasGraph,
  definition: CanvasScheduleV2Definition,
  artifacts: CanvasScheduleAggregateArtifact[],
) {
  if (!artifacts.length) throw new Error("At least one child result is required for aggregation.");
  const graph = structuredClone(source);
  graph.nodes = graph.nodes.map((node) => node.id !== definition.childResult.nodeId ? node : aggregateLiteralNode(node, definition.childResult.artifactKind, artifacts));
  graph.edges = graph.edges.filter((edge) => edge.target !== definition.childResult.nodeId);
  return graph;
}

export function createCanvasScheduleV2ChildGraph(
  source: CanvasGraph,
  sharedArtifacts: CanvasScheduleV2SharedArtifact[],
) {
  if (!sharedArtifacts.length) return structuredClone(source);
  const graph = structuredClone(source);
  const byNode = new Map(sharedArtifacts.map((entry) => [entry.nodeId, entry]));
  graph.nodes = graph.nodes.map((node) => {
    const shared = byNode.get(node.id);
    return shared ? sharedLiteralNode(node, shared.artifact) : node;
  });
  graph.edges = graph.edges
    .filter((edge) => !byNode.has(edge.target))
    .map((edge) => {
      const shared = byNode.get(edge.source);
      return shared ? { ...edge, sourcePort: shared.artifactKind } : edge;
    });
  return graph;
}

export function extractCanvasScheduleV2SharedArtifacts(
  outputsByNode: Record<string, Record<string, CanvasArtifact> | undefined>,
  sharedOutputs: CanvasScheduleV2SharedOutput[],
) {
  return sharedOutputs.map((output): CanvasScheduleV2SharedArtifact => {
    const artifact = outputsByNode[output.nodeId]?.[output.outputPort];
    if (!artifact || artifact.kind !== output.artifactKind) {
      throw new Error(`Shared output ${output.nodeId}:${output.outputPort} did not produce ${output.artifactKind}.`);
    }
    return { ...output, artifact: structuredClone(artifact) as CanvasScheduleAggregateArtifact };
  });
}

export function extractCanvasScheduleV2Artifacts(
  artifacts: Record<string, CanvasArtifact> | undefined,
  outputPort: string,
  expectedKind: CanvasScheduleV2Definition["childResult"]["artifactKind"],
) {
  const artifact = artifacts?.[outputPort];
  return artifact && artifact.kind === expectedKind ? [structuredClone(artifact) as CanvasScheduleAggregateArtifact] : [];
}

function validateCanvasScheduleParameterSource(parameter: CanvasScheduleParameter) {
  const source = parameter.source;
  if (!source || !['fixed', 'manual-list', 'library-filter', 'copy-filter', 'source-video-links'].includes(source.mode)) throw new Error(`${parameter.name}: parameter source is invalid.`);
  if (source.mode === "fixed" || source.mode === "manual-list") {
    if (!Array.isArray(source.values)) throw new Error(`${parameter.name}: parameter values must be a list.`);
    if (source.mode === "fixed" && source.values.length !== 1) throw new Error(`${parameter.name}: fixed source requires exactly one value.`);
    if (!source.values.length) throw new Error(`${parameter.name}: parameter values cannot be empty.`);
    if (!source.values.every((value) => isCanvasScheduleParameterValue(parameter.valueType, value))) throw new Error(`${parameter.name}: one or more values do not match the parameter type.`);
  }
  if (parameter.expansion === "random" && source.mode === "fixed") throw new Error(`${parameter.name}: random expansion requires multiple candidate values.`);
  if (source.mode === "copy-filter" && parameter.valueType !== "copy") throw new Error(`${parameter.name}: copy filters require a copy parameter.`);
  if (source.mode === "library-filter" && !['image', 'image-group'].includes(parameter.valueType)) throw new Error(`${parameter.name}: library filters require an image parameter.`);
  if (source.mode === "source-video-links") {
    if (parameter.valueType !== "source-video") throw new Error(`${parameter.name}: source video links require a source-video parameter.`);
    if (!Array.isArray(source.links) || !source.links.length || source.links.length > 200) throw new Error(`${parameter.name}: source video links must contain 1-200 entries.`);
    if (!source.projectName?.trim()) throw new Error(`${parameter.name}: source video project name is required.`);
    if (parameter.expansion === "fixed" && source.links.length !== 1) throw new Error(`${parameter.name}: fixed source video parameters require exactly one link.`);
  }
  if (parameter.valueType === "source-video" && source.mode !== "source-video-links" && source.mode !== "fixed" && source.mode !== "manual-list") {
    throw new Error(`${parameter.name}: source-video parameters require frozen values or source video links.`);
  }
}

function validateCanvasScheduleV2SharedOutputs(graph: CanvasGraph, definition: CanvasScheduleV2Definition) {
  const sharedOutputs = definition.sharedOutputs || [];
  if (!Array.isArray(sharedOutputs)) throw new Error("Shared outputs must be a list.");
  const selected = new Set<string>();
  const childBindings = new Set(definition.parameters
    .filter((parameter) => parameter.scope === "child")
    .map((parameter) => parameter.binding.nodeId));
  for (const output of sharedOutputs) {
    const nodeId = String(output?.nodeId || "").trim();
    const outputPort = String(output?.outputPort || "").trim();
    if (!nodeId || !outputPort || !["text", "images", "videos"].includes(output?.artifactKind)) {
      throw new Error("Each shared output must select a node, output port, and supported artifact type.");
    }
    const key = `${nodeId}:${outputPort}`;
    if (selected.has(key)) throw new Error("Shared outputs cannot contain duplicate node ports.");
    selected.add(key);
    const node = graph.nodes.find((candidate) => candidate.id === nodeId);
    const registry = node && getCanvasNodeDefinition(node.type, node.version);
    if (!node || !registry) throw new Error(`Shared output node ${nodeId} was not found.`);
    if (registry.category === "input") throw new Error("Input nodes cannot be shared outputs.");
    if (registry.passiveSink) throw new Error("Passive display nodes cannot be shared outputs.");
    if (registry.capability === "external_write") throw new Error("External-write nodes cannot be shared outputs.");
    if (getCanvasNodeExecutionMode(node) === "disabled") throw new Error("Disabled nodes cannot be shared outputs.");
    if (registry.outputs.length !== 1) throw new Error("Shared output nodes must have exactly one output.");
    const registryOutput = registry.outputs[0];
    if (!["text", "images", "videos"].includes(registryOutput.kind)) throw new Error("Shared outputs must produce text, images, or videos.");
    if (registryOutput.id !== outputPort || registryOutput.kind !== output.artifactKind) {
      throw new Error(`Shared output ${nodeId}:${outputPort} no longer matches the node registry.`);
    }
    if (nodeId === definition.childResult.nodeId || !hasCanvasGraphPath(graph, nodeId, definition.childResult.nodeId)) {
      throw new Error("Shared output nodes must be strictly upstream of the child result node.");
    }
    const ancestors = collectCanvasGraphAncestors(graph, nodeId);
    const childDependency = Array.from(childBindings).find((bindingNodeId) => ancestors.has(bindingNodeId));
    if (childDependency) throw new Error("Shared output dependencies cannot include child-scoped parameter bindings.");
  }
}

function stableCanvasParameterValue(value: CanvasScheduleParameterValue) {
  if (Array.isArray(value) && value.length && value.every((item) => item && typeof item === "object" && "id" in item)) {
    return `record-group:${JSON.stringify(value.map((item) => String(item.id)))}`;
  }
  if (!Array.isArray(value) && value && typeof value === "object" && "id" in value) return `record:${String(value.id)}`;
  return JSON.stringify(canonicalizeCanvasParameterValue(value));
}

function canonicalizeCanvasParameterValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeCanvasParameterValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, canonicalizeCanvasParameterValue(item)]));
}

function isCanvasScheduleParameterValue(type: CanvasScheduleParameter["valueType"], value: CanvasScheduleParameterValue) {
  if (type === "image") return isAssetSnapshot(value);
  if (type === "image-group") return Array.isArray(value) && value.length > 0 && value.every(isAssetSnapshot);
  if (type === "copy") return isCopySnapshot(value);
  if (type === "source-video") return isCanvasSourceVideoSnapshot(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  return typeof value === "string";
}

function applyCanvasParameterValue(node: CanvasNode, parameter: CanvasScheduleParameter, value: CanvasScheduleParameterValue): CanvasNode {
  const field = getCanvasBatchBindableFields(node).find((item) => item.key === parameter.binding.fieldKey);
  if (!field || !field.parameterTypes.includes(parameter.valueType)) throw new Error(`${parameter.name}: Canvas binding is no longer compatible.`);
  if (field.adapter === "image-input") {
    const assets = Array.isArray(value) ? value : [value];
    if (!assets.every(isAssetSnapshot)) throw new Error(`${parameter.name}: expected image snapshot values.`);
    return {
      ...node,
      config: {
        ...node.config,
        ...(node.type === "input.library-images" ? { assetIds: assets.map((asset) => asset.id), assetNames: assets.map((asset) => asset.name || asset.id) } : {}),
        urls: assets.map((asset) => asset.url),
        snapshotAt: new Date().toISOString(),
      },
    };
  }
  if (field.adapter === "copy-input") {
    if (!isCopySnapshot(value)) throw new Error(`${parameter.name}: expected a copy snapshot value.`);
    return {
      ...node,
      config: {
        ...node.config,
        entryId: value.id,
        entryTitle: value.title,
        snapshotTitle: value.title,
        snapshotBody: value.body,
        snapshotTags: value.tags,
        snapshotAt: value.updatedAt,
      },
    };
  }
  if (field.adapter === "source-video-input") {
    if (!isCanvasSourceVideoSnapshot(value)) throw new Error(`${parameter.name}: expected a frozen source video snapshot.`);
    return {
      ...node,
      config: { ...node.config, ...canvasSourceVideoSnapshotConfig(value) },
      executionMode: "enabled",
    };
  }
  if (typeof value === "object") throw new Error(`${parameter.name}: scalar binding received a structured value.`);
  return { ...node, config: { ...node.config, [field.key]: value } };
}

function aggregateLiteralNode(
  node: CanvasNode,
  kind: CanvasScheduleV2Definition["childResult"]["artifactKind"],
  artifacts: CanvasScheduleAggregateArtifact[],
): CanvasNode {
  if (kind === "text") {
    return { ...node, type: "input.text", version: 1, config: { text: artifacts.flatMap((artifact) => artifact.kind === "text" ? [artifact.value] : []).join("\n\n") }, executionMode: "enabled", schedulerRole: undefined };
  }
  if (kind === "images") {
    return { ...node, type: "input.images", version: 1, config: { urls: uniqueStrings(artifacts.flatMap((artifact) => artifact.kind === "images" ? artifact.items.map((item) => item.url) : [])) }, executionMode: "enabled", schedulerRole: undefined };
  }
  return { ...node, type: "input.videos", version: 1, config: { urls: uniqueStrings(artifacts.flatMap((artifact) => artifact.kind === "videos" ? artifact.items.map((item) => item.url) : [])) }, executionMode: "enabled", schedulerRole: undefined };
}

function sharedLiteralNode(node: CanvasNode, artifact: CanvasScheduleAggregateArtifact): CanvasNode {
  if (artifact.kind === "text") {
    return { ...node, type: "input.text", version: 1, config: { text: artifact.value }, executionMode: "enabled", schedulerRole: undefined };
  }
  if (artifact.kind === "images") {
    return { ...node, type: "input.images", version: 1, config: { urls: artifact.items.map((item) => item.url) }, executionMode: "enabled", schedulerRole: undefined };
  }
  return { ...node, type: "input.videos", version: 1, config: { urls: artifact.items.map((item) => item.url) }, executionMode: "enabled", schedulerRole: undefined };
}

function hasCanvasGraphPath(graph: CanvasGraph, sourceId: string, targetId: string) {
  const outgoing = new Map<string, string[]>();
  for (const edge of graph.edges) outgoing.set(edge.source, [...(outgoing.get(edge.source) || []), edge.target]);
  const pending = [sourceId];
  const visited = new Set<string>();
  while (pending.length) {
    const current = pending.pop()!;
    if (current === targetId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(outgoing.get(current) || []));
  }
  return false;
}

function collectCanvasGraphAncestors(graph: CanvasGraph, targetId: string) {
  const incoming = new Map<string, string[]>();
  for (const edge of graph.edges) incoming.set(edge.target, [...(incoming.get(edge.target) || []), edge.source]);
  const pending = [targetId];
  const result = new Set<string>();
  while (pending.length) {
    const current = pending.pop()!;
    if (result.has(current)) continue;
    result.add(current);
    pending.push(...(incoming.get(current) || []));
  }
  return result;
}

function isAssetSnapshot(value: CanvasScheduleParameterValue): value is CanvasScheduleAssetSnapshot {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && "id" in value && "url" in value && !("projectName" in value));
}

function isCopySnapshot(value: CanvasScheduleParameterValue): value is Extract<CanvasScheduleParameterValue, { body: string }> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && "id" in value && "body" in value && "title" in value);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function defaultTaskId(level: "main" | "child") {
  return `canvas-v2-${level}-${randomUUID()}`;
}
