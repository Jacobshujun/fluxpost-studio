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
  return {
    id: `post-${source.id}`,
    sourceItemId: source.id,
    platform: source.platform,
    title: "把普通素材做成高点击图文，我会先改这 3 个地方",
    body:
      "很多图文不是内容不行，而是第一眼没有让用户停下来。\n\n我的处理顺序是：先确定一个强视觉焦点，再把标题压缩成一句有结果感的话，最后让正文只解释一个核心判断。\n\n如果素材本身比较生活化，可以保留真实感，但背景、光线和画面层级要更干净。这样既不像硬广，也更容易被收藏。",
    imagePrompt:
      "社交媒体图文封面，保留用户提供素材的主体，背景改为干净的城市工作室，玻璃反光，高级编辑台氛围，清晰可读的中文标题区域，真实摄影质感",
    imageUrls: [],
    videoUrls: includeSourceVideo ? resolveSourceVideoUrls(source) : [],
    productionPlanOverride: source.productionPlan,
    imageTasks: buildDefaultImageTasks(source),
    materialPaths,
    status: "draft",
    aiNotes: ["当前为未配置 OpenAI API Key 时生成的本地演示草稿。", "接入模型后会返回结构化仿写策略和图片 prompt。"],
    updatedAt: new Date().toISOString(),
  };
}
