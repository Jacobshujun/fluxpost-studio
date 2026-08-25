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
import { validateCanvasGraphForPersistence } from "./graph";
import { upgradeCanvasGraph } from "./registry";
import { decodeCanvasGraph } from "./serialization";
import type { CanvasGraph, CanvasWorkflow } from "./types";
import { createCanvasWorkflowTemplateGraph, type CanvasWorkflowTemplateKey } from "./templates";

export class CanvasRevisionConflictError extends Error {
  constructor() {
    super("This workflow changed in another tab. Refresh it before saving again.");
    this.name = "CanvasRevisionConflictError";
  }
}

export async function listCanvasWorkflows(account: WorkspaceAccessActor) {
  return filterWorkspaceOwnedRecords(await listCanvasWorkflowsFromDb(), account)
    .map((workflow) => ({ ...workflow, graph: upgradeCanvasGraph(workflow.graph) }));
}

export async function getCanvasWorkflow(workflowId: string, account: WorkspaceAccessActor) {
  const workflow = await getCanvasWorkflowFromDb(workflowId);
  return workflow && canAccessWorkspaceOwner(account, workflow.ownerUserId)
    ? { ...workflow, graph: upgradeCanvasGraph(workflow.graph) }
    : undefined;
}

export async function createCanvasWorkflow(
  account: WorkspaceAccessActor,
  input: { name?: string; graph?: CanvasGraph; isTemplate?: boolean; sourceWorkflowId?: string; templateKey?: CanvasWorkflowTemplateKey } = {},
) {
  const template = input.templateKey ? createCanvasWorkflowTemplateGraph(input.templateKey) : undefined;
  const graph = input.graph ? upgradeCanvasGraph(decodeCanvasGraph(input.graph)) : template?.graph || emptyCanvasGraph();
  assertValidGraph(graph);
  assertCompetitorWorkbookGraphAccess(graph, account);
  const now = new Date().toISOString();
  const workflow: CanvasWorkflow = {
    id: `canvas-${Date.now()}-${randomUUID().slice(0, 8)}`,
    ...scopeWorkspaceOwner(account),
    name: normalizeWorkflowName(input.name || template?.name),
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
  const graph = input.graph ? upgradeCanvasGraph(decodeCanvasGraph(input.graph)) : upgradeCanvasGraph(current.graph);
  assertValidGraph(graph);
  assertCompetitorWorkbookGraphAccess(graph, account);
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
  const validation = validateCanvasGraphForPersistence(graph);
  if (!validation.valid) throw new Error(validation.errors.join(" "));
}

function assertCompetitorWorkbookGraphAccess(graph: CanvasGraph, account: WorkspaceAccessActor) {
  if (account.role === "admin") return;
  const containsLocalWorkbookState = graph.nodes.some((node) => node.type === "input.competitor-workbook"
    && (String(node.config.path || "").trim() || node.config.snapshot));
  if (containsLocalWorkbookState) throw new Error("Only workspace administrators can configure local workbooks.");
}

function normalizeWorkflowName(value?: string) {
  const name = (value || "未命名画布").trim();
  if (!name) throw new Error("Workflow name is required.");
  if (name.length > 80) throw new Error("Workflow name must be 80 characters or fewer.");
  return name;
}
