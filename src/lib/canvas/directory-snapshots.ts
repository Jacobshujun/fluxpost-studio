import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, readdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createCanvasDirectorySnapshotInDb, getCanvasDirectorySnapshotFromDb } from "../database";
import { probeCanvasAudioDuration, probeCanvasMediaFile } from "./media-tools";
import type { CanvasDirectoryGroup, CanvasDirectoryMedia, CanvasDirectorySnapshot } from "./types";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const AUDIO_EXT = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".webm"]);
export const CANVAS_DIRECTORY_LIMITS = { maxGroups: 200, maxMediaPerGroup: 250, maxFiles: 5000 } as const;

export function canvasLocalDirectoryEnabled() {
  const explicit = process.env.CANVAS_LOCAL_DIRECTORY_ENABLED;
  if (explicit !== undefined) return /^(1|true|yes|on)$/i.test(explicit.trim());
  return ["development", "candidate"].includes(process.env.FLUXPOST_RUNTIME_MODE || "development");
}

export async function scanCanvasLocalDirectory(rootPath: string, ownerUserId: string): Promise<CanvasDirectorySnapshot> {
  if (!canvasLocalDirectoryEnabled()) throw new Error("Local directory nodes are disabled in this environment.");
  const root = path.resolve(rootPath.trim());
  const rootStat = await stat(root);
  if (!rootStat.isDirectory()) throw new Error("Local directory path must be a directory.");
  const entries = await readdir(root, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).sort((a, b) => naturalCompare(a.name, b.name));
  const groupEntries = directories.length ? directories.map((entry) => ({ name: entry.name, path: path.join(root, entry.name) })) : [{ name: path.basename(root) || root, path: root }];
  const groups: CanvasDirectoryGroup[] = [];
  let files = 0;
  let truncated = false;
  const reportErrors: string[] = [];
  for (const groupEntry of groupEntries) {
    if (groups.length >= CANVAS_DIRECTORY_LIMITS.maxGroups) { truncated = true; break; }
    const group: CanvasDirectoryGroup = { id: randomUUID(), name: groupEntry.name, images: [], audios: [], videos: [], valid: true, errors: [] };
    const children = (await readdir(groupEntry.path, { withFileTypes: true })).filter((entry) => entry.isFile()).sort((a, b) => naturalCompare(a.name, b.name));
    for (const child of children) {
      if (files >= CANVAS_DIRECTORY_LIMITS.maxFiles) { truncated = true; break; }
      const ext = path.extname(child.name).toLowerCase();
      const kind = IMAGE_EXT.has(ext) ? "image" : AUDIO_EXT.has(ext) ? "audio" : VIDEO_EXT.has(ext) ? "video" : undefined;
      if (!kind) continue;
      files += 1;
      if (group.images.length + group.audios.length + group.videos.length >= CANVAS_DIRECTORY_LIMITS.maxMediaPerGroup) { truncated = true; break; }
      const absolutePath = path.resolve(groupEntry.path, child.name);
      try {
        const fileStat = await stat(absolutePath);
        const sha256 = await hashFile(absolutePath);
        if (!await hasExpectedSignature(absolutePath, kind, ext)) throw new Error("File signature does not match its extension.");
        const metadata = kind === "image"
          ? await sharp(absolutePath).metadata().then((value) => ({ width: value.width, height: value.height }))
          : kind === "audio"
            ? { durationSeconds: await probeCanvasAudioDuration(absolutePath) }
            : await probeCanvasMediaFile(absolutePath).then((value) => ({ width: value.width, height: value.height, durationSeconds: value.durationSeconds }));
        const media: CanvasDirectoryMedia = {
          id: randomUUID(), kind, absolutePath, relativePath: path.relative(root, absolutePath), bytes: fileStat.size,
          modifiedAt: fileStat.mtime.toISOString(), sha256, url: absolutePath, name: child.name,
          mimeType: mimeForExtension(ext),
          ...metadata,
        };
        if (kind === "image") group.images.push(media); else if (kind === "audio") group.audios.push(media); else group.videos.push(media);
      } catch (error) {
        group.errors.push(`${child.name}: ${error instanceof Error ? error.message : "unreadable"}`);
      }
    }
    group.valid = group.images.length > 0 && group.audios.length > 0 && group.errors.length === 0;
    if (!group.images.length) group.errors.push("No supported images found.");
    if (!group.audios.length) group.errors.push("No supported audio found.");
    if (group.errors.length) reportErrors.push(`${group.name}: ${group.errors.join(" ")}`);
    groups.push(group);
    if (truncated) break;
  }
  const snapshot: CanvasDirectorySnapshot = { id: randomUUID(), ownerUserId, rootPath: root, scannedAt: new Date().toISOString(), groups, report: { files, groups: groups.length, truncated, errors: reportErrors } };
  snapshot.groups = snapshot.groups.map((group) => ({ ...group, snapshotId: snapshot.id }));
  await createCanvasDirectorySnapshotInDb(snapshot);
  return snapshot;
}

export async function getCanvasDirectorySnapshot(id: string, ownerUserId: string) {
  const snapshot = await getCanvasDirectorySnapshotFromDb(id, ownerUserId);
  if (!snapshot || snapshot.ownerUserId !== ownerUserId) throw new Error("Directory snapshot not found.");
  return structuredClone(snapshot);
}

export async function revalidateCanvasDirectoryGroup(snapshotId: string, groupId: string, ownerUserId: string) {
  const snapshot = await getCanvasDirectorySnapshot(snapshotId, ownerUserId);
  const group = snapshot.groups.find((candidate) => candidate.id === groupId);
  if (!group) throw new Error("Directory group not found.");
  for (const media of [...group.images, ...group.audios, ...group.videos]) {
    try {
      const current = await stat(media.absolutePath);
      if (current.size !== media.bytes || current.mtime.toISOString() !== media.modifiedAt || await hashFile(media.absolutePath) !== media.sha256) throw new Error("Source file changed.");
    } catch (error) {
      throw new Error(`Directory media changed or is unavailable: ${media.name || media.relativePath}. ${error instanceof Error ? error.message : ""}`);
    }
  }
  return group;
}

export function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

async function hashFile(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function hasExpectedSignature(filePath: string, kind: "image" | "audio" | "video", extension: string) {
  const handle = await open(filePath, "r");
  const bytes = Buffer.alloc(16);
  try { await handle.read(bytes, 0, bytes.length, 0); } finally { await handle.close(); }
  if (kind === "image") {
    if (extension === ".png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (extension === ".jpg" || extension === ".jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (extension === ".webp") return bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
  }
  if (kind === "audio") {
    if (extension === ".wav") return bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WAVE";
    if (extension === ".mp3") return bytes.subarray(0, 3).toString() === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
    if (extension === ".m4a") return bytes.subarray(4, 8).toString() === "ftyp";
    if (extension === ".aac") return bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0;
    if (extension === ".flac") return bytes.subarray(0, 4).toString() === "fLaC";
    return false;
  }
  if (kind === "video") return extension === ".webm"
    ? bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
    : bytes.subarray(4, 8).toString() === "ftyp";
  return false;
}

function mimeForExtension(extension: string) {
  return ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac", ".flac": "audio/flac", ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm" } as Record<string, string>)[extension] || "application/octet-stream";
}
