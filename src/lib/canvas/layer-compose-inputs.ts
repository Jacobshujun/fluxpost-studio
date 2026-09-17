import type { CanvasArtifact, CanvasGraph, CanvasMediaReference, CanvasNodeRun } from "./types";
import { bindComposeInput, composeSources } from "./layer-compose-contract";
import { selectedCanvasVideo } from "./video-loader";
import { canvasSourceVideoSnapshotFromConfig, isCanvasSourceVideoSnapshotCurrent } from "./source-video-contract";

// Read current literal inputs first; computed sources require an existing successful output.
export function resolveComposeEditorSources(graph: CanvasGraph, nodeId: string, runs: Map<string, CanvasNodeRun>) {
  const images: CanvasMediaReference[] = [], videos: CanvasMediaReference[] = [];
  for (const edge of graph.edges.filter((entry) => entry.target === nodeId)) {
    const node = graph.nodes.find((entry) => entry.id === edge.source);
    if (!node) continue;
    let artifact: CanvasArtifact | undefined;
    const urlList = (value: unknown): CanvasMediaReference[] => (Array.isArray(value) ? value : typeof value === "string" ? value.split(/\r?\n/) : []).filter((url): url is string => typeof url === "string" && Boolean(url.trim())).map((url) => ({ url: url.trim() }));
    if (["input.images", "input.library-images"].includes(node.type)) artifact = { kind: "images", items: urlList(node.config.urls) };
    else if (node.type === "input.videos") artifact = { kind: "videos", items: urlList(node.config.urls) };
    else if (node.type === "input.video-loader") {
      const item = selectedCanvasVideo(node.config);
      if (item) artifact = { kind: "videos", items: [{ url: item.url, name: item.filename, width: item.width, height: item.height, durationSeconds: item.durationSeconds, hasAudio: item.hasAudio }] };
    } else if (node.type === "input.source-video") {
      const item = canvasSourceVideoSnapshotFromConfig(node.config);
      if (item && isCanvasSourceVideoSnapshotCurrent(node.config)) artifact = { kind: "videos", items: [item] };
    } else if (node.type === "input.content-pool") {
      if (edge.sourcePort === "images") artifact = { kind: "images", items: urlList(node.config.snapshotImageUrls) };
      if (edge.sourcePort === "videos") artifact = { kind: "videos", items: urlList(node.config.snapshotVideoUrls) };
    } else artifact = node.frozenOutputs?.[edge.sourcePort as "images" | "text"] || runs.get(node.id)?.outputs[edge.sourcePort];
    if (artifact) artifact = bindComposeInput(artifact, edge.source, edge.sourcePort);
    if (artifact?.kind === "images" && edge.targetPort === "images") images.push(...artifact.items);
    if (artifact?.kind === "videos" && edge.targetPort === "videos") videos.push(...artifact.items);
  }
  return composeSources(images, videos);
}
