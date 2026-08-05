import { validateCanvasGraph } from "./graph";
import { upgradeCanvasGraph } from "./registry";
import { decodeCanvasGraph } from "./serialization";
import type { CanvasGraph } from "./types";

export const CANVAS_WORKFLOW_FILE_MAX_BYTES = 10 * 1024 * 1024;
const workflowFileKind = "fluxpost.canvas.workflow";
const workflowFileVersion = 1;
const maxWorkflowNameLength = 80;

export type CanvasWorkflowFileV1 = {
  kind: typeof workflowFileKind;
  version: typeof workflowFileVersion;
  name: string;
  graph: CanvasGraph;
};

export function createCanvasWorkflowFile(name: string, graph: CanvasGraph): CanvasWorkflowFileV1 {
  const decoded = decodeCanvasGraph(structuredClone(graph));
  assertValidCanvasWorkflowGraph(decoded);
  return {
    kind: workflowFileKind,
    version: workflowFileVersion,
    name: normalizeWorkflowFileName(name),
    graph: decoded,
  };
}

export function parseCanvasWorkflowFile(value: string): CanvasWorkflowFileV1 {
  let candidate: unknown;
  try {
    candidate = JSON.parse(value);
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }
  if (!isRecord(candidate) || candidate.kind !== workflowFileKind) {
    throw new Error("The selected file is not a FluxPost Canvas workflow file.");
  }
  if (candidate.version !== workflowFileVersion) {
    throw new Error("FluxPost Canvas workflow files must use version 1.");
  }
  const graph = upgradeCanvasGraph(decodeCanvasGraph(candidate.graph));
  assertValidCanvasWorkflowGraph(graph);
  return {
    kind: workflowFileKind,
    version: workflowFileVersion,
    name: normalizeWorkflowFileName(candidate.name),
    graph,
  };
}

export function canvasWorkflowFileName(name: string) {
  const base = name.trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/g, "")
    .slice(0, maxWorkflowNameLength)
    || "canvas-workflow";
  return `${base}.fluxpost-workflow.json`;
}

function assertValidCanvasWorkflowGraph(graph: CanvasGraph) {
  const validation = validateCanvasGraph(graph);
  if (!validation.valid) throw new Error(validation.errors.join(" "));
}

function normalizeWorkflowFileName(value: unknown) {
  if (typeof value !== "string") throw new Error("Workflow name is required.");
  const name = value.trim();
  if (!name) throw new Error("Workflow name is required.");
  if (name.length > maxWorkflowNameLength) throw new Error(`Workflow name must be ${maxWorkflowNameLength} characters or fewer.`);
  return name;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
