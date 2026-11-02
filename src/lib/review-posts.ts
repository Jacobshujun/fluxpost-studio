import { createHash } from "node:crypto";
import { getDatabaseBackend, queryReviewRowsFromDb } from "./database";
import type { ReviewListItem, ReviewListPage, ReviewMetadata } from "./review-contract";
import { reviewListItemFromPost } from "./review-contract";
import type { GeneratedPost, Platform } from "./types";
import type { WorkspaceAccessActor } from "./workspace-ownership";
import { parseReviewFilters, reviewTimeBounds, ReviewFilterError, type ReviewCondition, type ReviewGroup } from "./review-filters";

export class ReviewQueryError extends ReviewFilterError {}
export function reviewImageVersion(url: string) { return createHash("sha256").update(url).digest("hex").slice(0, 24); }

export function reviewListItem(post: GeneratedPost): ReviewListItem {
  return { ...reviewListItemFromPost(post), thumbnailVersion: post.imageUrls[0] ? reviewImageVersion(post.imageUrls[0]) : undefined };
}

function queryScope(account: WorkspaceAccessActor, params: URLSearchParams, filtered: boolean) {
  const pg = getDatabaseBackend() === "postgres";
  const values: unknown[] = [];
  const bind = (value: unknown) => { values.push(value); return pg ? `$${values.length}` : "?"; };
  const json = (field: string) => pg ? `data_json->>'${field}'` : `json_extract(data_json, '$.${field}')`;
  // Match String.trim() used by publishing, including tabs and full-width spaces.
  const whitespace = [9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279].map((code) => `${pg ? "chr" : "char"}(${code})`).join(" || ");
  const trim = (expr: string) => `${pg ? "BTRIM" : "TRIM"}(${expr}, ${whitespace})`;
  const author = `COALESCE(NULLIF(TRIM(${json("ownerDisplayName")}), ''), NULLIF(TRIM(${json("ownerUserId")}), ''), '未标记作者')`;
  const vehicle = `COALESCE(NULLIF(${trim(json("feishuVehicle"))}, ''), ${trim(json("taskKeyword"))}, '')`;
  const where = ["1=1"];
  if (account.role !== "admin") where.push(`${json("ownerUserId")}=${bind(account.id)}`);
  if (params.get("sourceBatchId")) where.push(`${json("sourceBatchId")}=${bind(params.get("sourceBatchId"))}`);
  if (filtered && params.has("filters")) {
    const filters = parseReviewFilters(params.get("filters")!);
    const asOf = filters.asOf || new Date().toISOString();
    const fieldSql = (field: string) => field === "vehicle" ? vehicle : field === "author" ? author : field === "status" || field === "platform" ? field : `COALESCE(${json(field)}, '')`;
    const contains = (expr: string, value: string) => `${pg ? "STRPOS" : "INSTR"}(LOWER(${expr}), ${bind(value.toLowerCase())})>0`;
    const conditionSql = (condition: ReviewCondition): string => {
      if (condition.field === "createdAt" || condition.field === "updatedAt") {
        const bounds = reviewTimeBounds(condition, asOf);
        const column = condition.field === "createdAt" ? "created_at" : "updated_at";
        return [bounds.since ? `${column} >= ${bind(bounds.since)}` : "", bounds.until ? `${column} < ${bind(bounds.until)}` : ""].filter(Boolean).join(" AND ");
      }
      const expr = fieldSql(condition.field);
      switch (condition.op) {
        case "empty": return `${trim(expr)}=''`;
        case "notEmpty": return `${trim(expr)}<>''`;
        case "eq": return `${expr}=${bind(condition.value)}`;
        case "ne": return `${expr}<>${bind(condition.value)}`;
        case "contains": return contains(expr, String(condition.value));
        case "notContains": return `NOT (${contains(expr, String(condition.value))})`;
        case "in": case "notIn": return `${expr} ${condition.op === "notIn" ? "NOT IN" : "IN"} (${(condition.value as string[]).map(bind).join(",")})`;
        default: throw new ReviewQueryError("Invalid operator");
      }
    };
    const groupSql = (group: ReviewGroup): string => `(${group.children.map((child) => `(${"children" in child ? groupSql(child) : conditionSql(child)})`).join(group.match === "all" ? " AND " : " OR ")})`;
    if (filters.groups.length) where.push(`(${filters.groups.map(groupSql).join(filters.match === "all" ? " AND " : " OR ")})`);
    const { field, value } = filters.search;
    if (value.trim()) {
      if (field === "vehicle") where.push(`${vehicle}=${bind(value.trim())}`);
      else if (field === "all") where.push(contains(["title", "body", "imagePrompt", "taskKeyword", "feishuVehicle"].map(fieldSql).join(` || ${pg ? "chr" : "char"}(10) || `), value.trim()));
      else where.push(contains(fieldSql(field), value.trim()));
    }
  } else if (filtered) {
    const status = params.get("status") || "ready";
    if (!["ready", "all", "draft", "editing", "approved", "published"].includes(status)) throw new ReviewQueryError("Invalid review status");
    if (status === "ready") where.push("status IN ('draft','editing','approved')");
    else if (status !== "all") where.push(`status=${bind(status)}`);
    const platform = params.get("platform");
    if (platform && platform !== "all") {
      if (!["xiaohongshu","douyin","weibo","wechat_channels","xiaopeng_bbs","dongchedi","feishu","original"].includes(platform)) throw new ReviewQueryError("Invalid platform");
      where.push(`platform=${bind(platform)}`);
    }
    if (params.get("author")) where.push(`${author}=${bind(params.get("author"))}`);
    const q = params.get("q")?.trim().toLowerCase();
    if (q) {
      const text = ["title","body","imagePrompt","taskKeyword","feishuVehicle"].map((field) => `COALESCE(${json(field)}, '')`).join(" || char(10) || ");
      where.push(`${pg ? "STRPOS" : "INSTR"}(LOWER(${pg ? text.replaceAll("char(10)","chr(10)") : text}), ${bind(q)})>0`);
    }
    for (const [key, op] of [["since", ">="], ["until", "<"]] as const) {
      const raw = params.get(key);
      if (!raw) continue;
      if (!Number.isFinite(Date.parse(raw))) throw new ReviewQueryError("Invalid time boundary");
      where.push(`updated_at ${op} ${bind(new Date(raw).toISOString())}`);
    }
  }
  return { pg, values, bind, json, author, vehicle, where };
}

export async function listReviewPosts(account: WorkspaceAccessActor, params: URLSearchParams): Promise<ReviewListPage> {
  const cursor = params.get("cursor");
  let position: { at: string; id: string; asOf?: string } | undefined;
  if (cursor) {
    let value: { at: string; id: string; asOf?: string };
    try { value = JSON.parse(Buffer.from(cursor, "base64url").toString()); } catch { throw new ReviewQueryError("Invalid cursor"); }
    if (!value || typeof value.id !== "string" || typeof value.at !== "string" || !Number.isFinite(Date.parse(value.at))) throw new ReviewQueryError("Invalid cursor");
    position = value;
  }
  let asOf: string | undefined;
  if (params.has("filters")) {
    const filters = parseReviewFilters(params.get("filters")!);
    asOf = filters.asOf || position?.asOf || new Date().toISOString();
    params = new URLSearchParams(params);
    params.set("filters", JSON.stringify({ ...filters, asOf }));
  }
  const { pg, values, bind, json, author, where } = queryScope(account, params, true);
  if (position) where.push(`(updated_at, id) < (${bind(position.at)}, ${bind(position.id)})`);
  const arrayLength = (field: string) => pg ? `jsonb_array_length(COALESCE(NULLIF(data_json->'${field}', 'null'::jsonb), '[]'::jsonb))` : `COALESCE(json_array_length(data_json, '$.${field}'),0)`;
  const image = pg ? "data_json->'imageUrls'->>0" : "json_extract(data_json, '$.imageUrls[0]')";
  const rows = await queryReviewRowsFromDb<ReviewListItem & { image?: string; updatedAt: string | Date }>(
    `SELECT id, COALESCE(${json("title")},'') title, status, platform, updated_at AS "updatedAt", ${author} author,
      SUBSTR(COALESCE(NULLIF(${json("body")},''),${json("imagePrompt")},''),1,160) excerpt,
      ${arrayLength("imageUrls")}+${arrayLength("videoUrls")} AS "mediaCount", ${image} image
     FROM generated_posts WHERE ${where.join(" AND ")} ORDER BY updated_at DESC, id DESC LIMIT 51`, values);
  const posts = rows.slice(0,50).map(({ image, ...row }) => ({ ...row, updatedAt: new Date(row.updatedAt).toISOString(), thumbnailVersion: image ? reviewImageVersion(image) : undefined }));
  const last = posts.at(-1);
  return { posts, nextCursor: rows.length > 50 && last ? Buffer.from(JSON.stringify({ at: last.updatedAt, id: last.id, ...(asOf ? { asOf } : {}) })).toString("base64url") : undefined };
}

export async function getReviewMetadata(account: WorkspaceAccessActor, params: URLSearchParams): Promise<ReviewMetadata> {
  const { values, author, vehicle, where } = queryScope(account, params, false);
  const rows = await queryReviewRowsFromDb<{ author: string; platform: Platform; status: string; count: number | string }>(
    `SELECT ${author} author, platform, status, COUNT(*) count FROM generated_posts WHERE ${where.join(" AND ")} GROUP BY ${author}, platform, status`, values);
  const summary = { total: 0, ready: 0, approved: 0, published: 0 };
  for (const row of rows) { const n = Number(row.count); summary.total += n; if (row.status !== "published") summary.ready += n; if (row.status === "approved") summary.approved += n; if (row.status === "published") summary.published += n; }
  const vehicles = await queryReviewRowsFromDb<{ vehicle: string }>(`SELECT DISTINCT ${vehicle} vehicle FROM generated_posts WHERE ${where.join(" AND ")} AND ${vehicle}<>'' ORDER BY vehicle`, values);
  return { summary, authors: [...new Set(rows.map((row)=>row.author))].sort((a,b)=>a.localeCompare(b,"zh-CN")), platforms: [...new Set(rows.map((row)=>row.platform))], vehicles: vehicles.map((row) => row.vehicle) };
}
