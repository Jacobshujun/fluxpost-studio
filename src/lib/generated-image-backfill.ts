import { randomUUID } from "node:crypto";
import { withLibraryColorDatabase } from "./database";
import { extractCanvasGeneratedImages, extractOriginalCardImages, extractPostGeneratedImages, extractQueueGeneratedImages, type GeneratedImageEvidenceResult } from "./generated-image-evidence";
import { indexNextGeneratedImage, linkReusedCanvasImages, parseEvidence, scanId, writeGeneratedReceipt } from "./generated-image-store";
import type { CanvasNodeRun, CanvasRun } from "./canvas/types";
import type { GeneratedPost, ImageGenerationQueueJob, OriginalBatchItem } from "./types";
import { isWorkspaceAdmin, type WorkspaceAccessActor } from "./workspace-ownership";

const tables = ["canvas_node_runs", "image_generation_queue", "original_batch_items", "generated_posts", "canvas_node_runs"] as const;
const decode = <T>(value: unknown): T => (typeof value === "string" ? JSON.parse(value) : value) as T;

export async function startGeneratedBackfill(actor: WorkspaceAccessActor, restart = false) {
  await withLibraryColorDatabase(function* (sql) {
    yield* sql(`INSERT INTO generated_image_scans(id,owner_user_id,is_admin,updated_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [scanId(actor), actor.id, isWorkspaceAdmin(actor) ? 1 : 0, new Date().toISOString()]);
    if (restart) yield* sql(`UPDATE generated_image_scans SET phase=0,cursor='',status='queued',error=NULL,uncertain=0,duplicates=0
      WHERE id=$1 AND status IN ('completed','failed')`, [scanId(actor)]);
  }, true);
  kickGeneratedImageWorker();
}

export async function runGeneratedBackfillPage() {
  const token = randomUUID();
  const claim = await withLibraryColorDatabase(function* (sql, postgres) {
    const rows = yield* sql<{ id: string; owner_user_id: string; is_admin: number; phase: number; cursor: string }>(`SELECT id,owner_user_id,is_admin,phase,cursor
      FROM generated_image_scans WHERE status='queued' OR (status='running' AND lease_until<$1) ORDER BY id LIMIT 1${postgres ? " FOR UPDATE SKIP LOCKED" : ""}`, [new Date().toISOString()]);
    if (!rows.length) return undefined;
    yield* sql("UPDATE generated_image_scans SET status='running',token=$2,lease_until=$3 WHERE id=$1", [rows[0].id, token, new Date(Date.now() + 300_000).toISOString()]);
    return rows[0];
  }, true);
  if (!claim) return false;
  try {
    const table = tables[claim.phase];
    if (!table) throw new Error("Invalid generated backfill phase.");
    const rows = await withLibraryColorDatabase(function* (sql, postgres) {
      const owner = table === "canvas_node_runs" ? "p.owner_user_id" : table === "original_batch_items" ? "s.owner_user_id"
        : postgres ? "COALESCE(s.data_json->>'ownerUserId','')" : "COALESCE(json_extract(s.data_json,'$.ownerUserId'),'')";
      return yield* sql<{ id: string; data_json: unknown; parent_json?: unknown }>(`SELECT s.id,s.data_json${table === "canvas_node_runs" ? ",p.data_json parent_json" : ""}
        FROM ${table} s ${table === "canvas_node_runs" ? "JOIN canvas_runs p ON p.id=s.run_id" : ""}
        WHERE s.id>$1 AND ($2=1 OR ${owner}=$3) ORDER BY s.id LIMIT 30`, [claim.cursor, claim.is_admin, claim.owner_user_id]);
    });
    for (const row of rows) {
      let result: GeneratedImageEvidenceResult;
      if (table === "canvas_node_runs" && claim.phase === 4) {
        await linkReusedCanvasImages(decode<CanvasRun>(row.parent_json), decode<CanvasNodeRun>(row.data_json));
        result = { images: [], uncertain: 0 };
      }
      else if (table === "canvas_node_runs") result = extractCanvasGeneratedImages(decode<CanvasRun>(row.parent_json), decode<CanvasNodeRun>(row.data_json));
      else if (table === "image_generation_queue") result = extractQueueGeneratedImages(decode<ImageGenerationQueueJob>(row.data_json));
      else if (table === "original_batch_items") result = extractOriginalCardImages(decode<OriginalBatchItem>(row.data_json));
      else {
        const post = decode<GeneratedPost>(row.data_json);
        const known = await withLibraryColorDatabase(function* (sql) {
          if (!post.imageUrls.length) return [];
          const values = [post.ownerUserId || "", ...post.imageUrls];
          const found = yield* sql<{ evidence_json: string }>(`SELECT evidence_json FROM generated_image_results WHERE owner_user_id=$1
            AND original_url IN (${post.imageUrls.map((_, i) => `$${i + 2}`).join(",")})`, values);
          return found.map((item) => parseEvidence(item.evidence_json));
        });
        result = extractPostGeneratedImages(post, known);
      }
      await withLibraryColorDatabase(function* (sql, postgres) {
        const active = yield* sql(`SELECT id FROM generated_image_scans WHERE id=$1 AND token=$2 AND status='running'${postgres ? " FOR UPDATE" : ""}`, [claim.id, token]);
        if (!active.length) return;
        let duplicates = 0;
        for (const image of result.images) if ((yield* writeGeneratedReceipt(sql, image, postgres)) === "duplicate") duplicates++;
        yield* sql(`UPDATE generated_image_scans SET cursor=$3,uncertain=uncertain+$4,duplicates=duplicates+$5,updated_at=$6 WHERE id=$1 AND token=$2`,
          [claim.id, token, row.id, result.uncertain, duplicates, new Date().toISOString()]);
      }, true);
    }
    await withLibraryColorDatabase(function* (sql) {
      const nextPhase = rows.length < 30 ? claim.phase + 1 : claim.phase;
      yield* sql(`UPDATE generated_image_scans SET phase=$3,cursor=$4,status=$5,token=NULL,lease_until=NULL,updated_at=$6 WHERE id=$1 AND token=$2`,
        [claim.id, token, nextPhase, nextPhase !== claim.phase ? "" : rows[rows.length - 1].id,
          nextPhase === tables.length ? "completed" : "queued", new Date().toISOString()]);
    });
  } catch (error) {
    await withLibraryColorDatabase(function* (sql) {
      yield* sql("UPDATE generated_image_scans SET status='failed',error=$3,token=NULL WHERE id=$1 AND token=$2", [claim.id, token, error instanceof Error ? error.message : String(error)]);
    });
  }
  return true;
}

let worker: Promise<void> | undefined;
let requested = false;
let leaseWake: ReturnType<typeof setTimeout> | undefined;
export function kickGeneratedImageWorker() {
  if (process.env.FLUXPOST_DISABLE_BACKGROUND_WORKERS === "1" || process.env.NEXT_PHASE === "phase-production-build") return;
  requested = true;
  if (worker) return;
  if (leaseWake) { clearTimeout(leaseWake); leaseWake = undefined; }
  worker = (async () => {
    do {
      requested = false;
      const { replayGeneratedImageReceipts } = await import("./generated-image-capture");
      while (await replayGeneratedImageReceipts()) await new Promise<void>((resolve) => setImmediate(resolve));
      while (await runGeneratedBackfillPage()) await new Promise<void>((resolve) => setImmediate(resolve));
      while (await indexNextGeneratedImage()) await new Promise<void>((resolve) => setImmediate(resolve));
    } while (requested);
    const leases = await withLibraryColorDatabase(function* (sql) {
      return yield* sql<{ deadline: string; grace: number }>(`SELECT lease_until deadline,0 grace FROM generated_image_scans WHERE status='running'
        UNION ALL SELECT updated_at deadline,300000 grace FROM generated_image_results WHERE status='indexing'`);
    });
    if (leases.length) {
      // One wake at lease expiry, not a polling loop. Recovered rows are claim-fenced.
      const delay = Math.max(1000, Math.min(...leases.map((lease) => Date.parse(lease.deadline) + Number(lease.grace) - Date.now())));
      leaseWake = setTimeout(() => { leaseWake = undefined; kickGeneratedImageWorker(); }, delay);
      leaseWake.unref();
    }
  })().catch((error) => console.error("Generated image indexing worker failed:", error)).finally(() => { worker = undefined; });
}
