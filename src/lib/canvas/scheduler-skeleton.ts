import { createCanvasNode } from "./registry";
import type { CanvasEdge, CanvasGraph, CanvasNode, CanvasNodeType, CanvasSchedulerRole } from "./types";

type SkeletonNodeSpec = {
  key: string;
  type: CanvasNodeType;
  offset: { x: number; y: number };
  label: string;
  schedulerRole?: CanvasSchedulerRole;
};

const skeletonNodeSpecs: SkeletonNodeSpec[] = [
  { key: "scene", type: "input.library-images", offset: { x: 0, y: 0 }, label: "场景素材", schedulerRole: "scene-input" },
  { key: "vehicle", type: "input.library-images", offset: { x: 0, y: 260 }, label: "车型素材", schedulerRole: "vehicle-input" },
  { key: "prompt1", type: "input.text", offset: { x: 360, y: 0 }, label: "提示词 1" },
  { key: "prompt2", type: "input.text", offset: { x: 360, y: 210 }, label: "提示词 2" },
  { key: "prompt3", type: "input.text", offset: { x: 360, y: 420 }, label: "提示词 3" },
  { key: "switch", type: "utility.prompt-switch", offset: { x: 720, y: 190 }, label: "提示词 Switch", schedulerRole: "prompt-switch" },
  { key: "image", type: "model.gpt-image", offset: { x: 1080, y: 190 }, label: "批量图片生成", schedulerRole: "image-target" },
  { key: "copy", type: "input.copy-library", offset: { x: 1080, y: 520 }, label: "文案库输入", schedulerRole: "copy-input" },
  { key: "copyTitle", type: "model.gpt-text", offset: { x: 1440, y: 480 }, label: "GPT 标题二创" },
  { key: "copyBody", type: "model.gpt-text", offset: { x: 1440, y: 720 }, label: "GPT 正文二创" },
  { key: "content", type: "compose.social-post", offset: { x: 1800, y: 300 }, label: "图文内容", schedulerRole: "content-target" },
];

const skeletonEdgeSpecs = [
  ["prompt1", "text", "switch", "input1"],
  ["prompt2", "text", "switch", "input2"],
  ["prompt3", "text", "switch", "input3"],
  ["switch", "text", "image", "prompt"],
  ["scene", "images", "image", "references"],
  ["vehicle", "images", "image", "references"],
  ["image", "images", "content", "images"],
  ["copy", "title", "copyTitle", "prompt"],
  ["copy", "body", "copyBody", "prompt"],
  ["copyTitle", "text", "content", "title"],
  ["copyBody", "text", "content", "body"],
] as const;

export function createCanvasSchedulerSkeleton(
  graph: CanvasGraph,
  origin: { x: number; y: number },
  createId: (kind: "node" | "edge", key: string, index: number) => string = defaultSkeletonId,
): CanvasGraph {
  if (graph.nodes.some((node) => node.schedulerRole)) {
    throw new Error("画布已包含调度角色，请先检查现有调度结构。");
  }

  const ids = new Map<string, string>();
  const nodes = skeletonNodeSpecs.map((spec, index): CanvasNode => {
    const id = createId("node", spec.key, index);
    ids.set(spec.key, id);
    const node = createCanvasNode(spec.type, id, { x: origin.x + spec.offset.x, y: origin.y + spec.offset.y });
    return {
      ...node,
      config: spec.key === "copyTitle"
        ? { ...node.config, instruction: "请基于输入标题进行二次创作，保留核心信息，输出一个简洁、有吸引力的社交媒体标题，只输出标题。" }
        : spec.key === "copyBody"
          ? { ...node.config, instruction: "请基于输入正文进行二次创作，保留事实与核心观点，改写为结构清晰、可直接发布的中文社交媒体正文，只输出正文。" }
          : node.config,
      label: spec.label,
      schedulerRole: spec.schedulerRole,
    };
  });
  const edges = skeletonEdgeSpecs.map(([source, sourcePort, target, targetPort], index): CanvasEdge => ({
    id: createId("edge", `${source}-${target}`, index),
    source: ids.get(source)!,
    sourcePort,
    target: ids.get(target)!,
    targetPort,
  }));
  return {
    ...structuredClone(graph),
    nodes: [...graph.nodes, ...nodes],
    edges: [...graph.edges, ...edges],
  };
}

function defaultSkeletonId(kind: "node" | "edge", key: string, index: number) {
  return `scheduler-${kind}-${key}-${Date.now()}-${index}`;
}
