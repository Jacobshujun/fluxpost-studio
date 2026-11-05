import { deleteCanvasScheduleFavoriteFromDb, putCanvasScheduleFavoriteInDb, queryCanvasScheduleSummariesFromDb } from "../database";
import type { WorkspaceAccessActor } from "../workspace-ownership";

export class CanvasScheduleFavoriteError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export function parseCanvasScheduleListQuery(params: URLSearchParams) {
  function integer(key: string, fallback: number, max: number) {
    const raw = params.get(key);
    if (raw === null) return fallback;
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > max || (key === "limit" && Number(raw) < 1)) {
      throw new CanvasScheduleFavoriteError(`${key} 参数无效。`, 400);
    }
    return Number(raw);
  }
  const favorite = params.get("favorite");
  if (favorite !== null && favorite !== "true" && favorite !== "false") throw new CanvasScheduleFavoriteError("收藏筛选参数无效。", 400);
  return {
    q: params.get("q")?.trim(), workflowId: params.get("workflowId")?.trim(),
    favorite: favorite === "true", limit: integer("limit", 50, 100), offset: integer("offset", 0, Number.MAX_SAFE_INTEGER),
  };
}

export async function getCanvasScheduleFavoriteSummary(actor: WorkspaceAccessActor, scheduleId: string) {
  const { schedules } = await queryCanvasScheduleSummariesFromDb(actor, { scheduleId, limit: 1, offset: 0 });
  if (!schedules[0]) throw new CanvasScheduleFavoriteError("任务不存在或无权访问。", 404);
  return schedules[0];
}

export async function saveCanvasScheduleFavorite(actor: WorkspaceAccessActor, scheduleId: string, input: { alias?: unknown; note?: unknown }) {
  const summary = await getCanvasScheduleFavoriteSummary(actor, scheduleId);
  if (input.alias !== undefined && (typeof input.alias !== "string" || !input.alias.trim() || input.alias.trim().length > 100)) {
    throw new CanvasScheduleFavoriteError("收藏名称需为 1–100 个字符。", 400);
  }
  if (input.note !== undefined && (typeof input.note !== "string" || input.note.length > 1000)) {
    throw new CanvasScheduleFavoriteError("备注最多 1000 个字符。", 400);
  }
  return putCanvasScheduleFavoriteInDb(actor.id, scheduleId,
    typeof input.alias === "string" ? input.alias.trim() : summary.favorite?.alias ?? summary.name,
    typeof input.note === "string" ? input.note.trim() : summary.favorite?.note ?? "");
}

export async function removeCanvasScheduleFavorite(actor: WorkspaceAccessActor, scheduleId: string) {
  await getCanvasScheduleFavoriteSummary(actor, scheduleId);
  await deleteCanvasScheduleFavoriteFromDb(actor.id, scheduleId);
}
