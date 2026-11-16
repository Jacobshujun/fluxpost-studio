// Keep browsing payloads independent of provider/analysis metadata. Full selected
// items use the separate server-only path so raw-derived repairs remain possible.
const selectionFields = [
  "id", "ownerUserId", "platform", "sourceId", "sourceUrl", "title", "contentText", "authorName",
  "mediaType", "images", "downloadedImages", "videoUrl", "downloadedVideoUrl", "videoFrames",
  "manualEditedFields", "downloadErrors", "contentTagging", "customTags", "poolStatus", "hotScore",
  "crawledAt", "publishedAt", "publishedLabel", "firstSeenAt", "lastSeenAt",
] as const;

export function contentPoolReadQuery(input: {
  backend: "postgres" | "sqlite";
  projection: "selection" | "items";
  ownerUserId?: string;
  projectId?: string;
  itemIds?: string[];
}) {
  const postgres = input.backend === "postgres";
  const values: unknown[] = [];
  const bind = (value: unknown) => {
    values.push(value);
    return postgres ? `$${values.length}` : "?";
  };
  const conditions: string[] = [];
  if (input.ownerUserId) conditions.push(`${postgres ? "p.data_json->>'ownerUserId'" : "json_extract(p.data_json,'$.ownerUserId')"} = ${bind(input.ownerUserId)}`);
  if (input.projectId) conditions.push(`p.id = ${bind(input.projectId)}`);
  let expansion: string;
  let item: string;
  let itemCondition = "";
  if (input.projection === "selection") {
    expansion = postgres
      ? `jsonb_to_recordset(COALESCE(p.data_json->'items','[]'::jsonb)) AS entry(${selectionFields.map((field) => `"${field}" jsonb`).join(",")})`
      : "json_each(p.data_json, '$.items') AS entry";
    item = postgres ? "jsonb_strip_nulls(to_jsonb(entry))" : `json_object(${selectionFields.map((field) => `'${field}',json_extract(entry.value,'$.${field}')`).join(",")})`;
  } else {
    // One JSON traversal per project for the entire ID set, rather than N
    // containment lookups whose planner can choose N full table scans.
    expansion = postgres
      ? input.itemIds
        ? `jsonb_path_query(p.data_json, '$.items[*] ? (@.id == $ids[*])', ${bind(JSON.stringify({ ids: input.itemIds }))}::jsonb) AS entry(item)`
        : "jsonb_array_elements(COALESCE(p.data_json->'items','[]'::jsonb)) AS entry(item)"
      : "json_each(p.data_json, '$.items') AS entry";
    item = postgres ? "entry.item" : "entry.value";
    if (!postgres && input.itemIds) {
      itemCondition = `WHERE json_extract(entry.value,'$.id') IN (SELECT value FROM json_each(${bind(JSON.stringify(input.itemIds))}))`;
    }
  }
  return {
    sql: `WITH projects AS MATERIALIZED (
      SELECT p.id, p.query, p.updated_at, p.last_crawled_at, p.normalized_query, p.created_at,
             ${postgres ? "p.data_json->>'ownerUserId'" : "json_extract(p.data_json,'$.ownerUserId')"} AS owner_user_id, p.data_json
      FROM content_projects p ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
    )
    SELECT p.id AS project_id, p.query AS project_name, p.updated_at AS project_updated_at,
           p.last_crawled_at AS project_last_crawled_at, p.owner_user_id,
           p.normalized_query, p.created_at, ${item} AS item
    FROM projects p CROSS JOIN ${postgres ? "LATERAL " : ""}${expansion} ${itemCondition}
    ${!postgres && input.projection === "items" && input.itemIds ? "ORDER BY p.id" : ""}`,
    values,
  };
}
