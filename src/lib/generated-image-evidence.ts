import { createHash } from "node:crypto";
import type { CanvasNodeRun, CanvasRun } from "./canvas/types";
import type { GeneratedPost, ImageGenerationQueueJob, OriginalBatchItem, XhsCardSeries } from "./types";

export type GeneratedImageEntry = "canvas" | "batch" | "simple" | "images" | "unknown";
export type GeneratedImageSourceKind = "canvas-node" | "image-queue" | "original-card" | "post" | "output-receipt";

export type GeneratedImageEvidence = {
  ownerUserId?: string;
  ownerDisplayName?: string;
  entry: GeneratedImageEntry;
  sourceKind: GeneratedImageSourceKind;
  sourceId: string;
  taskId: string;
  outputId: string;
  url: string;
  originalName: string;
  generatedAt: string;
  timeBasis: "source-completed" | "source-updated" | "corroborated" | "saved";
  vehicleModels: string[];
};

export type GeneratedImageEvidenceResult = {
  images: GeneratedImageEvidence[];
  uncertain: number;
};

const imageModelNodes = new Set<CanvasNodeRun["nodeType"]>([
  "model.gpt-image", "model.gpt-image-each", "model.qwen-image", "model.gemini",
]);

// Identity describes a persisted original, not its content: downloading/rehosting
// to compute cross-provider equivalence is deliberately outside this contract.
export function generatedImageIdentity(ownerUserId: string | undefined, url: string) {
  if (!url || url !== url.trim()) throw new Error("A persisted original URL is required.");
  return createHash("sha256").update(JSON.stringify([ownerUserId || null, url])).digest("hex");
}

export function generatedImageSourceIdentity(image: GeneratedImageEvidence) {
  return createHash("sha256").update(JSON.stringify([
    generatedImageIdentity(image.ownerUserId, image.url), image.sourceKind,
    image.sourceId, image.outputId,
  ])).digest("hex");
}

export function extractCanvasGeneratedImages(
  run: Pick<CanvasRun, "id" | "ownerUserId" | "ownerDisplayName" | "graphSnapshot">,
  node: Pick<CanvasNodeRun, "id" | "nodeId" | "runId" | "nodeType" | "status" | "reusedFrom" | "inputs" | "outputs" | "internalMetadata" | "completedAt" | "updatedAt">,
): GeneratedImageEvidenceResult {
  if (node.runId !== run.id) throw new Error("Canvas node and parent run do not match.");
  if (!imageModelNodes.has(node.nodeType) || node.reusedFrom
    || ["reused", "bypassed", "disabled", "blocked", "needs_config", "queued"].includes(node.status)) {
    return { images: [], uncertain: 0 };
  }
  const inputUrls = new Set(Object.values(node.inputs).flatMap((artifacts) => artifacts.flatMap((artifact) =>
    artifact.kind === "images" ? artifact.items.map((item) => item.url) : [])));
  for (const child of node.internalMetadata?.imageEach?.children || []) inputUrls.add(child.source.url);
  const outputUrls = new Set<string>();
  const result: GeneratedImageEvidenceResult = { images: [], uncertain: 0 };
  const definition = run.graphSnapshot.nodes.find((item) => item.id === node.nodeId);
  // V1 without an explicit model permits source fallback, including transcoded
  // source URLs. Its aggregate output cannot prove which individual image ran.
  const ambiguousLegacy = node.nodeType === "model.gpt-image" && (!definition
    || (definition.version === 1 && definition.config.model === undefined && inputUrls.size > 0));
  const add = (url: string, outputId: string, generatedAt: string, timeBasis: GeneratedImageEvidence["timeBasis"]) => {
    if (!url || outputUrls.has(url)) return;
    outputUrls.add(url);
    if (inputUrls.has(url) || ambiguousLegacy) { result.uncertain += 1; return; }
    result.images.push(makeEvidence({
      ownerUserId: run.ownerUserId, ownerDisplayName: run.ownerDisplayName,
      entry: "canvas", sourceKind: "canvas-node", sourceId: node.id,
      taskId: run.id, outputId, url, generatedAt, timeBasis, vehicleModels: [],
    }));
  };
  // Child receipts survive partial/failing parent nodes and are more precise than
  // the aggregate completion timestamp. Never read child.source as an output.
  for (const child of node.internalMetadata?.imageEach?.children || []) {
    if (child.outputUrl) add(child.outputUrl, `child:${child.id}`, child.updatedAt, "source-updated");
  }
  for (const [port, artifact] of Object.entries(node.outputs)) {
    if (artifact.kind !== "images") continue;
    artifact.items.forEach((item, index) => add(item.url, `${port}:${index}`, node.completedAt || node.updatedAt, node.completedAt ? "source-completed" : "source-updated"));
  }
  return result;
}

export function extractQueueGeneratedImages(job: ImageGenerationQueueJob): GeneratedImageEvidenceResult {
  const references = new Set([job.referenceImage, ...(job.referenceImages || [])]);
  const result: GeneratedImageEvidenceResult = { images: [], uncertain: 0 };
  for (const [index, url] of [...new Set(job.outputUrls)].entries()) {
    if (!url || references.has(url)) { result.uncertain += 1; continue; }
    result.images.push(makeEvidence({
      ownerUserId: job.ownerUserId, ownerDisplayName: job.ownerDisplayName,
      entry: job.sourceRunId ? "simple" : "unknown", sourceKind: "image-queue",
      sourceId: job.id, taskId: job.sourceRunId || job.taskId || job.id,
      outputId: String(index), url, generatedAt: job.completedAt || job.updatedAt,
      timeBasis: job.completedAt ? "source-completed" : "source-updated",
      vehicleModels: [],
    }));
  }
  return result;
}

export function extractOriginalCardImages(item: OriginalBatchItem): GeneratedImageEvidenceResult {
  return extractCardSeries(item.series, {
    ownerUserId: item.ownerUserId, ownerDisplayName: item.ownerDisplayName,
    entry: "batch", sourceKind: "original-card", sourceId: item.id,
    taskId: item.batchId, generatedAt: item.completedAt || item.updatedAt,
    timeBasis: item.completedAt ? "source-completed" : "source-updated",
    vehicleModels: item.input.vehicleKeyword?.trim() ? [item.input.vehicleKeyword.trim()] : [],
  });
}

// A finished post can contain uploaded/reference/direct-original images. Only
// card candidate evidence or an owner-matched existing receipt corroborates it.
export function extractPostGeneratedImages(
  post: GeneratedPost,
  knownImages: readonly GeneratedImageEvidence[] = [],
): GeneratedImageEvidenceResult {
  const result = extractCardSeries(post.xhsSeries, {
    ownerUserId: post.ownerUserId, ownerDisplayName: post.ownerDisplayName,
    entry: post.sourceBatchId ? "batch" : "unknown", sourceKind: "post", sourceId: post.id, taskId: post.sourceBatchId || post.id,
    generatedAt: post.updatedAt, timeBasis: "source-updated",
    vehicleModels: post.feishuVehicle?.trim() ? [post.feishuVehicle.trim()] : [],
  });
  const admitted = new Set(result.images.map((image) => image.url));
  const known = new Map(knownImages.filter((image) => (image.ownerUserId || "") === (post.ownerUserId || ""))
    .map((image) => [image.url, image]));
  const selectedUrls = (post.xhsSeries?.cards || []).flatMap((card) => card.imageUrl ? [card.imageUrl] : []);
  result.uncertain = 0;
  for (const [index, url] of [...new Set([...post.imageUrls, ...selectedUrls])].entries()) {
    if (admitted.has(url)) continue;
    const evidence = known.get(url);
    if (!evidence) { result.uncertain += 1; continue; }
    result.images.push({
      ...evidence, sourceKind: "post", sourceId: post.id, outputId: String(index),
      timeBasis: "corroborated",
      vehicleModels: post.feishuVehicle?.trim() ? [post.feishuVehicle.trim()] : evidence.vehicleModels,
    });
  }
  return result;
}

type EvidenceBase = Omit<GeneratedImageEvidence, "url" | "originalName" | "outputId">;

function extractCardSeries(series: XhsCardSeries | undefined, base: EvidenceBase): GeneratedImageEvidenceResult {
  const result: GeneratedImageEvidenceResult = { images: [], uncertain: 0 };
  for (const card of series?.cards || []) {
    // The orchestrator adds candidateUrls only after provider generation succeeds.
    // A selected image without a candidate receipt is not sufficient proof.
    for (const [index, url] of [...new Set(card.candidateUrls)].entries()) {
      if (!url) { result.uncertain += 1; continue; }
      result.images.push(makeEvidence({ ...base, url, outputId: `${card.id}:${index}` }));
    }
    if (card.imageUrl && !card.candidateUrls.includes(card.imageUrl)) result.uncertain += 1;
  }
  return result;
}

function makeEvidence(value: Omit<GeneratedImageEvidence, "originalName">): GeneratedImageEvidence {
  if (!Number.isFinite(Date.parse(value.generatedAt))) throw new Error("Generation evidence has no valid timestamp.");
  const pathname = value.url.split(/[?#]/, 1)[0];
  const originalName = pathname.slice(pathname.lastIndexOf("/") + 1);
  if (!originalName) throw new Error("Generation evidence has no original filename.");
  return { ...value, generatedAt: new Date(value.generatedAt).toISOString(), originalName };
}
