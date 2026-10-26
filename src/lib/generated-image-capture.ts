import { AsyncLocalStorage } from "node:async_hooks";
import { mkdir, writeFile, rename, readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { generatedImageSourceIdentity, type GeneratedImageEvidence, type GeneratedImageEntry } from "./generated-image-evidence";
import { recordGeneratedImage } from "./generated-image-store";
import { isWorkspaceAdmin, type WorkspaceAccessActor } from "./workspace-ownership";

type GenerationContext = {
  ownerUserId?: string; ownerDisplayName?: string; entry: GeneratedImageEntry;
  taskId: string; sourceId: string; vehicleModels?: string[];
};
const context = new AsyncLocalStorage<GenerationContext>();
const captureFailures = new Map<string, { evidence: GeneratedImageEvidence; error: string }>();
const outbox = () => path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "generated-image-outbox");
export function withGeneratedImageContext<T>(value: GenerationContext, operation: () => Promise<T>) {
  return context.run(value, operation);
}

// Called only at confirmed provider-output saves, never generic media/input saves.
export async function captureGeneratedImage(url: string) {
  const source = context.getStore();
  if (!source) return url; // Probes and standalone tools have no user task to enroll.
  const evidence: GeneratedImageEvidence = {
    ...source, sourceKind: "output-receipt", outputId: url, url,
    originalName: url.split(/[?#]/, 1)[0].split("/").pop()!,
    generatedAt: new Date().toISOString(), timeBasis: "saved", vehicleModels: source.vehicleModels || [],
  };
  // This recovery receipt precedes indexing; a database outage cannot turn a saved
  // image into another paid model request. Receipt files contain runtime data only.
  const folder = outbox();
  const file = path.join(folder, `${generatedImageSourceIdentity(evidence)}.json`);
  const temporary = `${file}.${randomUUID()}.tmp`;
  let receiptSaved = false;
  let receiptError: unknown;
  try {
    await mkdir(folder, { recursive: true });
    await writeFile(temporary, JSON.stringify(evidence), { flag: "wx" });
    await rename(temporary, file);
    receiptSaved = true;
  } catch (error) { receiptError = error; }
  try {
    await recordGeneratedImage(evidence);
    if (receiptSaved) await unlink(file).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  } catch (error) {
    const message = receiptSaved ? "Enrollment deferred; durable receipt retained." : "Enrollment failed in both database and recovery receipt; retry before restarting.";
    captureFailures.set(generatedImageSourceIdentity(evidence), { evidence, error: message });
    console.error(message, error, receiptError);
  }
  const { kickGeneratedImageWorker } = await import("./generated-image-backfill");
  kickGeneratedImageWorker();
  return url;
}

export function generatedCaptureFailures(actor: WorkspaceAccessActor) {
  return [...captureFailures.entries()].filter(([, item]) => isWorkspaceAdmin(actor) || item.evidence.ownerUserId === actor.id)
    .map(([id, item]) => ({ id, error: item.error }));
}

export async function retryGeneratedCaptureFailures(actor: WorkspaceAccessActor) {
  for (const [id, item] of captureFailures) {
    if (!isWorkspaceAdmin(actor) && item.evidence.ownerUserId !== actor.id) continue;
    await recordGeneratedImage(item.evidence);
    captureFailures.delete(id);
  }
}

export async function replayGeneratedImageReceipts() {
  let files: string[];
  try { files = await readdir(outbox()); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
  const batch = files.filter((file) => /^[a-f0-9]{64}\.json$/.test(file)).slice(0, 100);
  for (const name of batch) {
    const file = path.join(outbox(), name);
    const contents = await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined; // Another process already enrolled it.
      throw error;
    });
    if (contents === undefined) continue;
    const evidence = JSON.parse(contents) as GeneratedImageEvidence;
    await recordGeneratedImage(evidence);
    captureFailures.delete(generatedImageSourceIdentity(evidence));
    await unlink(file).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  }
  return batch.length === 100;
}
