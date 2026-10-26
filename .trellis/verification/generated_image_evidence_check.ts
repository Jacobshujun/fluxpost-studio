import assert from "node:assert/strict";
import {
  extractCanvasGeneratedImages, extractOriginalCardImages, extractPostGeneratedImages,
  extractQueueGeneratedImages, generatedImageIdentity, generatedImageSourceIdentity,
} from "../../src/lib/generated-image-evidence";
import type { GeneratedPost, ImageGenerationQueueJob, OriginalBatchItem, XhsCard } from "../../src/lib/types";
import type { CanvasRun } from "../../src/lib/canvas/types";

const now = "2026-10-26T08:00:00.000Z";
const output = "/generated/model-output.png";
const reference = "/generated/image-inputs/reference.png";
const owner = { ownerUserId: "owner-a", ownerDisplayName: "Owner A" };
const run: Pick<CanvasRun, "id" | "ownerUserId" | "ownerDisplayName" | "graphSnapshot"> = {
  id: "run-a", ...owner,
  graphSnapshot: { nodes: [{ id: "graph-node-a", type: "model.gpt-image", version: 2, position: { x: 0, y: 0 }, config: {} }], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
};
const node: Parameters<typeof extractCanvasGeneratedImages>[1] = {
  id: "node-attempt-a", nodeId: "graph-node-a", runId: run.id, nodeType: "model.gpt-image", status: "completed",
  inputs: { reference: [{ kind: "images", items: [{ url: reference }] }] },
  outputs: { images: { kind: "images", items: [{ url: output, name: "Display label, not filename" }] } },
  updatedAt: now, completedAt: now,
};

for (const nodeType of ["model.gpt-image", "model.qwen-image", "model.gemini", "model.gpt-image-each"] as const) {
  const result = extractCanvasGeneratedImages(run, { ...node, nodeType });
  assert.equal(result.images.length, 1);
  assert.equal(result.images[0].originalName, "model-output.png");
  assert.equal(result.images[0].ownerUserId, owner.ownerUserId);
  assert.deepEqual(result.images[0].vehicleModels, []);
}
for (const nodeType of ["input.images", "input.library-images", "utility.image-preview", "utility.save-images", "model.gpt-text"] as const) {
  assert.equal(extractCanvasGeneratedImages(run, { ...node, nodeType }).images.length, 0);
}
for (const status of ["bypassed", "disabled", "blocked", "reused", "queued", "needs_config"] as const) {
  assert.equal(extractCanvasGeneratedImages(run, { ...node, status }).images.length, 0);
}
assert.throws(() => extractCanvasGeneratedImages({ ...run, id: "another-run" }, node), /do not match/);
assert.equal(extractCanvasGeneratedImages(run, { ...node, reusedFrom: { runId: "old", nodeRunId: "old-node", workflowRevision: 1 } }).images.length, 0);
const direct = extractCanvasGeneratedImages(run, {
  ...node, outputs: { images: { kind: "images", items: [{ url: reference }] } },
});
assert.equal(direct.images.length, 0);
assert.equal(direct.uncertain, 1);
const legacyRun = { ...run, graphSnapshot: { ...run.graphSnapshot, nodes: run.graphSnapshot.nodes.map((item) => ({ ...item, version: 1 as const })) } };
const convertedFallback = extractCanvasGeneratedImages(legacyRun, {
  ...node, outputs: { images: { kind: "images", items: [{ url: "/generated/converted-source.jpg" }] } },
});
assert.equal(convertedFallback.images.length, 0, "Legacy fallback may produce a different URL from its input; URL inequality is not generation evidence");
assert.equal(convertedFallback.uncertain, 1);
assert.equal(extractCanvasGeneratedImages(run, { ...node, status: "failed" }).images.length, 1);
const partial = extractCanvasGeneratedImages(run, {
  ...node, status: "failed", outputs: {}, completedAt: undefined,
  internalMetadata: { imageEach: {
    schemaVersion: 1, inputFingerprint: "fixture", status: "partial", total: 2,
    succeeded: 1, failed: 1, failedIndices: [1], pending: 0, concurrency: 1,
    children: [
      { id: "a", index: 0, source: { url: reference }, fingerprint: "a", status: "completed", attempt: 1, outputUrl: output, updatedAt: now },
      { id: "b", index: 1, source: { url: reference }, fingerprint: "b", status: "failed", attempt: 1, updatedAt: now },
    ],
  } },
});
assert.equal(partial.images.length, 1);
assert.equal(partial.images[0].outputId, "child:a");
assert.equal(partial.images[0].timeBasis, "source-updated");

const job: ImageGenerationQueueJob = {
  id: "queue-a", provider: "comfyui_klein", status: "failed", priority: 0,
  attempts: 1, maxAttempts: 1, runAfter: now, createdAt: now, updatedAt: now,
  prompt: "A vehicle name in a prompt is NOT structured vehicle metadata",
  referenceImage: reference, outputUrls: [output, output, reference],
};
const queue = extractQueueGeneratedImages(job);
assert.equal(queue.images.length, 1);
assert.equal(queue.uncertain, 1);
assert.equal(queue.images[0].ownerUserId, undefined);
assert.equal(queue.images[0].entry, "unknown");
assert.deepEqual(queue.images[0].vehicleModels, []);
assert.equal(extractQueueGeneratedImages({ ...job, sourceRunId: "simple-a" }).images[0].entry, "simple");

const card: XhsCard = {
  id: "card-a", index: 0, role: "cover", layout: "sparse", title: "Title", points: [],
  visualConcept: "Concept", prompt: "Prompt", candidateUrls: [output], imageUrl: output,
  status: "failed", qa: { status: "failed", attempts: 1, issues: ["QA failed after save"] },
};
const series: NonNullable<GeneratedPost["xhsSeries"]> = {
  schemaVersion: 1, source: { name: "baoyu-xhs-images", version: "2.0.1", commit: "6b7a2e417500561a5ecdd0b168332f4142584617" },
  strategy: "a", style: "minimal", defaultLayout: "sparse", effectiveRatio: "3:4", cards: [card],
};
const item: OriginalBatchItem = {
  id: "item-a", batchId: "batch-a", ...owner, status: "failed", input: { topic: "Topic", vehicleKeyword: "Explicit vehicle" },
  series, createdAt: now, updatedAt: now,
};
const cards = extractOriginalCardImages(item);
assert.equal(cards.images.length, 1);
assert.deepEqual(cards.images[0].vehicleModels, ["Explicit vehicle"]);
assert.equal(extractOriginalCardImages({ ...item, series: { ...series, cards: [{ ...card, candidateUrls: [] }] } }).images.length, 0);

const post: GeneratedPost = {
  id: "post-a", ...owner, sourceItemId: "source-a", title: "Title", body: "Body",
  platform: "xiaohongshu", imagePrompt: "Prompt", imageUrls: [output, reference],
  materialPaths: [], status: "draft", aiNotes: [], updatedAt: now,
};
assert.equal(extractPostGeneratedImages(post).uncertain, 2);
assert.equal(extractPostGeneratedImages(post).images.length, 0);
assert.equal(extractPostGeneratedImages(post, cards.images).images.length, 1);
assert.equal(extractPostGeneratedImages({ ...post, ownerUserId: "other" }, cards.images).images.length, 0);
assert.equal(extractPostGeneratedImages({ ...post, xhsSeries: series }).images.length, 1);
assert.equal(extractPostGeneratedImages({ ...post, xhsSeries: series }).uncertain, 1);
const unprovenSeries = { ...series, cards: [{ ...card, candidateUrls: [] }] };
assert.equal(extractPostGeneratedImages({ ...post, imageUrls: [output], xhsSeries: unprovenSeries }).uncertain, 1,
  "The same uncertain selected image and post reference must not be counted twice");
const cloud = extractQueueGeneratedImages({ ...job, ...owner, outputUrls: ["https://stored.invalid/path/result.png?version=1"] });
assert.equal(cloud.images[0].url, "https://stored.invalid/path/result.png?version=1");
assert.equal(cloud.images[0].originalName, "result.png");

assert.equal(generatedImageIdentity(undefined, output), generatedImageIdentity("", output));
assert.notEqual(generatedImageIdentity(owner.ownerUserId, output), generatedImageIdentity("other", output));
assert.notEqual(generatedImageIdentity(owner.ownerUserId, `${output}?version=1`), generatedImageIdentity(owner.ownerUserId, `${output}?version=2`));
assert.throws(() => generatedImageIdentity(owner.ownerUserId, ""));
assert.throws(() => generatedImageIdentity(owner.ownerUserId, ` ${output}`));
assert.equal(generatedImageSourceIdentity(cards.images[0]), generatedImageSourceIdentity({ ...cards.images[0] }));
assert.notEqual(generatedImageSourceIdentity(cards.images[0]), generatedImageSourceIdentity({ ...cards.images[0], sourceId: "other-task" }));
assert.throws(() => extractCanvasGeneratedImages(run, { ...node, completedAt: "invalid" }), /timestamp/);
assert.throws(() => extractQueueGeneratedImages({ ...job, outputUrls: ["https://managed.invalid/"] }), /filename/);
console.log("Generated-image evidence checks passed (isolated, no database, filesystem media or providers).");
