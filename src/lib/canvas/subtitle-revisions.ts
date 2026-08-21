import { randomUUID } from "node:crypto";
import {
  createCanvasSubtitleRevisionInDb,
  getCanvasNodeRunFromDb,
  getCanvasRunFromDb,
  getCanvasSubtitleRevisionByKeyFromDb,
  getCanvasSubtitleRevisionFromDb,
  getCanvasWorkflowFromDb,
  updateCanvasSubtitleRevisionInDb,
} from "../database";
import { canAccessWorkspaceOwner, type WorkspaceAccessActor } from "../workspace-ownership";
import { cloneCanvasSubtitleSegments, decodeCanvasSubtitleRunMetadata, validateCanvasSubtitleSegments } from "./subtitle-editor";
import type { CanvasSubtitleRevision } from "./types";

export class CanvasSubtitleRevisionNotFoundError extends Error {}
export class CanvasSubtitleRevisionConflictError extends Error {
  constructor(public readonly current?: CanvasSubtitleRevision) {
    super("Subtitle revision changed in another tab.");
  }
}
export class CanvasSubtitleRevisionRerunRequiredError extends Error {
  readonly code = "subtitle_rerun_required";
}

export async function openCanvasSubtitleRevision(account: WorkspaceAccessActor, input: { workflowId?: string; nodeId?: string; nodeRunId?: string }) {
  const workflowId = requiredIdentifier(input.workflowId, "workflowId");
  const nodeId = requiredIdentifier(input.nodeId, "nodeId");
  const nodeRunId = requiredIdentifier(input.nodeRunId, "nodeRunId");
  const [workflow, nodeRun] = await Promise.all([getCanvasWorkflowFromDb(workflowId), getCanvasNodeRunFromDb(nodeRunId)]);
  if (!workflow || !nodeRun || !canAccessWorkspaceOwner(account, workflow.ownerUserId)) throw new CanvasSubtitleRevisionNotFoundError("Subtitle revision source not found.");
  const run = await getCanvasRunFromDb(nodeRun.runId);
  const node = workflow.graph.nodes.find((item) => item.id === nodeId);
  if (!run || run.workflowId !== workflow.id || run.ownerUserId !== workflow.ownerUserId || nodeRun.nodeId !== nodeId || nodeRun.nodeType !== "utility.video-subtitles" || node?.type !== "utility.video-subtitles") {
    throw new CanvasSubtitleRevisionNotFoundError("Subtitle revision source not found.");
  }
  if (!(["completed", "reused"] as const).includes(nodeRun.status as "completed" | "reused")) {
    throw new CanvasSubtitleRevisionRerunRequiredError("Run the subtitle node successfully before opening the editor.");
  }
  const metadata = decodeCanvasSubtitleRunMetadata(nodeRun.internalMetadata?.subtitle);
  if (!metadata) throw new CanvasSubtitleRevisionRerunRequiredError("This subtitle result predates editable timelines. Run the subtitle node once more.");

  const existing = await getCanvasSubtitleRevisionByKeyFromDb(workflow.ownerUserId, workflow.id, nodeId, metadata.videoSha256);
  if (existing) return existing;
  const now = new Date().toISOString();
  const revision: CanvasSubtitleRevision = {
    id: `canvas-subtitle-revision-${randomUUID()}`,
    ownerUserId: workflow.ownerUserId,
    ownerDisplayName: workflow.ownerDisplayName,
    workflowId: workflow.id,
    nodeId,
    videoSha256: metadata.videoSha256,
    durationMs: metadata.durationMs,
    timelineProtocolVersion: metadata.timelineProtocolVersion,
    revision: 1,
    source: { ...metadata.source },
    originalSegments: cloneCanvasSubtitleSegments(metadata.segments),
    segments: cloneCanvasSubtitleSegments(metadata.segments),
    createdAt: now,
    updatedAt: now,
  };
  if (await createCanvasSubtitleRevisionInDb(revision)) return revision;
  const raced = await getCanvasSubtitleRevisionByKeyFromDb(workflow.ownerUserId, workflow.id, nodeId, metadata.videoSha256);
  if (!raced) throw new Error("Subtitle revision could not be created.");
  return raced;
}

export async function getCanvasSubtitleRevision(revisionId: string, account: WorkspaceAccessActor) {
  const revision = await getCanvasSubtitleRevisionFromDb(requiredIdentifier(revisionId, "revisionId"));
  return revision && canAccessWorkspaceOwner(account, revision.ownerUserId) ? revision : undefined;
}

export async function saveCanvasSubtitleRevision(account: WorkspaceAccessActor, revisionId: string, input: { revision?: number; segments?: unknown }) {
  const current = await getCanvasSubtitleRevision(revisionId, account);
  if (!current) throw new CanvasSubtitleRevisionNotFoundError("Subtitle revision not found.");
  const expectedRevision = Number(input.revision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw new Error("A valid subtitle revision is required.");
  if (expectedRevision !== current.revision) throw new CanvasSubtitleRevisionConflictError(current);
  const next: CanvasSubtitleRevision = {
    ...current,
    revision: current.revision + 1,
    segments: validateCanvasSubtitleSegments(input.segments, current.durationMs),
    updatedAt: new Date().toISOString(),
  };
  if (!await updateCanvasSubtitleRevisionInDb(next, expectedRevision)) {
    throw new CanvasSubtitleRevisionConflictError(await getCanvasSubtitleRevision(revisionId, account));
  }
  return next;
}

function requiredIdentifier(value: unknown, label: string) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > 200) throw new Error(`${label} is required.`);
  return result;
}
