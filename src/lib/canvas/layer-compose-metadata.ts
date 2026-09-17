import type { ComposeSource } from "./layer-compose-contract";
import { composeSourceId } from "./layer-compose-contract";

export type ComposeMetadataState = { status: "loading" } | { status: "ready"; source: ComposeSource } | { status: "error"; message: string };
export const composeMetadataId = (source: ComposeSource) => source.binding ? composeSourceId(source) : `${source.kind}:${source.key}`;

export function hasComposeMetadata(source: ComposeSource) {
  return Number.isFinite(source.width) && source.width! > 0 && Number.isFinite(source.height) && source.height! > 0
    && (source.kind === "image" || (Number.isFinite(source.durationSeconds) && source.durationSeconds! > 0 && typeof source.hasAudio === "boolean"));
}

async function inspectSource(source: ComposeSource, signal: AbortSignal): Promise<ComposeSource> {
  const response = await fetch("/api/canvas/layer-compose/inspect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: source.media.url, kind: source.kind }), signal });
  const result = await response.json() as { width?: number; height?: number; durationSeconds?: number; hasAudio?: boolean; error?: string };
  const next = { ...source, width: result.width, height: result.height, durationSeconds: result.durationSeconds, hasAudio: result.hasAudio };
  if (!response.ok || !hasComposeMetadata(next)) throw new Error(result.error || "无法读取素材信息。");
  return next;
}

// Scoped to one editor session. No URL-only browser cache survives a changed input snapshot.
export function createComposeMetadataLoader(onChange: (id: string, state: ComposeMetadataState) => void, inspect = inspectSource) {
  const states = new Map<string, ComposeMetadataState>();
  const queue: ComposeSource[] = [];
  const controller = new AbortController();
  let active = 0;
  const publish = (id: string, state: ComposeMetadataState) => {
    if (controller.signal.aborted) return;
    states.set(id, state); onChange(id, state);
  };
  const pump = () => {
    while (!controller.signal.aborted && active < 2 && queue.length) {
      const source = queue.shift()!, id = composeMetadataId(source);
      active++;
      void inspect(source, controller.signal).then(
        (result) => publish(id, { status: "ready", source: result }),
        (error: unknown) => publish(id, { status: "error", message: error instanceof Error ? error.message : "读取素材失败。" }),
      ).finally(() => { active--; pump(); });
    }
  };
  const ensure = (source: ComposeSource) => {
    const id = composeMetadataId(source);
    if (controller.signal.aborted || states.has(id) || hasComposeMetadata(source)) return;
    publish(id, { status: "loading" }); queue.push(source); pump();
  };
  return {
    ensure,
    retry(source: ComposeSource) {
      const id = composeMetadataId(source);
      if (states.get(id)?.status !== "error") return;
      states.delete(id); ensure(source);
    },
    dispose() { controller.abort(); queue.length = 0; },
  };
}
