import type { CanvasArtifact, CanvasNode } from "./types";

export const canvasCollectionPlatforms = ["auto", "wechat_channels", "xiaohongshu", "douyin", "weibo", "xiaopeng_bbs", "dongchedi"] as const;

export function canvasCollectionLinks(value: unknown): string[] {
  const lines = typeof value === "string" ? value.split(/\r?\n/) : [];
  return [...new Set(lines.map((line) => line.trim()).filter(Boolean))];
}

export function canvasCollectionSourceLink(config: CanvasNode["config"]): string {
  if (typeof config.sourceLink === "string" && config.sourceLink.trim()) return config.sourceLink.trim();
  const links = canvasCollectionLinks(config.links);
  return links.length === 1 ? links[0] : "";
}

export function validateCanvasCollectionConfig(config: CanvasNode["config"]): string[] {
  const errors: string[] = [];
  const links = canvasCollectionLinks(config.links);
  if (!canvasCollectionSourceLink(config)) errors.push(links.length > 1 ? "内容采集：请选择单条测试链接，或使用批量调度按链接运行。" : "内容采集：请输入来源链接或 ID。");
  if (links.length > 200) errors.push("内容采集最多支持 200 条链接。");
  if (/[\r\n]/.test(canvasCollectionSourceLink(config))) errors.push("每个内容任务只能采集一条链接。");
  if (typeof config.projectName !== "string" || !config.projectName.trim() || config.projectName.trim().length > 80) errors.push("内容池项目名称须为 1–80 个字符。");
  if (!canvasCollectionPlatforms.some((platform) => platform === config.platform)) errors.push("请选择支持的采集平台。");
  return errors;
}

export function freezeCanvasCollectionOutputs(node: CanvasNode, outputs: Record<string, CanvasArtifact>): CanvasNode {
  const { title, body, source, images, videos } = outputs;
  if (title?.kind !== "text" || body?.kind !== "text" || source?.kind !== "text" || images?.kind !== "images" || videos?.kind !== "videos") throw new Error("采集快照缺少标题、正文、来源、图片或视频端口。");
  return {
    ...node,
    type: "input.content-pool",
    version: 1,
    executionMode: "enabled",
    schedulerRole: undefined,
    config: {
      sourceItemId: node.id,
      snapshotTitle: title.value,
      snapshotBody: body.value,
      snapshotSourceUrl: source.value,
      snapshotImageUrls: images.items.map((item) => item.url),
      snapshotVideoUrls: videos.items.map((item) => item.url),
    },
  };
}
