import { buildDefaultImageTasks } from "./creation-controls";
import { resolveSourceVideoUrls } from "./source-video-reference";
import type { GeneratedPost, NormalizedSourceItem, Platform } from "./types";

export function makeDemoSourceItems(platform: Platform, count: number): NormalizedSourceItem[] {
  const platformCopy: Record<Platform, string> = {
    wechat_channels: "视频号",
    xiaohongshu: "小红书",
    douyin: "抖音",
    weibo: "微博",
    feishu: "飞书",
    original: "原创",
    xiaopeng_bbs: "小鹏社区",
    dongchedi: "\u61c2\u8f66\u5e1d",
  };

  return Array.from({ length: Math.min(Math.max(count, 1), 8) }, (_, index) => ({
    id: `demo-${platform}-${index + 1}`,
    platform,
    sourceId: `demo-${index + 1}`,
    mediaType: index % 2 === 0 ? "image" : "video",
    sourceUrl: "https://example.com/demo",
    authorName: `${platformCopy[platform]}内容号`,
    title: index % 2 === 0 ? "3个让内容点击率起飞的封面细节" : "普通素材也能做出爆款图文",
    contentText:
      index % 2 === 0
        ? "先把视觉焦点收窄，再用一句强冲突标题制造停留。正文只保留一个观点，配图负责证明，结尾给用户一个轻动作。"
        : "这类内容的关键不是堆信息，而是把用户熟悉的痛点换成更具体的场景。标题先说结果，正文再拆步骤。",
    images: [],
    mediaUrls: ["https://example.com/demo"],
    crawledAt: new Date(Date.now() - index * 12 * 60 * 1000).toISOString(),
    publishedAt: new Date(Date.now() - (index + 1) * 3 * 60 * 60 * 1000).toISOString(),
    publishedLabel: `${index + 1}h ago`,
    metrics: {
      views: 82000 + index * 6900,
      reads: platform === "xiaohongshu" || platform === "weibo" ? 82000 + index * 6900 : undefined,
      plays: platform === "douyin" || platform === "wechat_channels" ? 82000 + index * 6900 : undefined,
      likes: 12000 + index * 1370,
      comments: 340 + index * 41,
      shares: 210 + index * 22,
      collects: 1600 + index * 83,
    },
    raw: { demo: true, publish_time: `${index + 1}h ago` },
  }));
}

export function makeDemoPost(source: NormalizedSourceItem, materialPaths: string[], includeSourceVideo = false): GeneratedPost {
  const title = typeof source.title === "string" ? source.title.trim() : "";
  const body = typeof source.contentText === "string" ? source.contentText.trim() : "";
  return {
    id: `post-${source.id}`,
    sourceItemId: source.id,
    platform: source.platform,
    title,
    body,
    imagePrompt:
      "社交媒体图文配图，保留用户提供素材的主体，背景干净现代，真实摄影质感，不添加文字、水印、二维码或额外品牌露出",
    imageUrls: [],
    videoUrls: includeSourceVideo ? resolveSourceVideoUrls(source) : [],
    imageTasks: buildDefaultImageTasks(source),
    materialPaths,
    status: "draft",
    aiNotes: [
      "当前为未配置 OpenAI API Key 时的本地回退，未改写不存在的源字段。",
      ...(!title ? ["采集内容没有可确认的标题，已保留标题为空。"] : []),
      ...(!body ? ["采集内容没有可确认的正文，已保留正文为空。"] : []),
    ],
    updatedAt: new Date().toISOString(),
  };
}
