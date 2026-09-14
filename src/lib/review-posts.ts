import { createHash } from "node:crypto";
import { getDatabaseBackend, queryReviewRowsFromDb } from "./database";
import type { ReviewListItem, ReviewListPage, ReviewMetadata } from "./review-contract";
import { reviewListItemFromPost } from "./review-contract";
import type { GeneratedPost, Platform } from "./types";
import type { WorkspaceAccessActor } from "./workspace-ownership";

export class ReviewQueryError extends Error {}
export function reviewImageVersion(url: string) { return createHash("sha256").update(url).digest("hex").slice(0, 24); }

export function reviewListItem(post: GeneratedPost): ReviewListItem {
  return { ...reviewListItemFromPost(post), thumbnailVersion: post.imageUrls[0] ? reviewImageVersion(post.imageUrls[0]) : undefined };
}

function queryScope(account: WorkspaceAccessActor, params: URLSearchParams, filtered: boolean) {
  const pg = getDatabaseBackend() === "postgres";
  const values: unknown[] = [];
  const bind = (value: unknown) => { values.push(value); return pg ? `$${values.length}` : "?"; };
  const json = (field: string) => pg ? `data_json->>'${field}'` : `json_extract(data_json, '$.${field}')`;
  const author = `COALESCE(NULLIF(TRIM(${json("ownerDisplayName")}), ''), NULLIF(TRIM(${json("ownerUserId")}), ''), '未标记作者')`;
  const where = ["1=1"];
  if (account.role !== "admin") where.push(`${json("ownerUserId")}=${bind(account.id)}`);
  if (params.get("sourceBatchId")) where.push(`${json("sourceBatchId")}=${bind(params.get("sourceBatchId"))}`);
  if (filtered) {
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
  return { pg, values, bind, json, author, where };
}

export async function listReviewPosts(account: WorkspaceAccessActor, params: URLSearchParams): Promise<ReviewListPage> {
  const { pg, values, bind, json, author, where } = queryScope(account, params, true);
  const cursor = params.get("cursor");
  if (cursor) {
    let value: { at: string; id: string };
    try { value = JSON.parse(Buffer.from(cursor, "base64url").toString()); } catch { throw new ReviewQueryError("Invalid cursor"); }
    if (!value || typeof value.id !== "string" || typeof value.at !== "string" || !Number.isFinite(Date.parse(value.at))) throw new ReviewQueryError("Invalid cursor");
    where.push(`(updated_at, id) < (${bind(value.at)}, ${bind(value.id)})`);
  }
  const arrayLength = (field: string) => pg ? `jsonb_array_length(COALESCE(NULLIF(data_json->'${field}', 'null'::jsonb), '[]'::jsonb))` : `COALESCE(json_array_length(data_json, '$.${field}'),0)`;
  const image = pg ? "data_json->'imageUrls'->>0" : "json_extract(data_json, '$.imageUrls[0]')";
  const rows = await queryReviewRowsFromDb<ReviewListItem & { image?: string; updatedAt: string | Date }>(
    `SELECT id, COALESCE(${json("title")},'') title, status, platform, updated_at AS "updatedAt", ${author} author,
      SUBSTR(COALESCE(NULLIF(${json("body")},''),${json("imagePrompt")},''),1,160) excerpt,
      ${arrayLength("imageUrls")}+${arrayLength("videoUrls")} AS "mediaCount", ${image} image
     FROM generated_posts WHERE ${where.join(" AND ")} ORDER BY updated_at DESC, id DESC LIMIT 51`, values);
  const posts = rows.slice(0,50).map(({ image, ...row }) => ({ ...row, updatedAt: new Date(row.updatedAt).toISOString(), thumbnailVersion: image ? reviewImageVersion(image) : undefined }));
  const last = posts.at(-1);
  return { posts, nextCursor: rows.length > 50 && last ? Buffer.from(JSON.stringify({ at: last.updatedAt, id: last.id })).toString("base64url") : undefined };
}

export async function getReviewMetadata(account: WorkspaceAccessActor, params: URLSearchParams): Promise<ReviewMetadata> {
  const { values, author, where } = queryScope(account, params, false);
  const rows = await queryReviewRowsFromDb<{ author: string; platform: Platform; status: string; count: number | string }>(
    `SELECT ${author} author, platform, status, COUNT(*) count FROM generated_posts WHERE ${where.join(" AND ")} GROUP BY ${author}, platform, status`, values);
  const summary = { total: 0, ready: 0, approved: 0, published: 0 };
  for (const row of rows) { const n = Number(row.count); summary.total += n; if (row.status !== "published") summary.ready += n; if (row.status === "approved") summary.approved += n; if (row.status === "published") summary.published += n; }
  return { summary, authors: [...new Set(rows.map((row)=>row.author))].sort((a,b)=>a.localeCompare(b,"zh-CN")), platforms: [...new Set(rows.map((row)=>row.platform))] };
}
