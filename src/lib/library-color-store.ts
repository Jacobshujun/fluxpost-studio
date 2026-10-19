import { randomUUID } from "node:crypto";
import { withLibraryColorDatabase, type LibraryColorSql } from "./database";
import { hexToLab, libraryColorVersion } from "./library-color";
import type { LibraryColorCoverage, LibraryColorJob, LibraryPalette } from "./types";
import { isWorkspaceAdmin, type WorkspaceAccessActor } from "./workspace-ownership";

export type LibraryColorClaim = { jobId: string; assetId: string; sha256: string; token: string; ownerId: string; isAdmin: boolean };

function* paletteWrite(sql: LibraryColorSql, assetId: string, palette: LibraryPalette, postgres: boolean) {
  // Same-SHA fence avoids attaching obsolete derived data to a replaced/deleted asset.
  const rows = yield* sql<{ id: string }>(`SELECT id FROM library_assets WHERE id=$1 AND sha256=$2 AND deleted_at IS NULL${postgres ? " FOR SHARE" : ""}`, [assetId, palette.sha256]);
  if (!rows.length) return false;
  yield* sql(`INSERT INTO library_asset_palettes(asset_id,sha256,version,status,data_json) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(asset_id) DO UPDATE SET sha256=excluded.sha256,version=excluded.version,status=excluded.status,data_json=excluded.data_json`,
  [assetId, palette.sha256, palette.version, palette.status, JSON.stringify(palette)]);
  yield* sql("DELETE FROM library_asset_colors WHERE asset_id=$1", [assetId]);
  for (const [index, color] of palette.colors.entries()) {
    const [l, a, b] = hexToLab(color.hex);
    yield* sql("INSERT INTO library_asset_colors(asset_id,ordinal,l,a,b,coverage) VALUES($1,$2,$3,$4,$5,$6)", [assetId, index, l, a, b, color.coverage]);
  }
  return true;
}

export function saveLibraryPalette(assetId: string, palette: LibraryPalette) {
  return withLibraryColorDatabase((sql, postgres) => paletteWrite(sql, assetId, palette, postgres), true);
}

export function libraryColorCoverage(account: WorkspaceAccessActor): Promise<LibraryColorCoverage> {
  const admin = isWorkspaceAdmin(account);
  return withLibraryColorDatabase(function* (sql) {
    const rows = yield* sql<{ total: string | number; analyzed: string | number; failed: string | number; missing: string | number; retry: string | number }>(`
      SELECT COUNT(*) total,
        COALESCE(SUM(CASE WHEN p.status='completed' AND p.version=$2 AND p.sha256=a.sha256 THEN 1 ELSE 0 END),0) analyzed,
        COALESCE(SUM(CASE WHEN p.status='failed' AND p.version=$2 AND p.sha256=a.sha256 THEN 1 ELSE 0 END),0) failed,
        COALESCE(SUM(CASE WHEN ($3=1 OR a.owner_user_id=$1) AND (p.asset_id IS NULL OR p.version<>$2 OR p.sha256<>a.sha256) THEN 1 ELSE 0 END),0) missing,
        COALESCE(SUM(CASE WHEN ($3=1 OR a.owner_user_id=$1) AND p.status='failed' AND p.version=$2 AND p.sha256=a.sha256 THEN 1 ELSE 0 END),0) retry
      FROM library_assets a LEFT JOIN library_asset_palettes p ON p.asset_id=a.id
      WHERE a.deleted_at IS NULL AND ($3=1 OR a.owner_user_id=$1 OR a.visibility='team')`, [account.id, libraryColorVersion, admin ? 1 : 0]);
    const row = rows[0];
    return { total: Number(row.total), analyzed: Number(row.analyzed), failed: Number(row.failed), manageableMissing: Number(row.missing), manageableFailed: Number(row.retry) };
  });
}

export function enqueueLibraryColorJob(account: WorkspaceAccessActor, mode: "missing" | "failed") {
  return withLibraryColorDatabase(function* (sql, postgres) {
    if (postgres) yield* sql("SELECT pg_advisory_xact_lock(hashtext($1))", [`library-colors-owner:${account.id}`]);
    const active = yield* sql<{ id: string }>("SELECT id FROM library_color_jobs WHERE owner_user_id=$1 AND status='running'", [account.id]);
    if (active.length) return active[0].id;
    const id = `library-colors-${randomUUID()}`;
    yield* sql("INSERT INTO library_color_jobs(id,owner_user_id,is_admin,status,created_at) VALUES($1,$2,$3,'running',$4)", [id, account.id, isWorkspaceAdmin(account) ? 1 : 0, new Date().toISOString()]);
    const condition = mode === "failed"
      ? "p.status='failed' AND p.version=$3 AND p.sha256=a.sha256"
      : "(p.asset_id IS NULL OR p.version<>$3 OR p.sha256<>a.sha256)";
    yield* sql(`INSERT INTO library_color_items(job_id,asset_id,sha256,status)
      SELECT $1,a.id,a.sha256,'queued' FROM library_assets a LEFT JOIN library_asset_palettes p ON p.asset_id=a.id
      WHERE a.deleted_at IS NULL AND ($4=1 OR a.owner_user_id=$2) AND ${condition}
      AND NOT EXISTS (SELECT 1 FROM library_color_items i WHERE i.asset_id=a.id AND i.status IN ('queued','running')) ON CONFLICT DO NOTHING`,
    [id, account.id, libraryColorVersion, isWorkspaceAdmin(account) ? 1 : 0]);
    yield* settleJob(sql, id);
    return id;
  }, true);
}

function* settleJob(sql: LibraryColorSql, jobId: string) {
  yield* sql(`UPDATE library_color_jobs SET status='completed' WHERE id=$1
    AND NOT EXISTS (SELECT 1 FROM library_color_items WHERE job_id=$1 AND status IN ('queued','running'))`, [jobId]);
}

export function getLibraryColorJob(account: WorkspaceAccessActor, id?: string): Promise<LibraryColorJob | undefined> {
  return withLibraryColorDatabase(function* (sql) {
    const jobs = yield* sql<{ id: string; status: LibraryColorJob["status"] }>(
      id ? "SELECT id,status FROM library_color_jobs WHERE id=$1 AND owner_user_id=$2"
        : "SELECT id,status FROM library_color_jobs WHERE owner_user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1", id ? [id, account.id] : [account.id]);
    if (!jobs.length) return undefined;
    const job = jobs[0];
    const counts = yield* sql<{ total: string | number; completed: string | number; failed: string | number }>(`
      SELECT COUNT(*) total, COALESCE(SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END),0) completed,
      COALESCE(SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END),0) failed FROM library_color_items WHERE job_id=$1`, [job.id]);
    const failures = yield* sql<{ asset_id: string; error: string }>("SELECT asset_id,error FROM library_color_items WHERE job_id=$1 AND status='failed' ORDER BY asset_id", [job.id]);
    return { ...job, total: Number(counts[0].total), completed: Number(counts[0].completed), failed: Number(counts[0].failed), failures: failures.map((f) => ({ assetId: f.asset_id, error: f.error })) };
  });
}

export function claimLibraryColorItem(now = new Date()): Promise<LibraryColorClaim | undefined> {
  return withLibraryColorDatabase(function* (sql, postgres) {
    if (postgres) yield* sql("SELECT pg_advisory_xact_lock(176238819)");
    const time = now.toISOString();
    const running = yield* sql<{ count: number | string }>("SELECT COUNT(*) count FROM library_color_items WHERE status='running' AND locked_until>$1", [time]);
    if (Number(running[0].count) >= 2) return undefined;
    const rows = yield* sql<{ job_id: string; asset_id: string; sha256: string; owner_user_id: string; is_admin: number }>(`
      SELECT i.job_id,i.asset_id,i.sha256,j.owner_user_id,j.is_admin FROM library_color_items i
      JOIN library_color_jobs j ON j.id=i.job_id WHERE j.status='running'
      AND (i.status='queued' OR (i.status='running' AND i.locked_until<=$1))
      ORDER BY j.created_at,i.asset_id LIMIT 1`, [time]);
    if (!rows.length) return undefined;
    const item = rows[0]; const token = randomUUID();
    yield* sql("UPDATE library_color_items SET status='running',locked_by=$3,locked_until=$4 WHERE job_id=$1 AND asset_id=$2", [item.job_id, item.asset_id, token, new Date(now.getTime() + 120_000).toISOString()]);
    return { jobId: item.job_id, assetId: item.asset_id, sha256: item.sha256, token, ownerId: item.owner_user_id, isAdmin: Boolean(item.is_admin) };
  }, true);
}

export function completeLibraryColorItem(claim: LibraryColorClaim, palette: LibraryPalette, writePalette = true) {
  return withLibraryColorDatabase(function* (sql, postgres) {
    const rows = yield* sql<{ locked_by: string }>(`SELECT locked_by FROM library_color_items WHERE job_id=$1 AND asset_id=$2 AND status='running'${postgres ? " FOR UPDATE" : ""}`, [claim.jobId, claim.assetId]);
    if (rows[0]?.locked_by !== claim.token) return false;
    const valid = writePalette ? yield* paletteWrite(sql, claim.assetId, palette, postgres) : false;
    yield* sql("UPDATE library_color_items SET status=$3,error=$4,locked_by=NULL,locked_until=NULL WHERE job_id=$1 AND asset_id=$2", [claim.jobId, claim.assetId, valid && palette.status === "completed" ? "completed" : "failed", valid ? palette.error || null : "图片已删除或内容已变化，请重新分析。"]);
    yield* settleJob(sql, claim.jobId);
    return true;
  }, true);
}

export function nextLibraryColorLease() {
  return withLibraryColorDatabase(function* (sql) {
    const rows = yield* sql<{ deadline: string | null }>("SELECT MIN(locked_until) deadline FROM library_color_items WHERE status='running'");
    return rows[0]?.deadline || undefined;
  });
}
