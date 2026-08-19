import type { CanvasArtifact, CanvasGraph, CanvasNode, CanvasNodeConfig } from "./types";

const markerPattern = /\{\{seedance-image:([A-Za-z0-9_-]{1,80})\}\}/g;
const markerPrefix = "{{seedance-image:";

export type SeedancePromptPart =
  | { kind: "text"; value: string }
  | { kind: "mention"; id: string };

export type SeedanceFixedReference = {
  url: string;
  source: "direct" | "upstream";
  sourceNodeId?: string;
};

export type ResolvedSeedanceInput = {
  prompt: string;
  images: string[];
  promptSource: "node" | "upstream";
};

export function seedanceMentionMarker(id: string) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error("Seedance mention ID is invalid.");
  return `${markerPrefix}${id}}}`;
}

export function parseSeedancePromptDocument(document: string): SeedancePromptPart[] {
  const parts: SeedancePromptPart[] = [];
  let cursor = 0;
  for (const match of document.matchAll(markerPattern)) {
    const index = match.index || 0;
    if (index > cursor) parts.push({ kind: "text", value: document.slice(cursor, index) });
    parts.push({ kind: "mention", id: match[1] });
    cursor = index + match[0].length;
  }
  if (cursor < document.length) parts.push({ kind: "text", value: document.slice(cursor) });
  return parts.length ? parts : [{ kind: "text", value: "" }];
}

export function seedanceMentionIds(document: string) {
  return parseSeedancePromptDocument(document)
    .filter((part): part is Extract<SeedancePromptPart, { kind: "mention" }> => part.kind === "mention")
    .map((part) => part.id);
}

export function seedanceMentionBindings(config: CanvasNodeConfig) {
  const ids = stringArray(config.mentionIds);
  const urls = stringArray(config.mentionUrls);
  return ids.map((id, index) => ({ id, url: urls[index] || "" }));
}

export function validateSeedanceReferenceConfig(config: CanvasNodeConfig) {
  const errors: string[] = [];
  const direct = normalizeUrls(config.referenceUrls);
  const ids = stringArray(config.mentionIds);
  const urls = stringArray(config.mentionUrls);
  const document = String(config.prompt || "");
  if (config.referenceUrls !== undefined && !Array.isArray(config.referenceUrls)) errors.push("Seedance direct references must be a URL list.");
  if (config.mentionIds !== undefined && !Array.isArray(config.mentionIds)) errors.push("Seedance mention IDs must be a string list.");
  if (config.mentionUrls !== undefined && !Array.isArray(config.mentionUrls)) errors.push("Seedance mention URLs must be a string list.");
  if (direct.length > 9) errors.push("Seedance direct reference images cannot exceed 9.");
  if (ids.length !== urls.length) errors.push("Seedance mention bindings are incomplete.");
  if (new Set(ids).size !== ids.length) errors.push("Seedance mention IDs must be unique.");
  if (ids.some((id) => !/^[A-Za-z0-9_-]{1,80}$/.test(id))) errors.push("Seedance mention ID is invalid.");
  if (urls.some((url) => !url.trim())) errors.push("Seedance mention URL cannot be empty.");
  const withoutValidMarkers = document.replace(markerPattern, "");
  if (withoutValidMarkers.includes(markerPrefix)) errors.push("Seedance Prompt contains a malformed image mention.");
  return errors;
}

export function resolveSeedanceFixedReferences(graph: CanvasGraph, nodeId: string): SeedanceFixedReference[] {
  const node = graph.nodes.find((item) => item.id === nodeId && item.type === "model.seedance");
  if (!node) return [];
  const references: SeedanceFixedReference[] = normalizeUrls(node.config.referenceUrls).map((url) => ({ url, source: "direct" }));
  const nodes = new Map(graph.nodes.map((item) => [item.id, item]));
  for (const edge of graph.edges.filter((item) => item.target === nodeId && item.targetPort === "images")) {
    const source = nodes.get(edge.source);
    if (!source || (source.type !== "input.images" && source.type !== "input.library-images")) continue;
    for (const url of normalizeUrls(source.config.urls)) references.push({ url, source: "upstream", sourceNodeId: source.id });
  }
  return uniqueReferences(references);
}

export function orderSeedanceFixedReferences(config: CanvasNodeConfig, references: SeedanceFixedReference[]) {
  const unique = uniqueReferences(references);
  const byUrl = new Map(unique.map((reference) => [reference.url, reference]));
  const available = new Set(byUrl.keys());
  const direct = normalizeUrls(config.referenceUrls).filter((url) => available.has(url));
  const bindings = new Map(seedanceMentionBindings(config).map((binding) => [binding.id, binding.url]));
  const mentioned = uniqueStrings(seedanceMentionIds(String(config.prompt || ""))
    .map((id) => bindings.get(id) || "")
    .filter((url) => available.has(url)));
  return uniqueStrings([...direct, ...mentioned, ...unique.map((reference) => reference.url)])
    .map((url) => byUrl.get(url))
    .filter((reference): reference is SeedanceFixedReference => Boolean(reference));
}

export function validateSeedanceGraphNode(graph: CanvasGraph, node: CanvasNode) {
  const errors: string[] = [];
  const localPrompt = String(node.config.prompt || "").trim();
  const promptEdges = graph.edges.filter((edge) => edge.target === node.id && edge.targetPort === "prompt");
  if (!localPrompt && !promptEdges.length) errors.push("Seedance requires a node Prompt or an upstream Prompt input.");
  if (localPrompt && promptEdges.some((edge) => upstreamPromptCanProduceText(graph, edge.source))) {
    errors.push("Seedance cannot use a node Prompt and an upstream Prompt at the same time.");
  }
  if (localPrompt) {
    try {
      resolveSeedanceInput(node.config, [], resolveSeedanceFixedReferences(graph, node.id).map((item) => item.url));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Seedance image mentions are invalid.");
    }
  }
  return errors;
}

export function resolveSeedanceInput(
  config: CanvasNodeConfig,
  promptArtifacts: CanvasArtifact[] | undefined,
  upstreamImages: string[],
): ResolvedSeedanceInput {
  const configErrors = validateSeedanceReferenceConfig(config);
  if (configErrors.length) throw new Error(configErrors.join(" "));
  const document = String(config.prompt || "");
  const localPrompt = promptDocumentHasContent(document);
  const upstreamPrompt = (promptArtifacts || [])
    .filter((artifact): artifact is Extract<CanvasArtifact, { kind: "text" }> => artifact.kind === "text")
    .map((artifact) => artifact.value.trim())
    .filter(Boolean)
    .join("\n\n");
  if (localPrompt && upstreamPrompt) throw new Error("Seedance cannot use a node Prompt and an upstream Prompt at the same time.");
  if (!localPrompt && !upstreamPrompt) throw new Error("Seedance requires a node Prompt or an upstream Prompt input.");

  const direct = normalizeUrls(config.referenceUrls);
  const upstream = normalizeUrls(upstreamImages);
  const available = new Set([...direct, ...upstream]);
  const bindingMap = new Map(seedanceMentionBindings(config).map((binding) => [binding.id, binding.url]));
  const activeIds = uniqueStrings(seedanceMentionIds(document));
  const mentionedUrls = activeIds.map((id) => {
    const url = bindingMap.get(id);
    if (!url) throw new Error(`Seedance image mention ${id} has no binding.`);
    if (!available.has(url)) throw new Error(`Seedance image mention ${id} refers to a removed image.`);
    return url;
  });
  const images = uniqueStrings([...direct, ...mentionedUrls, ...upstream]);
  if (images.length > 9) throw new Error(`Seedance accepts at most 9 images; resolved ${images.length}.`);

  if (!localPrompt) return { prompt: upstreamPrompt, images, promptSource: "upstream" };
  const imageNumber = new Map(images.map((url, index) => [url, index + 1]));
  const prompt = parseSeedancePromptDocument(document).map((part) => {
    if (part.kind === "text") return part.value;
    const url = bindingMap.get(part.id);
    const number = url ? imageNumber.get(url) : undefined;
    if (!url || !number) throw new Error(`Seedance image mention ${part.id} is invalid.`);
    return `图片${number}`;
  }).join("").trim();
  if (!prompt) throw new Error("Seedance Prompt cannot be empty.");
  if (prompt.length > 2000) throw new Error("Seedance Prompt must be 2000 characters or fewer.");
  return { prompt, images, promptSource: "node" };
}

export function promptDocumentHasContent(document: string) {
  return parseSeedancePromptDocument(document).some((part) => part.kind === "mention" || part.value.trim());
}

export function normalizeSeedanceReferenceUrls(value: CanvasNodeConfig[string]) {
  return normalizeUrls(value);
}

function upstreamPromptCanProduceText(graph: CanvasGraph, nodeId: string) {
  const source = graph.nodes.find((node) => node.id === nodeId);
  return source?.type !== "input.text" || Boolean(String(source.config.text || "").trim());
}

function uniqueReferences(references: SeedanceFixedReference[]) {
  const seen = new Set<string>();
  return references.filter((reference) => reference.url && !seen.has(reference.url) && Boolean(seen.add(reference.url)));
}

function normalizeUrls(value: CanvasNodeConfig[string] | string[]) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\r?\n/) : [];
  return uniqueStrings(values.map((item) => item.trim()).filter(Boolean));
}

function stringArray(value: CanvasNodeConfig[string]) {
  return Array.isArray(value) ? value.map(String) : [];
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}
