import type { WorkspaceAccessActor } from "../workspace-ownership";

export const canvasHistoryPageSize = 32;

export type CanvasHistoryCursor = { createdAt: string; attempt: number; id: string };

// Rank IDs before fetching JSON: graph snapshots must not be repeated for the
// entire execution history in the Node process just to find a few latest nodes.
export function canvasHistoryQuery(postgres: boolean, input: {
  workflowId: string;
  account: WorkspaceAccessActor;
  selection: "attempt" | "success" | "reuse";
  nodeId?: string;
  cursor?: CanvasHistoryCursor;
}) {
  const values: Array<string | number> = [];
  const bind = (value: string | number) => {
    values.push(value);
    return postgres ? `$${values.length}` : "?";
  };
  const json = (alias: string, key: string) => postgres
    ? `${alias}.data_json->>'${key}'` : `json_extract(${alias}.data_json, '$.${key}')`;
  const where = [
    `r.workflow_id = ${bind(input.workflowId)}`,
    `${json("r", "iterationContext")} IS NULL`,
  ];
  if (input.account.role !== "admin") where.push(`${json("r", "ownerUserId")} = ${bind(input.account.id)}`);
  where.push(postgres
    ? `EXISTS (SELECT 1 FROM jsonb_array_elements(r.data_json->'graphSnapshot'->'nodes') snapshot_node WHERE snapshot_node->>'id' = n.node_id)`
    : `EXISTS (SELECT 1 FROM json_each(r.data_json, '$.graphSnapshot.nodes') snapshot_node WHERE json_extract(snapshot_node.value, '$.id') = n.node_id)`);
  if (input.selection !== "attempt") {
    where.push("n.status IN ('completed', 'partial', 'reused', 'bypassed')");
    where.push(postgres
      ? `n.data_json->'outputs' IS NOT NULL AND n.data_json->'outputs' <> '{}'::jsonb`
      : `EXISTS (SELECT 1 FROM json_each(n.data_json, '$.outputs'))`);
  }
  const order = `${input.selection === "attempt" ? "n.updated_at DESC, " : ""}r.created_at DESC, n.attempt DESC, n.id DESC`;
  if (input.selection === "reuse") {
    if (!input.nodeId) throw new Error("Canvas reuse requires a node ID.");
    where.push(`n.node_id = ${bind(input.nodeId)}`);
    if (input.cursor) {
      // Mixed descending keys use one tuple comparison; no OFFSET or retained
      // previous pages, even when the compatible result is very old.
      where.push(`(r.created_at, n.attempt, n.id) < (${bind(input.cursor.createdAt)}, ${bind(input.cursor.attempt)}, ${bind(input.cursor.id)})`);
    }
    return {
      sql: `SELECT n.data_json AS node_run_json, r.data_json AS run_json
        FROM canvas_node_runs n JOIN canvas_runs r ON r.id = n.run_id
        WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ${canvasHistoryPageSize}`,
      values,
    };
  }
  return {
    sql: `WITH ranked AS (
      SELECT n.id, ROW_NUMBER() OVER (PARTITION BY n.node_id ORDER BY ${order}) AS position
      FROM canvas_node_runs n JOIN canvas_runs r ON r.id = n.run_id
      WHERE ${where.join(" AND ")}
    )
    SELECT n.data_json AS node_run_json, r.data_json AS run_json
    FROM ranked JOIN canvas_node_runs n ON n.id = ranked.id
    JOIN canvas_runs r ON r.id = n.run_id
    WHERE ranked.position = 1 ORDER BY ${order}`,
    values,
  };
}
