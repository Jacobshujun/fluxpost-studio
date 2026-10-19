import { getLibraryAssetFromDb, getWorkspaceAccountByIdFromDb } from "./database";
import { extractLibraryPalette } from "./library-color-extraction";
import { libraryColorVersion } from "./library-color";
import { claimLibraryColorItem, completeLibraryColorItem, nextLibraryColorLease } from "./library-color-store";
import { downloadThumbnailSource } from "./library-thumbnails";
import { isManagedRuntimeMediaUrl } from "./runtime-media-storage";
import type { LibraryPalette } from "./types";

let draining: Promise<void> | undefined;
let wakeRequested = false;
let wakeTimer: ReturnType<typeof setTimeout> | undefined;

export function failedLibraryPalette(sha256: string, error: unknown): LibraryPalette {
  return { status: "failed", sha256, version: libraryColorVersion, colors: [], analyzedAt: new Date().toISOString(), error: error instanceof Error ? error.message.slice(0, 500) : "颜色分析失败。" };
}

// Resolves only when the currently admitted work drains; useful for isolated tests.
export function ensureLibraryColorWorker(): Promise<void> {
  if (process.env.FLUXPOST_DISABLE_BACKGROUND_WORKERS === "1") return Promise.resolve();
  if (draining) { wakeRequested = true; return draining; }
  if (wakeTimer) { clearTimeout(wakeTimer); wakeTimer = undefined; }
  draining = drain().finally(() => {
    draining = undefined;
    if (wakeRequested) { wakeRequested = false; kickLibraryColorWorker(); }
  });
  return draining;
}

async function drain() {
  const lane = async () => {
    for (;;) {
      const claim = await claimLibraryColorItem();
      if (!claim) return;
      let palette: LibraryPalette;
      let authorized = false;
      try {
        const [asset, owner] = await Promise.all([getLibraryAssetFromDb(claim.assetId), getWorkspaceAccountByIdFromDb(claim.ownerId)]);
        if (!owner || owner.status !== "active" || !asset || (owner.role !== "admin" && asset.ownerUserId !== owner.id)) throw new Error("图片已删除或不再具有管理权限。");
        authorized = true;
        if (asset.sha256 !== claim.sha256) throw new Error("图片内容已变化，请重新分析。");
        if (!isManagedRuntimeMediaUrl(asset.publicUrl)) throw new Error("图片来源不是受管图库素材。");
        const bytes = await downloadThumbnailSource(asset.publicUrl, fetch);
        palette = await extractLibraryPalette(bytes, claim.sha256);
      } catch (error) { palette = failedLibraryPalette(claim.sha256, error); }
      await completeLibraryColorItem(claim, palette, authorized);
    }
  };
  await Promise.all([lane(), lane()]);
  const lease = await nextLibraryColorLease();
  if (lease) {
    wakeTimer = setTimeout(() => { wakeTimer = undefined; void ensureLibraryColorWorker().catch(reportWorkerError); }, Math.max(25, Date.parse(lease) - Date.now() + 25));
    wakeTimer.unref?.();
  }
}

export function kickLibraryColorWorker() {
  void ensureLibraryColorWorker().catch(reportWorkerError);
}

function reportWorkerError(error: unknown) {
  console.error("Library color worker stopped:", error instanceof Error ? error.message : "Database error");
}
