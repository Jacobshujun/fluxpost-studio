import { createCanvasNode } from "./registry";
import type { CanvasEdge, CanvasGraph, CanvasNode } from "./types";

export const canvasWorkflowTemplateKeys = [
  "video-reconstruct-seedance",
  "video-reconstruct-gpt-image",
] as const;

export type CanvasWorkflowTemplateKey = (typeof canvasWorkflowTemplateKeys)[number];

export function isCanvasWorkflowTemplateKey(value: unknown): value is CanvasWorkflowTemplateKey {
  return canvasWorkflowTemplateKeys.includes(value as CanvasWorkflowTemplateKey);
}

export function createCanvasWorkflowTemplateGraph(templateKey: CanvasWorkflowTemplateKey): { name: string; graph: CanvasGraph } {
  const source = configuredNode("input.source-video", "source-video", { x: 80, y: 180 }, {}, "源视频");
  source.executionMode = "disabled";
  const prompt = configuredNode("input.text", "replacement-prompt", { x: 80, y: 460 }, {
    text: "请描述替代画面的主体、场景、动作、镜头和光线。",
  }, "替代画面提示词");
  const reconstruct = configuredNode("utility.video-reconstruct", "video-reconstruct", { x: 760, y: 220 }, {}, "视频内容重构");
  const display = configuredNode("utility.display-any", "result-display", { x: 1080, y: 220 }, {}, "重构结果");

  if (templateKey === "video-reconstruct-seedance") {
    const replacement = configuredNode("model.seedance", "replacement-seedance", { x: 410, y: 420 }, { duration: 10 }, "10 秒 Seedance");
    return {
      name: "视频重构 · Seedance",
      graph: graph([source, prompt, replacement, reconstruct, display], [
        edge("source-video", "videos", "video-reconstruct", "source"),
        edge("replacement-prompt", "text", "replacement-seedance", "prompt"),
        edge("replacement-seedance", "videos", "video-reconstruct", "replacement"),
        edge("video-reconstruct", "videos", "result-display", "value"),
      ]),
    };
  }

  const replacement = configuredNode("model.gpt-image", "replacement-gpt-image", { x: 410, y: 420 }, { count: 1 }, "GPT 替代画面");
  return {
    name: "视频重构 · GPT 图片",
    graph: graph([source, prompt, replacement, reconstruct, display], [
      edge("source-video", "videos", "video-reconstruct", "source"),
      edge("replacement-prompt", "text", "replacement-gpt-image", "prompt"),
      edge("replacement-gpt-image", "images", "video-reconstruct", "replacement"),
      edge("video-reconstruct", "videos", "result-display", "value"),
    ]),
  };
}

function configuredNode(type: CanvasNode["type"], id: string, position: CanvasNode["position"], config: CanvasNode["config"], label: string) {
  const node = createCanvasNode(type, id, position);
  return { ...node, label, config: { ...node.config, ...config } };
}

function edge(source: string, sourcePort: string, target: string, targetPort: string): CanvasEdge {
  return { id: `edge-${source}-${target}`, source, sourcePort, target, targetPort };
}

function graph(nodes: CanvasNode[], edges: CanvasEdge[]): CanvasGraph {
  return { nodes, edges, viewport: { x: 0, y: 0, zoom: 0.82 } };
}
