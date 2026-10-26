import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { withLibraryColorDatabase, type LibraryColorSql } from "./database";
import { extractPostGeneratedImages, generatedImageIdentity, generatedImageSourceIdentity, type GeneratedImageEvidence } from "./generated-image-evidence";
import { readGeneratedImage } from "./generated-image-media";
import { emptyLibraryTagProfile } from "./library-tags";
import type { GeneratedPost, LibraryAsset } from "./types";
import type { CanvasNodeRun, CanvasRun } from "./canvas/types";
import { isWorkspaceAdmin, type WorkspaceAccessActor } from "./workspace-ownership";

export const generatedAssetId = (image: GeneratedImageEvidence) => `generated-${generatedImageIdentity(image.ownerUserId, image.url)}`;
export function parseEvidence(value: unknown): GeneratedImageEvidence {
  return (typeof value === "string" ? JSON.parse(value) : value) as GeneratedImageEvidence;
}

export function* writeGeneratedReceipt(sql: LibraryColorSql, image: GeneratedImageEvidence, postgres = false) {
  const id = generatedAssetId(image);
  const now = new Date().toISOString();
  const rows = yield* sql(`INSERT INTO generated_image_results(id,owner_user_id,original_url,status,evidence_json,created_at,updated_at)
    VALUES($1,$2,$3,'queued',$4,$5,$5) ON CONFLICT DO NOTHING RETURNING id`,
  [id, image.ownerUserId || "", image.url, JSON.stringify(image), now]);
  yield* sql(`INSERT INTO generated_image_sources(id,asset_id,entry,task_id,source_kind,source_id,data_json)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
  [generatedImageSourceIdentity(image), id, image.entry, image.taskId, image.sourceKind, image.sourceId, JSON.stringify(image)]);
  if (image.vehicleModels.length) {
    const assets = yield* sql<{ data_json: unknown }>(`SELECT data_json FROM library_assets WHERE id=$1 AND deleted_at IS NULL${postgres ? " FOR UPDATE" : ""}`, [id]);
    if (assets.length) {
      const asset = (typeof assets[0].data_json === "string" ? JSON.parse(assets[0].data_json) : assets[0].data_json) as LibraryAsset;
      if (!Object.hasOwn(asset.manualOverrides, "vehicleModels")) {
        const vehicles = [...new Set([...asset.aiTags.vehicleModels, ...image.vehicleModels])];
        asset.aiTags.vehicleModels = vehicles; asset.effectiveTags.vehicleModels = vehicles;
        yield* sql(`UPDATE library_assets SET data_json=$2${postgres ? "::jsonb" : ""} WHERE id=$1`, [id, JSON.stringify(asset)]);
        for (const vehicle of vehicles) for (const dimension of ["vehicleModels", "unified"]) yield* sql(`INSERT INTO library_asset_labels(asset_id,dimension,value,source,updated_at)
          VALUES($1,$2,$3,'user',$4) ON CONFLICT DO NOTHING`, [id, dimension, vehicle, now]);
      }
    }
  }
  return rows.length ? "queued" as const : "duplicate" as const;
}

export function recordGeneratedImage(image: GeneratedImageEvidence) {
  return withLibraryColorDatabase((sql, postgres) => writeGeneratedReceipt(sql, image, postgres), true);
}

export async function linkGeneratedPostImages(post: GeneratedPost) {
  const known = await withLibraryColorDatabase(function* (sql) {
    if (!post.imageUrls.length) return [];
    const rows = yield* sql<{ evidence_json: string }>(`SELECT evidence_json FROM generated_image_results WHERE owner_user_id=$1
      AND original_url IN (${post.imageUrls.map((_, index) => `$${index + 2}`).join(",")})`, [post.ownerUserId || "", ...post.imageUrls]);
    return rows.map((row) => parseEvidence(row.evidence_json));
  });
  for (const image of extractPostGeneratedImages(post, known).images) await recordGeneratedImage(image);
}

export async function linkReusedCanvasImages(run: CanvasRun, node: CanvasNodeRun) {
  if (node.status !== "reused" || !node.reusedFrom) return;
  const urls = [...new Set(Object.values(node.outputs).flatMap((artifact) => artifact.kind === "images" ? artifact.items.map((item) => item.url) : []))];
  if (!urls.length) return;
  const images = await withLibraryColorDatabase(function* (sql) {
    const rows = yield* sql<{ evidence_json: string }>(`SELECT evidence_json FROM generated_image_results WHERE owner_user_id=$1
      AND original_url IN (${urls.map((_, index) => `$${index + 2}`).join(",")})`, [run.ownerUserId, ...urls]);
    return rows.map((row) => parseEvidence(row.evidence_json));
  });
  for (const image of images) await recordGeneratedImage({ ...image, sourceKind: "canvas-node", sourceId: node.id, taskId: run.id, outputId: image.url, timeBasis: "corroborated" });
}

export async function indexNextGeneratedImage(loadImage = readGeneratedImage) {
  const token = randomUUID();
  const now = new Date().toISOString();
  const claim = await withLibraryColorDatabase(function* (sql, postgres) {
    const rows = yield* sql<{ id: string; evidence_json: string }>(`SELECT id,evidence_json FROM generated_image_results
      WHERE status='queued' OR (status='indexing' AND updated_at<$1) ORDER BY id LIMIT 1${postgres ? " FOR UPDATE SKIP LOCKED" : ""}`,
    [new Date(Date.now() - 300_000).toISOString()]);
    if (!rows.length) return undefined;
    yield* sql("UPDATE generated_image_results SET status='indexing',token=$2,updated_at=$3 WHERE id=$1", [rows[0].id, token, now]);
    return rows[0];
  }, true);
  if (!claim) return false;
  try {
    const image = parseEvidence(claim.evidence_json);
    image.vehicleModels = [...new Set((await listGeneratedSources(claim.id)).flatMap((source) => source.vehicleModels))];
    const bytes = await loadImage(image.url);
    const metadata = await sharp(bytes, { limitInputPixels: 80_000_000 }).metadata();
    if (!metadata.format || !metadata.width || !metadata.height) throw new Error("Generated result is not a decodable image.");
    const tags = { ...emptyLibraryTagProfile(), vehicleModels: image.vehicleModels };
    const asset: LibraryAsset = {
      id: claim.id, ownerUserId: image.ownerUserId || "", ownerDisplayName: image.ownerDisplayName || "",
      name: image.originalName, originalName: image.originalName, objectKey: `generated-index/${claim.id}`, publicUrl: image.url,
      mimeType: `image/${metadata.format === "jpg" ? "jpeg" : metadata.format}`, extension: `.${metadata.format}`,
      byteSize: bytes.length, width: metadata.width, height: metadata.height,
      // Generated originals are URL identities, unlike upload content deduplication.
      // Namespace their cache fingerprint so an uploaded copy cannot acquire removal semantics.
      sha256: createHash("sha256").update(image.url).update("\0").update(bytes).digest("hex"), collectionIds: [], visibility: "private",
      aiTags: tags, effectiveTags: tags, manualOverrides: {}, taggingStatus: "idle", cleanupStatus: "ready",
      createdAt: image.generatedAt, updatedAt: now,
      generated: { entry: image.entry, taskId: image.taskId, generatedAt: image.generatedAt, timeBasis: image.timeBasis },
    };
    await withLibraryColorDatabase(function* (sql, postgres) {
      const active = yield* sql(`SELECT id FROM generated_image_results WHERE id=$1 AND token=$2 AND status='indexing'${postgres ? " FOR UPDATE" : ""}`, [claim.id, token]);
      if (!active.length) return;
      const inserted = yield* sql(`INSERT INTO library_assets(id,owner_user_id,name,original_name,note,visibility,mime_type,width,height,byte_size,
        sha256,object_key,public_url,tagging_status,cleanup_status,created_at,updated_at,data_json)
        VALUES($1,$2,$3,$3,'','private',$4,$5,$6,$7,$8,$13,$9,'idle','ready',$10,$11,$12${postgres ? "::jsonb" : ""})
        ON CONFLICT(id) DO NOTHING RETURNING id`, [asset.id, asset.ownerUserId, asset.name, asset.mimeType, asset.width, asset.height,
        asset.byteSize, asset.sha256, asset.publicUrl, asset.createdAt, asset.updatedAt, JSON.stringify(asset), asset.objectKey]);
      if (inserted.length) for (const vehicle of new Set(image.vehicleModels)) {
        for (const dimension of ["vehicleModels", "unified"]) yield* sql(`INSERT INTO library_asset_labels(asset_id,dimension,value,source,updated_at)
          VALUES($1,$2,$3,'user',$4) ON CONFLICT DO NOTHING`, [asset.id, dimension, vehicle, now]);
      }
      yield* sql("UPDATE generated_image_results SET status='indexed',error=NULL,token=NULL,updated_at=$3 WHERE id=$1 AND token=$2", [claim.id, token, now]);
    }, true);
  } catch (error) {
    await withLibraryColorDatabase(function* (sql) {
      yield* sql("UPDATE generated_image_results SET status='failed',error=$3,token=NULL,updated_at=$4 WHERE id=$1 AND token=$2 AND status='indexing'",
        [claim.id, token, error instanceof Error ? error.message : String(error), new Date().toISOString()]);
    });
  }
  return true;
}

export function excludeGeneratedImage(asset: LibraryAsset) {
  const now = new Date().toISOString();
  return withLibraryColorDatabase(function* (sql, postgres) {
    yield* sql("UPDATE generated_image_results SET status='excluded',token=NULL,updated_at=$2 WHERE id=$1", [asset.id, now]);
    yield* sql(`UPDATE library_assets SET deleted_at=$2,updated_at=$2,data_json=$3${postgres ? "::jsonb" : ""} WHERE id=$1`,
      [asset.id, now, JSON.stringify({ ...asset, deletedAt: now, updatedAt: now })]);
  }, true);
}

export function listGeneratedSources(assetId: string) {
  return withLibraryColorDatabase(function* (sql) {
    const rows = yield* sql<{ data_json: string }>("SELECT data_json FROM generated_image_sources WHERE asset_id=$1 ORDER BY id", [assetId]);
    return rows.map((row) => parseEvidence(row.data_json));
  });
}

export function generatedImageCoverage(actor: WorkspaceAccessActor) {
  return withLibraryColorDatabase(function* (sql) {
    const rows = yield* sql<{ status: string; count: string | number }>(`SELECT status,COUNT(*) count FROM generated_image_results
      WHERE ($1=1 OR owner_user_id=$2) GROUP BY status`, [isWorkspaceAdmin(actor) ? 1 : 0, actor.id]);
    const failures = yield* sql<{ id: string; error: string }>(`SELECT id,error FROM generated_image_results WHERE status='failed'
      AND ($1=1 OR owner_user_id=$2) ORDER BY id LIMIT 20`, [isWorkspaceAdmin(actor) ? 1 : 0, actor.id]);
    const scans = yield* sql("SELECT status,phase,uncertain,duplicates,error FROM generated_image_scans WHERE id=$1", [scanId(actor)]);
    return { counts: Object.fromEntries(rows.map((row) => [row.status, Number(row.count)])), failures, scan: scans[0] || null };
  });
}

export const scanId = (actor: WorkspaceAccessActor) => `${isWorkspaceAdmin(actor) ? "admin" : "member"}:${actor.id}`;

export function retryGeneratedImages(actor: WorkspaceAccessActor) {
  return withLibraryColorDatabase(function* (sql) {
    yield* sql("UPDATE generated_image_results SET status='queued',error=NULL WHERE status='failed' AND ($1=1 OR owner_user_id=$2)", [isWorkspaceAdmin(actor) ? 1 : 0, actor.id]);
    yield* sql("UPDATE generated_image_scans SET status='queued',error=NULL WHERE id=$1 AND status='failed'", [scanId(actor)]);
  }, true);
}
