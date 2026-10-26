import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { GeneratedImageEvidence } from "../../src/lib/generated-image-evidence";
import type { GeneratedPost, ImageGenerationQueueJob, OriginalBatchItem, XhsCardSeries } from "../../src/lib/types";
import type { CanvasNodeRun, CanvasRun } from "../../src/lib/canvas/types";

async function main() {
  const fixture = process.env.FLUXPOST_GENERATED_FIXTURE;
  assert(fixture, "Isolated fixture required"); process.chdir(fixture);
  const store = await import("../../src/lib/generated-image-store");
  const library = await import("../../src/lib/library-assets");
  const db = await import("../../src/lib/database");
  const backfill = await import("../../src/lib/generated-image-backfill");
  const media = await import("../../src/lib/generated-image-media");
  const capture = await import("../../src/lib/generated-image-capture");
  const thumbnails = await import("../../src/lib/library-thumbnails");
  const owner = { id: "owner-a", displayName: "Owner A", role: "member" as const };
  const other = { id: "owner-b", displayName: "Owner B", role: "member" as const };
  const admin = { id: "admin", displayName: "Admin", role: "admin" as const };
  const bytes = await sharp({ create: { width: 4, height: 3, channels: 3, background: "red" } }).png().toBuffer();
  await mkdir(path.join(fixture, "public/generated"), { recursive: true });
  await writeFile(path.join(fixture, "public/generated/car_a.png"), bytes);
  const now = "2026-10-26T08:00:00.000Z";
  const evidence: GeneratedImageEvidence = { ownerUserId: owner.id, ownerDisplayName: owner.displayName, entry: "canvas", sourceKind: "output-receipt",
    sourceId: "run:node", taskId: "run", outputId: "one", url: "/generated/car_a.png", originalName: "car_a.png", generatedAt: now, timeBasis: "saved", vehicleModels: ["Car A"] };
  assert.equal(await store.recordGeneratedImage(evidence), "queued");
  assert.equal(await store.recordGeneratedImage(evidence), "duplicate");
  await store.recordGeneratedImage({ ...evidence, sourceId: "second-task", taskId: "second" });
  assert(await store.indexNextGeneratedImage()); assert.equal(await store.indexNextGeneratedImage(), false);
  const id = store.generatedAssetId(evidence);
  assert.equal((await store.listGeneratedSources(id)).length, 2);
  assert.equal((await library.listLibraryAssets(owner, { generated: true, filename: "car_a", vehicleModels: ["Car A"] })).total, 1);
  assert.equal((await library.listLibraryAssets(owner, { filename: "car%" })).total, 0);
  assert.equal((await library.listLibraryAssets(other)).total, 0);
  assert.equal((await library.listLibraryAssets(owner, { unlabelledVehicle: true })).total, 0);
  const folder = await library.createLibrarySmartFolder(owner, { name: "generated-cars", visibility: "private", match: "all", conditions: [
    { id: "1", field: "generated", operator: "is", value: true },
    { id: "2", field: "filename", operator: "contains", value: "car_a" },
    { id: "3", field: "vehicleModel", operator: "equals", value: "Car A" },
    { id: "4", field: "generationEntry", operator: "equals", value: "canvas" },
    { id: "5", field: "generatedAt", operator: "after", value: now },
  ] });
  assert.equal((await library.listLibraryAssets(owner, { smartFolderId: folder.id })).total, 1);
  await assert.rejects(library.listLibraryAssets(other, { smartFolderId: folder.id }));
  await library.patchLibraryAsset(owner, id, { manualOverrides: { vehicleModels: ["Manual"] } });
  await store.recordGeneratedImage({ ...evidence, vehicleModels: ["Do not overwrite"], sourceId: "third" });
  assert.deepEqual((await library.getLibraryAsset(owner, id)).effectiveTags.vehicleModels, ["Manual"]);
  assert.equal((await library.listLibraryAssets(owner, { smartFolderId: folder.id })).total, 0);
  await library.patchLibraryAsset(owner, id, { manualOverrides: { vehicleModels: [] } }); await store.recordGeneratedImage(evidence);
  assert.equal((await library.listLibraryAssets(owner, { unlabelledVehicle: true })).total, 1);
  assert((await thumbnails.getLibraryThumbnail(await library.getLibraryAsset(owner, id))).bytes.length > 0);
  assert.deepEqual(await media.readGeneratedLocalImage(evidence.url), bytes);
  for (const url of ["/generated/%2e%2e/secret.png", "C:/secret.png", "/generated/missing.png"]) await assert.rejects(media.readGeneratedLocalImage(url));
  await assert.rejects(media.readGeneratedImage("https://unmanaged.invalid/a.png"));
  const legacy = { ...evidence, ownerUserId: undefined, ownerDisplayName: undefined };
  await store.recordGeneratedImage(legacy); await store.indexNextGeneratedImage();
  await library.patchLibraryAsset(admin, store.generatedAssetId(legacy), { visibility: "team" });
  assert.equal((await library.listLibraryAssets(other)).total, 0, "Unowned shared images remain admin-only");
  assert.equal((await library.listLibraryAssets(admin)).total, 2);
  await assert.rejects(library.getLibraryAsset(other, store.generatedAssetId(legacy)));
  const cloud = { ...evidence, url: "https://stored.invalid/car_b.png?version=1", originalName: "car_b.png", sourceId: "cloud" };
  await store.recordGeneratedImage(cloud); await store.indexNextGeneratedImage(async () => bytes);
  assert.equal((await library.getLibraryAsset(owner, store.generatedAssetId(cloud))).publicUrl, cloud.url);
  await store.recordGeneratedImage({ ...evidence, url: "/generated/missing.png", sourceId: "missing" }); await store.indexNextGeneratedImage();
  assert.equal((await store.generatedImageCoverage(owner)).counts.failed, 1);
  await store.retryGeneratedImages(other); assert.equal((await store.generatedImageCoverage(owner)).counts.failed, 1);
  await store.retryGeneratedImages(owner); await store.indexNextGeneratedImage(async () => bytes);
  await db.withLibraryColorDatabase(function* (sql) {
    yield* sql("UPDATE generated_image_results SET status='indexing',token='interrupted',updated_at='2000-01-01T00:00:00.000Z' WHERE id=$1", [store.generatedAssetId(cloud)]);
  });
  assert(await store.indexNextGeneratedImage(async () => bytes), "Expired index lease must resume without a provider");
  assert.equal((await library.listLibraryAssets(owner, { filename: "car_b" })).total, 1);
  const page = await library.listLibraryAssets(owner, { generated: true, limit: 1 });
  const page2 = await library.listLibraryAssets(owner, { generated: true, limit: 1, cursor: page.nextCursor });
  assert.notEqual(page.assets[0].id, page2.assets[0].id);
  await assert.rejects(library.listLibraryAssets(owner, { generated: true, filename: "changed", cursor: page.nextCursor }));
  const stale = await library.getLibraryAsset(owner, id);
  await library.permanentlyDeleteLibraryAsset(owner, id); await store.recordGeneratedImage({ ...evidence, sourceId: "after-removal" });
  await db.saveLibraryAssetToDb(stale);
  assert.equal(await store.indexNextGeneratedImage(), false); await assert.rejects(library.getLibraryAsset(owner, id));
  assert.deepEqual(await readFile(path.join(fixture, "public/generated/car_a.png")), bytes);
  assert.equal((await store.generatedImageCoverage(owner)).counts.excluded, 1);
  assert(!(await library.listLibraryAssets(owner, { filename: "car_a" })).assets.some((asset) => asset.id === id), "A stale metadata write cannot undo an exclusion");
  for (let i = 0; i < 65; i++) {
    const job: ImageGenerationQueueJob = { id: `job-${String(i).padStart(3, "0")}`, provider: "comfyui_klein", status: "failed", priority: 0, attempts: 1, maxAttempts: 1,
      runAfter: now, createdAt: now, updatedAt: now, ownerUserId: owner.id, prompt: "not vehicle evidence", referenceImage: "/generated/input.png", outputUrls: [evidence.url, "/generated/input.png"] };
    await db.saveImageGenerationQueueJobToDb(job);
  }
  await backfill.startGeneratedBackfill(owner);
  assert(await backfill.runGeneratedBackfillPage());
  assert(await backfill.runGeneratedBackfillPage());
  const progress = await db.withLibraryColorDatabase(function* (sql) { return yield* sql("SELECT cursor,phase FROM generated_image_scans WHERE id=$1", [store.scanId(owner)]); });
  assert.equal(progress[0].cursor, "job-029");
  while (await backfill.runGeneratedBackfillPage()) { /* resume persisted cursor */ }
  assert.equal((await store.generatedImageCoverage(owner)).scan?.uncertain, 65);
  assert.equal((await store.generatedImageCoverage(owner)).scan?.duplicates, 65);
  assert.equal(await store.indexNextGeneratedImage(), false);
  await backfill.startGeneratedBackfill(owner, true);
  while (await backfill.runGeneratedBackfillPage()) { /* repeat scan */ }
  assert.equal((await store.listGeneratedSources(id)).length, 69);
  assert.equal((await db.getImageGenerationQueueJobFromDb("job-000"))?.status, "failed");
  await assert.rejects(capture.withGeneratedImageContext({ ownerUserId: other.id, entry: "simple", taskId: "partial", sourceId: "partial" }, async () => {
    await capture.captureGeneratedImage(evidence.url); throw new Error("A later image failed");
  }));
  await store.indexNextGeneratedImage();
  assert.equal((await library.listLibraryAssets(other, { generationEntry: "simple" })).total, 1);
  const before = (await library.listLibraryAssets(owner)).total;
  await capture.captureGeneratedImage(evidence.url);
  assert.equal((await library.listLibraryAssets(owner)).total, before, "No task context means no enrollment");
  await writeFile(path.join(fixture, "public/generated/deferred.png"), bytes);
  await db.withLibraryColorDatabase(function* (sql, postgres) {
    if (postgres) yield* sql("ALTER TABLE generated_image_results ADD CONSTRAINT fixture_capture_failure CHECK (original_url <> '/generated/deferred.png')");
    else yield* sql("CREATE TRIGGER fixture_capture_failure BEFORE INSERT ON generated_image_results WHEN NEW.original_url='/generated/deferred.png' BEGIN SELECT RAISE(ABORT,'fixture enrollment failure'); END");
  });
  const originalConsoleError = console.error;
  console.error = () => undefined;
  try {
    assert.equal(await capture.withGeneratedImageContext({ ownerUserId: owner.id, entry: "images", taskId: "retry-without-model", sourceId: "retry" },
      () => capture.captureGeneratedImage("/generated/deferred.png")), "/generated/deferred.png");
  } finally { console.error = originalConsoleError; }
  assert.equal(capture.generatedCaptureFailures(owner).length, 1);
  assert.equal(capture.generatedCaptureFailures(other).length, 0);
  await db.withLibraryColorDatabase(function* (sql, postgres) {
    yield* sql(postgres ? "ALTER TABLE generated_image_results DROP CONSTRAINT fixture_capture_failure" : "DROP TRIGGER fixture_capture_failure");
  });
  await capture.replayGeneratedImageReceipts();
  assert.equal(capture.generatedCaptureFailures(owner).length, 0);
  await store.indexNextGeneratedImage();
  assert.equal((await library.listLibraryAssets(owner, { generationEntry: "images" })).total, 1);
  for (const filename of ["history-canvas.png", "history-card.png"]) await writeFile(path.join(fixture, "public/generated", filename), bytes);
  const run: CanvasRun = { id: "history-run", workflowId: "history-workflow", workflowRevision: 1, ownerUserId: other.id, ownerDisplayName: other.displayName,
    status: "failed", graphSnapshot: { nodes: [{ id: "image", type: "model.gpt-image", version: 2, config: {}, position: { x: 0, y: 0 } }], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
    confirmation: { confirmedAt: now, nodeIds: ["image"], capabilities: ["image_model"] }, createdAt: now, updatedAt: now };
  await db.saveCanvasRunToDb(run);
  const node: CanvasNodeRun = { id: "history-node", runId: run.id, nodeId: "image", nodeType: "model.gpt-image", attempt: 1, status: "failed",
    inputs: { references: [{ kind: "images", items: [{ url: "/generated/input.png" }] }] }, outputs: { images: { kind: "images", items: [{ url: "/generated/history-canvas.png" }] } }, createdAt: now, updatedAt: now };
  await db.saveCanvasNodeRunToDb(node);
  await db.saveCanvasNodeRunToDb({ ...node, id: "history-reuse", attempt: 2, status: "reused", reusedFrom: { runId: run.id, nodeRunId: node.id, workflowRevision: 1 } });
  const series: XhsCardSeries = { schemaVersion: 1, source: { name: "baoyu-xhs-images", version: "2.0.1", commit: "6b7a2e417500561a5ecdd0b168332f4142584617" },
    strategy: "a", style: "minimal", defaultLayout: "sparse", effectiveRatio: "3:4", cards: [{ id: "card", index: 0, role: "cover", layout: "sparse", title: "Card", points: [], visualConcept: "Concept", prompt: "not vehicle metadata",
      candidateUrls: ["/generated/history-card.png"], imageUrl: "/generated/history-card.png", status: "failed", qa: { status: "failed", attempts: 1, issues: [] } }] };
  const item: OriginalBatchItem = { id: "history-item", batchId: "history-batch", ownerUserId: other.id, ownerDisplayName: other.displayName, ordinal: 0,
    status: "failed", input: { topic: "Topic", vehicleKeyword: "Structured Model" }, series, createdAt: now, updatedAt: now };
  await db.saveOriginalBatchItemToDb(item);
  const post: GeneratedPost = { id: "history-post", ownerUserId: other.id, ownerDisplayName: other.displayName, sourceItemId: "source", sourceBatchId: item.batchId,
    title: "Post", body: "Body", platform: "xiaohongshu", imagePrompt: "Prompt", imageUrls: ["/generated/history-canvas.png", "/generated/history-card.png", "/generated/input.png"],
    xhsSeries: series, materialPaths: [], status: "draft", aiNotes: [], updatedAt: now };
  await db.saveGeneratedPostToDb(post);
  await backfill.startGeneratedBackfill(other);
  while (await backfill.runGeneratedBackfillPage()) { /* every durable source adapter */ }
  while (await store.indexNextGeneratedImage()) { /* bounded indexing, no providers */ }
  assert.equal((await library.listLibraryAssets(other, { generationEntry: "canvas", filename: "history-canvas" })).total, 1);
  assert.equal((await library.listLibraryAssets(other, { vehicleModels: ["Structured Model"] })).total, 1);
  assert.equal((await library.listLibraryAssets(other, { filename: "input" })).total, 0);
  const historyAsset = (await library.listLibraryAssets(other, { filename: "history-canvas" })).assets[0];
  const historySources = await store.listGeneratedSources(historyAsset.id);
  assert(historySources.some((source) => source.sourceId === "history-reuse"));
  assert(historySources.some((source) => source.sourceId === "history-post"));
  console.log("Generated library runtime passed.");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
