import { getLibraryThumbnail, type LibraryThumbnailResult } from "./library-thumbnails";
import type { LibraryAsset } from "./types";

type PrewarmAsset = Pick<LibraryAsset, "id" | "publicUrl" | "sha256">;

export type LibraryThumbnailPrewarmSummary = {
  total: number;
  generated: number;
  skipped: number;
  failed: number;
  bytes: number;
};

export async function prewarmLibraryThumbnails(
  assets: PrewarmAsset[],
  generate: (asset: PrewarmAsset) => Promise<LibraryThumbnailResult> = getLibraryThumbnail,
) {
  const summary: LibraryThumbnailPrewarmSummary = {
    total: assets.length,
    generated: 0,
    skipped: 0,
    failed: 0,
    bytes: 0,
  };
  const failures: string[] = [];

  await Promise.all(assets.map(async (asset) => {
    try {
      const result = await generate(asset);
      if (result.cacheStatus === "generated") summary.generated += 1;
      else summary.skipped += 1;
      summary.bytes += result.bytes.length;
    } catch (error) {
      summary.failed += 1;
      failures.push(`${asset.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }));

  return { summary, failures };
}
