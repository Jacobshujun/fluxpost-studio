import path from "node:path";
import { readFile, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export function within(root, relative, prefix) {
  if (typeof relative !== "string" || path.isAbsolute(relative) || relative.includes("\\") ||
      !relative.startsWith(prefix) || relative.split("/").some((part) => ["..", ".", ""].includes(part))) {
    throw new Error("UnsafeCutoverPath");
  }
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) throw new Error("UnsafeCutoverPath");
  return resolved;
}

export async function loadCutoverConfig(root = projectRoot) {
  const config = JSON.parse(await readFile(path.join(root, "data/oss-cutover/config.json"), "utf8"));
  if (config.version !== 1) throw new Error("UnsupportedCutoverConfig");
  if (!/^data\/backups\/[a-zA-Z0-9_-]+$/.test(config.frozenBackupDir)) throw new Error("UnsafeBackupPath");
  const canonicalRoot = await realpath(root);
  for (const [value, prefix] of [[config.evidenceDir, "test-artifacts/"], [config.onlineBackupDir, "data/backups/"], [config.frozenBackupDir, "data/backups/"]]) {
    let current = within(root, value, prefix);
    while (true) {
      try {
        const canonical = await realpath(current);
        if (canonical !== canonicalRoot && !canonical.startsWith(canonicalRoot + path.sep)) throw new Error("CutoverPathEscapesWorkspace");
        break;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        const parent = path.dirname(current);
        if (parent === current) throw new Error("UnsafeCutoverPath");
        current = parent;
      }
    }
  }
  if (config.onlineBackupDir === config.frozenBackupDir) throw new Error("DistinctBackupsRequired");
  return { evidenceDir: config.evidenceDir, onlineBackupDir: config.onlineBackupDir, frozenBackupDir: config.frozenBackupDir };
}
