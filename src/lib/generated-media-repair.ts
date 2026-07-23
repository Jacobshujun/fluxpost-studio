import { compactError, recordExecutionLog } from "./activity-log";
import { appConfig } from "./config";
import { readContentProjectsFromDb, readGeneratedPostsFromDb, saveGeneratedPostToDb } from "./database";
import { backfillSourceItemMedia } from "./media-backfill";
import { getCachedImageIndex } from "./media-url-filter";
import { isManagedRuntimeMediaUrl, isTosRuntimeMediaConfigured } from "./runtime-media-storage";
import type {
  GeneratedMediaRepairBatchResult,
  GeneratedMediaRepairFailure,
  GeneratedMediaRepairMode,
  GeneratedPost,
  NormalizedSourceItem,
} from "./types";
import type { WorkspaceAccessActor } from "./workspace-ownership";

const defaultRepairLimit = 10;
const maxRepairLimit = 25;

type RepairCandidate = {
  postId: string;
  finalImageIndex: number;
  sourceImageIndex: number;
  sourceUrl: string;
};

type RepairAnalysis = {
  candidates: RepairCandidate[];
  failures: GeneratedMediaRepairFailure[];
};

export class GeneratedMediaRepairValidationError extends Error {}

export async function runGeneratedMediaRepairBatch(input: {
  mode: GeneratedMediaRepairMode;
  cursor?: string;
  limit?: number;
  account: WorkspaceAccessActor;
}): Promise<GeneratedMediaRepairBatchResult> {
  const limit = normalizeLimit(input.limit);
  const cursor = input.cursor?.trim() || undefined;
  if (input.mode === "apply" && (!appConfig.tosEnabled || !isTosRuntimeMediaConfigured())) {
    throw new GeneratedMediaRepairValidationError("Historical media repair requires enabled and fully configured TOS storage.");
  }

  const [posts, projects] = await Promise.all([readGeneratedPostsFromDb(), readContentProjectsFromDb()]);
  const orderedPosts = [...posts].sort((a, b) => a.id.localeCompare(b.id));
  const remainingPosts = cursor ? orderedPosts.filter((post) => post.id > cursor) : orderedPosts;
  const page = remainingPosts.slice(0, limit);
  const nextCursor = remainingPosts.length > page.length ? page.at(-1)?.id : undefined;
  const sourceById = new Map(projects.flatMap((project) => project.items).map((item) => [item.id, item]));
  const candidatesByPost = new Map<string, RepairCandidate[]>();
  const scanFailures: GeneratedMediaRepairFailure[] = [];

  for (const post of page) {
    const source = sourceById.get(post.sourceItemId);
    if (!source) continue;
    const analysis = analyzeRepairCandidates(post, source);
    if (analysis.candidates.length) candidatesByPost.set(post.id, analysis.candidates);
    scanFailures.push(...analysis.failures);
  }

  const result: GeneratedMediaRepairBatchResult = {
    mode: input.mode,
    cursor,
    nextCursor,
    scannedCount: page.length,
    candidatePostCount: candidatesByPost.size,
    candidateImageCount: Array.from(candidatesByPost.values()).reduce((sum, values) => sum + values.length, 0),
    repairedPostCount: 0,
    repairedImageCount: 0,
    failures: scanFailures,
  };

  if (input.mode === "apply" && candidatesByPost.size) {
    await applyRepairBatch(page, candidatesByPost, input.account, result);
  }

  await recordExecutionLog({
    scope: "storage/media-repair",
    action: input.mode === "apply" ? "Repair historical generated media" : "Scan historical generated media",
    status: result.failures.length ? "info" : "success",
    message:
      input.mode === "apply"
        ? `Scanned ${result.scannedCount} posts and repaired ${result.repairedImageCount} exact-match image reference(s).`
        : `Scanned ${result.scannedCount} posts and found ${result.candidateImageCount} exact-match external image reference(s).`,
    details: {
      cursor: cursor || null,
      nextCursor: nextCursor || null,
      candidatePostCount: result.candidatePostCount,
      candidateImageCount: result.candidateImageCount,
      repairedPostCount: result.repairedPostCount,
      repairedImageCount: result.repairedImageCount,
      failureCount: result.failures.length,
    },
  });
  return result;
}

export function findRepairCandidates(post: GeneratedPost, source: NormalizedSourceItem): RepairCandidate[] {
  return analyzeRepairCandidates(post, source).candidates;
}

function analyzeRepairCandidates(post: GeneratedPost, source: NormalizedSourceItem): RepairAnalysis {
  const sourceIndicesByUrl = new Map<string, number[]>();
  source.images.forEach((url, index) => {
    sourceIndicesByUrl.set(url, [...(sourceIndicesByUrl.get(url) || []), index]);
  });
  const failures: GeneratedMediaRepairFailure[] = [];
  const candidates = post.imageUrls.flatMap((url, finalImageIndex) => {
    if (isDurableRuntimeImage(url)) return [];
    const sourceImageIndices = sourceIndicesByUrl.get(url);
    if (!sourceImageIndices?.length) return [];
    if (sourceImageIndices.length !== 1) {
      failures.push({
        postId: post.id,
        imageIndex: finalImageIndex,
        sourceImageIndex: null,
        message: "The source image URL appears at multiple indices, so the replacement index is ambiguous.",
      });
      return [];
    }
    return [{ postId: post.id, finalImageIndex, sourceImageIndex: sourceImageIndices[0], sourceUrl: url }];
  });
  return { candidates, failures };
}

async function applyRepairBatch(
  page: GeneratedPost[],
  candidatesByPost: Map<string, RepairCandidate[]>,
  account: WorkspaceAccessActor,
  result: GeneratedMediaRepairBatchResult,
) {
  const sourceIds = Array.from(
    new Set(page.filter((post) => candidatesByPost.has(post.id)).map((post) => post.sourceItemId)),
  );
  const backfill = await backfillSourceItemMedia(sourceIds, account, {
    forceImageRefresh: true,
    skipVideoProcessing: true,
  });
  const cachedById = new Map(backfill.cachedItems.map((item) => [item.id, item]));
  const currentPostsById = new Map((await readGeneratedPostsFromDb()).map((post) => [post.id, post]));

  for (const scannedPost of page) {
    const candidates = candidatesByPost.get(scannedPost.id);
    if (!candidates?.length) continue;
    const post = currentPostsById.get(scannedPost.id);
    if (!post || post.sourceItemId !== scannedPost.sourceItemId) {
      result.failures.push(...candidates.map((candidate) => makeFailure(candidate, "The generated post changed or was removed after scanning; no replacement was applied.")));
      continue;
    }
    const cachedSource = cachedById.get(post.sourceItemId);
    if (!cachedSource) {
      result.failures.push(...candidates.map((candidate) => makeFailure(candidate, "The source item could not be refreshed; no replacement was applied.")));
      continue;
    }
    const replacementBySourceIndex = buildReplacementMap(cachedSource);
    const imageUrls = [...post.imageUrls];
    const appliedCandidates: RepairCandidate[] = [];

    for (const candidate of candidates) {
      if (cachedSource.images[candidate.sourceImageIndex] !== candidate.sourceUrl) {
        result.failures.push(makeFailure(candidate, "The source image order changed after scanning; no replacement was applied."));
        continue;
      }
      const replacement = replacementBySourceIndex.get(candidate.sourceImageIndex);
      if (!replacement || !isDurableRuntimeImage(replacement)) {
        result.failures.push(makeFailure(candidate, "No verified cached replacement was produced for this source image."));
        continue;
      }
      if (imageUrls[candidate.finalImageIndex] !== candidate.sourceUrl) {
        result.failures.push(makeFailure(candidate, "The generated image changed after scanning; no replacement was applied."));
        continue;
      }
      imageUrls[candidate.finalImageIndex] = replacement;
      appliedCandidates.push(candidate);
    }

    if (!appliedCandidates.length) continue;
    const replacementByOriginal = new Map<string, string>();
    for (const candidate of appliedCandidates) {
      const replacement = replacementBySourceIndex.get(candidate.sourceImageIndex);
      if (replacement && imageUrls[candidate.finalImageIndex] === replacement) replacementByOriginal.set(candidate.sourceUrl, replacement);
    }
    const imageTasks = post.imageTasks?.map((task) => {
      return {
        ...task,
        url: task.mode === "keep" ? replacementByOriginal.get(task.url) || task.url : task.url,
        referenceUrls: task.referenceUrls?.map((url) => replacementByOriginal.get(url) || url),
      };
    });
    try {
      await saveGeneratedPostToDb({
        ...post,
        imageUrls,
        imageTasks,
        updatedAt: new Date().toISOString(),
      });
      result.repairedPostCount += 1;
      result.repairedImageCount += appliedCandidates.length;
    } catch (error) {
      const message = `The generated post update failed: ${compactError(error)}`;
      result.failures.push(...appliedCandidates.map((candidate) => makeFailure(candidate, message)));
    }
  }
}

function buildReplacementMap(source: NormalizedSourceItem) {
  const replacements = new Map<number, string>();
  for (const url of source.downloadedImages || []) {
    const sourceImageIndex = getCachedImageIndex(url);
    if (sourceImageIndex !== undefined && sourceImageIndex < source.images.length && isManagedRuntimeMediaUrl(url)) {
      replacements.set(sourceImageIndex, url);
    }
  }
  return replacements;
}

function isDurableRuntimeImage(url: string) {
  return url.startsWith("/media/") || url.startsWith("/generated/") || isManagedRuntimeMediaUrl(url);
}

function makeFailure(candidate: RepairCandidate, message: string): GeneratedMediaRepairFailure {
  return {
    postId: candidate.postId,
    imageIndex: candidate.finalImageIndex,
    sourceImageIndex: candidate.sourceImageIndex,
    message,
  };
}

function normalizeLimit(value?: number) {
  if (value === undefined) return defaultRepairLimit;
  if (!Number.isInteger(value) || value < 1 || value > maxRepairLimit) {
    throw new GeneratedMediaRepairValidationError(`Repair limit must be an integer between 1 and ${maxRepairLimit}.`);
  }
  return value;
}
