import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { prewarmLibraryThumbnails } from "../../src/lib/library-thumbnail-prewarm";
import { getLibraryThumbnail, libraryThumbnailPath } from "../../src/lib/library-thumbnails";

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
void main();

async function main() {
const source = await sharp({ create: { width: 960, height: 640, channels: 3, background: { r: 30, g: 120, b: 90 } } }).jpeg().toBuffer();
const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), "fluxpost-library-thumbnails-"));
try {
  let fetchCalls = 0;
  let sourceRedirectMode: RequestRedirect | undefined;
  const asset = { publicUrl: "https://managed.test/source.jpg", sha256: "a".repeat(64) };
  const fetchSource = async (_input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls += 1;
    sourceRedirectMode = init?.redirect;
    return new Response(source, { status: 200, headers: { "content-type": "image/jpeg", "content-length": String(source.length) } });
  };
  const dependencies = { cacheDirectory, fetchSource: fetchSource as typeof fetch, isManagedSource: () => true };

  const concurrent = await Promise.all(Array.from({ length: 8 }, () => getLibraryThumbnail(asset, dependencies)));
  assert(fetchCalls === 1, `Concurrent requests fetched the same immutable source ${fetchCalls} times.`);
  assert(sourceRedirectMode === "error", "Thumbnail source requests must reject redirects outside the validated managed URL.");
  assert(concurrent.every((result) => result.etag === concurrent[0].etag), "Thumbnail ETags must be stable by variant and SHA.");
  const metadata = await sharp(concurrent[0].bytes).metadata();
  assert(metadata.format === "webp", `Expected WebP, got ${metadata.format}.`);
  assert(metadata.width === 240 && metadata.height === 144, `Expected 240x144, got ${metadata.width}x${metadata.height}.`);

  const hit = await getLibraryThumbnail(asset, dependencies);
  assert(hit.cacheStatus === "hit", "A valid thumbnail cache file must be reused.");
  assert(fetchCalls === 1, "A cache hit must not fetch the original again.");
  assert((await readdir(cacheDirectory)).every((name) => !name.endsWith(".tmp")), "Atomic generation left a temporary file behind.");

  const square = await getLibraryThumbnail(asset, dependencies, "square");
  const squareMetadata = await sharp(square.bytes).metadata();
  assert(squareMetadata.width === 240 && squareMetadata.height === 240, `Expected square 240x240, got ${squareMetadata.width}x${squareMetadata.height}.`);
  assert(square.etag.includes("square-contain"), `Square thumbnails must use the contain-fit cache version, got ${square.etag}.`);
  assert((await readdir(cacheDirectory)).includes(path.basename(libraryThumbnailPath(asset.sha256, cacheDirectory, "square"))), "Square thumbnails must use a versioned cache file.");
  assert(square.etag !== concurrent[0].etag, "Square thumbnails must use a distinct variant ETag.");

  let active = 0;
  let maximumActive = 0;
  await Promise.all(Array.from({ length: 9 }, (_, index) => getLibraryThumbnail({
    publicUrl: `https://managed.test/${index}.jpg`,
    sha256: (index + 1).toString(16).padStart(64, "0"),
  }, {
    cacheDirectory,
    isManagedSource: () => true,
    fetchSource: (async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 25));
      active -= 1;
      return new Response(source, { status: 200, headers: { "content-type": "image/jpeg" } });
    }) as typeof fetch,
  })));
  assert(maximumActive > 1 && maximumActive <= 4, `Thumbnail concurrency must be 2-4, observed ${maximumActive}.`);

  await assertRejects(
    () => getLibraryThumbnail({ publicUrl: "https://foreign.test/image.jpg", sha256: "b".repeat(64) }, { cacheDirectory, isManagedSource: () => false }),
    /not managed TOS media/,
    "Unmanaged sources must be rejected before fetch.",
  );
  await assertRejects(
    () => getLibraryThumbnail({ publicUrl: "https://managed.test/large.jpg", sha256: "c".repeat(64) }, {
      cacheDirectory, isManagedSource: () => true,
      fetchSource: (async () => new Response(source, { headers: { "content-type": "image/jpeg", "content-length": String(31 * 1024 * 1024) } })) as typeof fetch,
    }),
    /30 MB limit/,
    "Oversized sources must be rejected.",
  );
  await assertRejects(
    () => getLibraryThumbnail({ publicUrl: "https://managed.test/bad.jpg", sha256: "d".repeat(64) }, {
      cacheDirectory, isManagedSource: () => true,
      fetchSource: (async () => new Response("not an image", { headers: { "content-type": "image/jpeg" } })) as typeof fetch,
    }),
    /generation failed/,
    "Corrupt source bytes must surface a generation error.",
  );

  const prewarmAssets = [
    { id: "generated", publicUrl: "https://managed.test/generated.jpg", sha256: "e".repeat(64) },
    { id: "skipped", publicUrl: "https://managed.test/skipped.jpg", sha256: "f".repeat(64) },
    { id: "failed", publicUrl: "https://managed.test/failed.jpg", sha256: "1".repeat(64) },
  ];
  const prewarm = await prewarmLibraryThumbnails(prewarmAssets, async (prewarmAsset) => {
    if (prewarmAsset.id === "failed") throw new Error("mock source failure");
    return {
      bytes: Buffer.alloc(prewarmAsset.id === "generated" ? 11 : 7),
      cacheStatus: prewarmAsset.id === "generated" ? "generated" : "hit",
      etag: `\"${prewarmAsset.id}\"`,
    };
  });
  assert(
    JSON.stringify(prewarm.summary) === JSON.stringify({ total: 3, generated: 1, skipped: 1, failed: 1, bytes: 18 }),
    `Unexpected prewarm summary: ${JSON.stringify(prewarm.summary)}`,
  );
  assert(prewarm.failures.length === 1 && prewarm.failures[0].includes("failed: mock source failure"), "Prewarm must report each failed asset without losing successful totals.");
} finally {
  await rm(cacheDirectory, { recursive: true, force: true });
}

console.log("Library thumbnail dimensions, cache, concurrency, and failure checks passed.");
}

async function assertRejects(action: () => Promise<unknown>, pattern: RegExp, message: string) {
  let error: unknown;
  try { await action(); } catch (caught) { error = caught; }
  assert(error instanceof Error && pattern.test(error.message), `${message} Received: ${error instanceof Error ? error.message : "no error"}`);
}
