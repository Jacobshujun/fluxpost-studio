import { randomUUID } from "node:crypto";
import {
  createCanvasWorkflowInDb,
  deleteCanvasWorkflowFromDb,
  getCanvasWorkflowFromDb,
  listCanvasWorkflowsFromDb,
  updateCanvasWorkflowInDb,
} from "../database";
import {
  assertCanAccessWorkspaceRecord,
  canAccessWorkspaceOwner,
  filterWorkspaceOwnedRecords,
  scopeWorkspaceOwner,
  type WorkspaceAccessActor,
} from "../workspace-ownership";
import { validateCanvasGraph } from "./graph";
import { upgradeCanvasNode } from "./registry";
import type { CanvasGraph, CanvasWorkflow } from "./types";

export class CanvasRevisionConflictError extends Error {
  constructor() {
    super("This workflow changed in another tab. Refresh it before saving again.");
    this.name = "CanvasRevisionConflictError";
  }
}

export async function listCanvasWorkflows(account: WorkspaceAccessActor) {
  return filterWorkspaceOwnedRecords(await listCanvasWorkflowsFromDb(), account);
}

export async function getCanvasWorkflow(workflowId: string, account: WorkspaceAccessActor) {
  const workflow = await getCanvasWorkflowFromDb(workflowId);
  return workflow && canAccessWorkspaceOwner(account, workflow.ownerUserId) ? workflow : undefined;
}

export async function createCanvasWorkflow(
  account: WorkspaceAccessActor,
  input: { name?: string; graph?: CanvasGraph; isTemplate?: boolean; sourceWorkflowId?: string } = {},
) {
  const graph = input.graph ? upgradeEditableGraph(input.graph) : emptyCanvasGraph();
  assertValidGraph(graph);
  const now = new Date().toISOString();
  const workflow: CanvasWorkflow = {
    id: `canvas-${Date.now()}-${randomUUID().slice(0, 8)}`,
    ...scopeWorkspaceOwner(account),
    name: normalizeWorkflowName(input.name),
    revision: 1,
    graph: structuredClone(graph),
    isTemplate: input.isTemplate === true,
    sourceWorkflowId: input.sourceWorkflowId,
    createdAt: now,
    updatedAt: now,
  };
  return createCanvasWorkflowInDb(workflow);
}

export async function updateCanvasWorkflow(
  workflowId: string,
  account: WorkspaceAccessActor,
  input: { name?: string; graph?: CanvasGraph; revision: number; isTemplate?: boolean },
) {
  const current = await getCanvasWorkflowFromDb(workflowId);
  if (!current) throw new Error("Canvas workflow not found");
  assertCanAccessWorkspaceRecord(account, current, "Canvas workflow not found");
  if (!Number.isInteger(input.revision) || input.revision !== current.revision) throw new CanvasRevisionConflictError();
  const graph = input.graph ? upgradeEditableGraph(input.graph) : current.graph;
  assertValidGraph(graph);
  const workflow: CanvasWorkflow = {
    ...current,
    name: input.name === undefined ? current.name : normalizeWorkflowName(input.name),
    graph: structuredClone(graph),
    isTemplate: input.isTemplate === undefined ? current.isTemplate : input.isTemplate === true,
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
  };
  if (!(await updateCanvasWorkflowInDb(workflow, current.revision))) throw new CanvasRevisionConflictError();
  return workflow;
}

function upgradeEditableGraph(graph: CanvasGraph): CanvasGraph {
  return { ...structuredClone(graph), nodes: graph.nodes.map(upgradeCanvasNode) };
}

export async function duplicateCanvasWorkflow(
  workflowId: string,
  account: WorkspaceAccessActor,
  options: { asTemplate?: boolean; name?: string } = {},
) {
  const source = await getCanvasWorkflow(workflowId, account);
  if (!source) throw new Error("Canvas workflow not found");
  assertCanAccessWorkspaceRecord(account, source, "Canvas workflow not found");
  return createCanvasWorkflow(account, {
    name: options.name || `${source.name}${options.asTemplate ? " 模板" : " 副本"}`,
    graph: source.graph,
    isTemplate: options.asTemplate === true,
    sourceWorkflowId: source.id,
  });
}

export async function deleteCanvasWorkflow(workflowId: string, account: WorkspaceAccessActor) {
  const current = await getCanvasWorkflowFromDb(workflowId);
  if (!current) throw new Error("Canvas workflow not found");
  assertCanAccessWorkspaceRecord(account, current, "Canvas workflow not found");
  if (!(await deleteCanvasWorkflowFromDb(workflowId, current.ownerUserId))) throw new Error("Canvas workflow not found");
}

export function emptyCanvasGraph(): CanvasGraph {
  return { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
}

function assertValidGraph(graph: CanvasGraph) {
  const validation = validateCanvasGraph(graph);
  if (!validation.valid) throw new Error(validation.errors.join(" "));
}

function normalizeWorkflowName(value?: string) {
  const name = (value || "未命名画布").trim();
  if (!name) throw new Error("Workflow name is required.");
  if (name.length > 80) throw new Error("Workflow name must be 80 characters or fewer.");
  return name;
}
