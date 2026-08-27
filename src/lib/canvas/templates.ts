import { createCanvasNode } from "./registry";
import type { CanvasEdge, CanvasGraph, CanvasNode } from "./types";

export const canvasWorkflowTemplateKeys = [
  "video-reconstruct-seedance",
  "video-reconstruct-gpt-image",
  "competitor-workbook-posts",
  "directory-group-slideshow",
] as const;

export type CanvasWorkflowTemplateKey = (typeof canvasWorkflowTemplateKeys)[number];

export function isCanvasWorkflowTemplateKey(value: unknown): value is CanvasWorkflowTemplateKey {
  return canvasWorkflowTemplateKeys.includes(value as CanvasWorkflowTemplateKey);
}

export function createCanvasWorkflowTemplateGraph(templateKey: CanvasWorkflowTemplateKey): { name: string; graph: CanvasGraph } {
  if (templateKey === "directory-group-slideshow") {
    const directory = configuredNode("input.local-directory", "local-directory", { x: 70, y: 220 }, {}, "本地目录");
    const title = configuredNode("input.text", "slideshow-title", { x: 70, y: 520 }, { text: "" }, "标题");
    const body = configuredNode("input.text", "slideshow-body", { x: 70, y: 700 }, { text: "" }, "正文");
    const slideshow = configuredNode("utility.image-slideshow", "image-slideshow", { x: 460, y: 300 }, {}, "图片合成视频");
    const compose = configuredNode("compose.social-post", "review-draft", { x: 850, y: 280 }, {}, "内容组装");
    return { name: "目录分组成片", graph: graph([directory, title, body, slideshow, compose], [
      edge("local-directory", "images", "image-slideshow", "images"),
      edge("local-directory", "audios", "image-slideshow", "audio"),
      edge("slideshow-title", "text", "image-slideshow", "title"),
      edge("slideshow-body", "text", "image-slideshow", "body"),
      edge("slideshow-title", "text", "review-draft", "title"),
      edge("slideshow-body", "text", "review-draft", "body"),
      edge("local-directory", "images", "review-draft", "images"),
      edge("image-slideshow", "videos", "review-draft", "videos"),
    ]) };
  }
  if (templateKey === "competitor-workbook-posts") {
    const workbook = configuredNode("input.competitor-workbook", "competitor-workbook", { x: 70, y: 180 }, {}, "竞品 Excel 行");
    const references = configuredNode("input.library-images", "vehicle-references", { x: 70, y: 560 }, {}, "车型参考图");
    const prompt = configuredNode("utility.prompt-template", "card-prompt", { x: 410, y: 300 }, {
      preset: "custom",
      template: "请根据以下参数卡片生成一张汽车导购信息图。严格保留输入中的车型、价格、参数和数字，不添加输入中不存在的数据；车型外观以参考图为准；中文与数字必须清晰可读。\n\n{{input}}",
    }, "参数卡提示词");
    const image = configuredNode("model.gpt-image", "card-image", { x: 750, y: 300 }, { count: 1 }, "GPT-Image-2 参数图");
    const compose = configuredNode("compose.social-post", "review-draft", { x: 1080, y: 240 }, {}, "图文组装");
    return {
      name: "竞品 Excel 图文批量生成",
      graph: graph([workbook, references, prompt, image, compose], [
        edge("competitor-workbook", "card", "card-prompt", "values"),
        edge("card-prompt", "text", "card-image", "prompt"),
        edge("vehicle-references", "images", "card-image", "references"),
        edge("competitor-workbook", "title", "review-draft", "title"),
        edge("competitor-workbook", "body", "review-draft", "body"),
        edge("card-image", "images", "review-draft", "images"),
      ]),
    };
  }
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
