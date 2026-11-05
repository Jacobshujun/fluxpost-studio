import type { WorkspaceAccessActor } from "../workspace-ownership";
import type { CanvasScheduleListQuery } from "./types";

/** Projects scalars only: execution trees and workflow snapshots never leave SQL. */
export function canvasScheduleListSql(actor: WorkspaceAccessActor, query: CanvasScheduleListQuery, postgres: boolean) {
  const values: unknown[] = [];
  const add = (value: unknown) => { values.push(value); return postgres ? `$${values.length}` : `?${values.length}`; };
  const field = (key: string) => postgres ? `s.data_json->>'${key}'` : `json_extract(s.data_json, '$.${key}')`;
  const actorJoin = add(actor.id);
  const workflowAccess = actor.role === "admin" ? "" : ` AND w.owner_user_id=${add(actor.id)}`;
  const from = `FROM canvas_schedules s
    LEFT JOIN canvas_workflows w ON w.id=s.workflow_id${workflowAccess}
    LEFT JOIN canvas_schedule_favorites f ON f.schedule_id=s.id AND f.owner_user_id=${actorJoin}`;
  const where = actor.role === "admin" ? ["1=1"] : [`s.owner_user_id=${add(actor.id)}`];
  if (query.workflowId) where.push(`s.workflow_id=${add(query.workflowId)}`);
  if (query.scheduleId) where.push(`s.id=${add(query.scheduleId)}`);
  if (query.favorite) where.push("f.schedule_id IS NOT NULL");
  if (query.q) {
    const needle = `%${query.q.toLowerCase().replace(/[!%_]/g, (value) => `!${value}`)}%`;
    where.push(`(${[field("name"), "w.name", "f.alias", "f.note"].map((column) => `LOWER(COALESCE(${column}, '')) LIKE ${add(needle)} ESCAPE '!'`).join(" OR ")})`);
  }
  const source = `${from} WHERE ${where.join(" AND ")}`;
  const countSql = `SELECT COUNT(*) AS total ${source}`;
  const countValues = [...values];
  const listSql = `SELECT s.id, ${field("name")} AS name, s.workflow_id, s.status, s.updated_at,
    ${["schemaVersion", "totalMainTasks", "totalChildTasks", "totalContentTasks", "totalImageTasks"].map((key) => `${field(key)} AS "${key}"`).join(", ")},
    w.name AS workflow_name, f.alias, f.note, f.created_at AS favorite_created_at, f.updated_at AS favorite_updated_at
    ${source} ORDER BY ${query.favorite ? "f.created_at" : "s.updated_at"} DESC, s.id DESC
    LIMIT ${add(query.limit)} OFFSET ${add(query.offset)}`;
  return { countSql, countValues, listSql, values };
}
