import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { MaterialAsset } from "./types";

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

export async function scanMaterialFolder(folderPath: string, limit = 80): Promise<MaterialAsset[]> {
  const root = path.resolve(folderPath);
  const rootStat = await stat(root);
  if (!rootStat.isDirectory()) {
    throw new Error("Material path must be a folder");
  }

  const results: MaterialAsset[] = [];

  async function visit(currentPath: string, depth: number) {
    if (depth > 3 || results.length >= limit) return;
    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= limit) break;
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath, depth + 1);
        continue;
      }
      const extension = path.extname(entry.name).toLowerCase();
      if (entry.isFile() && imageExtensions.has(extension)) {
        results.push({
          id: Buffer.from(entryPath).toString("base64url"),
          path: entryPath,
          name: entry.name,
          extension,
        });
      }
    }
  }

  await visit(root, 0);
  return results;
}
