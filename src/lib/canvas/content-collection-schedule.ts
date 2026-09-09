import { canvasCollectionLinks } from "./content-collection";
import { getCanvasNodeDefinition } from "./registry";
import type { CanvasGraph, CanvasScheduleV2Definition } from "./types";

export function canvasCollectionScheduleDefinition(graph: CanvasGraph): CanvasScheduleV2Definition | undefined {
  const sources = graph.nodes.filter((node) => node.type === "input.content-collection");
  if (sources.length !== 1) return undefined;
  const source = sources[0];
  const pending = [source.id];
  const reached = new Set<string>();
  while (pending.length) {
    const nodeId = pending.shift()!;
    if (reached.has(nodeId)) continue;
    reached.add(nodeId);
    pending.push(...graph.edges.filter((edge) => edge.source === nodeId).map((edge) => edge.target));
  }
  const candidates = [...reached].reverse().flatMap((nodeId) => {
    const node = graph.nodes.find((candidate) => candidate.id === nodeId)!;
    const definition = getCanvasNodeDefinition(node.type, node.version);
    if (definition?.capability === "external_write" || definition?.passiveSink) return [];
    const port = definition?.outputs.find((output) => ["text", "images", "videos"].includes(output.kind));
    return port ? [{ node, port }] : [];
  });
  const target = candidates.find(({ node }) => node.schedulerRole === "image-target") || candidates[0];
  if (!target) return undefined;
  const artifactKind = target.port.kind;
  if (artifactKind !== "text" && artifactKind !== "images" && artifactKind !== "videos") return undefined;
  return {
    parameters: [{
      id: `collection-${source.id}`,
      name: "来源链接",
      scope: "main",
      valueType: "text",
      source: { mode: "manual-list", values: canvasCollectionLinks(source.config.links) },
      expansion: "each",
      binding: { nodeId: source.id, fieldKey: "sourceLink" },
    }],
    expansion: { main: "cartesian", child: "cartesian" },
    sharedOutputs: target.node.id === source.id ? [] : getCanvasNodeDefinition(source.type, source.version)!.outputs.map((port) => ({
      nodeId: source.id, outputPort: port.id, artifactKind: port.kind as "text" | "images" | "videos",
    })),
    childResult: { nodeId: target.node.id, outputPort: target.port.id, artifactKind },
    aggregationPolicy: "all",
  };
}
