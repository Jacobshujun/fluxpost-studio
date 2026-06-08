import type { ContentDirection, NormalizedSourceItem, ProductionPlan } from "./types";

const xpengTerms = [
  "小鹏",
  "xpeng",
  "小鹏汽车",
  "小鹏g6",
  "小鹏g9",
  "小鹏x9",
  "小鹏p7",
  "p7+",
  "mona",
  "g6",
  "g9",
  "x9",
];

const competitorTerms = [
  "特斯拉",
  "tesla",
  "model y",
  "model 3",
  "理想",
  "蔚来",
  "问界",
  "小米汽车",
  "su7",
  "极氪",
  "比亚迪",
  "腾势",
  "智界",
  "阿维塔",
  "岚图",
  "零跑",
  "深蓝",
  "智己",
  "鸿蒙智行",
];

const industryTerms = ["行业", "车市", "销量", "价格战", "新能源", "智能驾驶", "智驾", "车企", "市场", "政策", "补贴"];

export function buildProductionPlan(item: NormalizedSourceItem): ProductionPlan {
  const direction = detectContentDirection(item);
  const hasVideo = hasVideoSignal(item);
  const hasImage = hasImageSignal(item);

  if (hasVideo && direction === "competitor") {
    return {
      contentDirection: direction,
      decision: "observe_only",
      reason: "竞品视频不进入制作流程，仅保留为趋势观察和选题参考。",
      textStrategy: "not_adopt",
      imageStrategy: "not_adopt",
      materialRequirements: {
        vehicleDocs: false,
        vehicleImages: false,
        sourceImages: false,
        videoKeyframes: true,
        videoPublicPoints: true,
      },
      promptGuidance: {
        textBrief: "不生成正文。仅归档视频信息点，供后续人工观察。",
        imageBrief: "不生成图片。竞品视频关键帧不进入发布素材。",
      },
      workflow: ["归档观察", "不生成草稿", "不写入飞书"],
      riskFlags: ["competitor_video_blocked"],
    };
  }

  if (hasVideo) {
    return {
      contentDirection: direction,
      decision: direction === "unknown" ? "needs_review" : "adopt",
      reason: "视频内容先提取公开信息要点和关键画面，再结合可用素材重构为图文。",
      textStrategy: "video_extract_rewrite",
      imageStrategy: "video_keyframe_reference",
      materialRequirements: {
        vehicleDocs: direction === "xpeng" || direction === "industry",
        vehicleImages: direction === "xpeng" || direction === "industry",
        sourceImages: false,
        videoKeyframes: true,
        videoPublicPoints: true,
      },
      promptGuidance: {
        textBrief: "先提取视频公开信息点，再用平台语感重构为原创图文，不复用原视频口播句式。",
        imageBrief: "视频关键帧只作为画面参考；需要发布图片时，优先使用自有车型素材或重新设计画面。",
      },
      workflow: ["提取视频信息点", "参考关键帧", "生成图文 Brief", "生成草稿", "进入批量审查"],
      riskFlags: direction === "unknown" ? ["direction_needs_review"] : [],
    };
  }

  if (direction === "industry") {
    return {
      contentDirection: direction,
      decision: "adopt",
      reason: "行业图文直接进行洗稿和洗图，不结合车型资料。",
      textStrategy: "source_rewrite",
      imageStrategy: hasImage ? "redesign_source_image" : "none",
      materialRequirements: {
        vehicleDocs: false,
        vehicleImages: false,
        sourceImages: hasImage,
        videoKeyframes: false,
        videoPublicPoints: false,
      },
      promptGuidance: {
        textBrief: "基于原文行业信息点重写，保留事实，重排结构和表达，增强真实社媒语感。",
        imageBrief: hasImage ? "根据图上的行业信息重新设计整张图片，保留核心信息但更换排版、风格和视觉层级。" : "无原图时不生成洗图任务。",
      },
      workflow: ["提取行业信息", "文案洗稿", "图片洗图", "生成草稿", "进入批量审查"],
      riskFlags: [],
    };
  }

  if (direction === "competitor") {
    return {
      contentDirection: direction,
      decision: "adopt",
      reason: "竞品图文只学习创意和观点，用小鹏车型资料与图片素材重新表达。",
      textStrategy: "creative_reframe_with_xpeng",
      imageStrategy: "creative_analysis_rebuild_with_xpeng_assets",
      materialRequirements: {
        vehicleDocs: true,
        vehicleImages: true,
        sourceImages: hasImage,
        videoKeyframes: false,
        videoPublicPoints: false,
      },
      promptGuidance: {
        textBrief: "提炼竞品图文的观点和用户痛点，改写成小鹏视角的原创表达，不复用竞品句式。",
        imageBrief: "先分析竞品图片创意，再使用小鹏车型图片和车型资料重构新图，不直接洗竞品图。",
      },
      workflow: ["分析竞品观点", "拆解图片创意", "匹配小鹏素材", "重构图文", "进入批量审查"],
      riskFlags: ["competitor_material_rebuild_required"],
    };
  }

  if (direction === "xpeng") {
    return {
      contentDirection: direction,
      decision: "adopt",
      reason: "小鹏内容结合车型资料和图片素材进行原创内容创作。",
      textStrategy: "xpeng_original_from_materials",
      imageStrategy: hasImage ? "redesign_source_or_xpeng_assets" : "creative_analysis_rebuild_with_xpeng_assets",
      materialRequirements: {
        vehicleDocs: true,
        vehicleImages: true,
        sourceImages: hasImage,
        videoKeyframes: false,
        videoPublicPoints: false,
      },
      promptGuidance: {
        textBrief: "学习原内容的表达节奏，用小鹏车型资料和参数生成原创图文，不照搬原文结构。",
        imageBrief: hasImage ? "可根据原图信息重设计，也可结合小鹏车型素材重新生成。" : "使用小鹏车型素材和资料生成图片创意。",
      },
      workflow: ["匹配车型资料", "匹配车型图片", "生成图文 Brief", "生成草稿", "进入批量审查"],
      riskFlags: [],
    };
  }

  return {
    contentDirection: "unknown",
    decision: "needs_review",
    reason: "暂未识别内容方向，需要用户或 AI 二次确认后再批量制作。",
    textStrategy: "source_rewrite",
    imageStrategy: hasImage ? "redesign_source_image" : "none",
    materialRequirements: {
      vehicleDocs: false,
      vehicleImages: false,
      sourceImages: hasImage,
      videoKeyframes: false,
      videoPublicPoints: false,
    },
    promptGuidance: {
      textBrief: "先确认内容方向，再决定是否洗稿、原创创作或竞品重构。",
      imageBrief: "先确认内容方向，再决定图片洗图或创意重构。",
    },
    workflow: ["方向待确认", "暂缓批量生成"],
    riskFlags: ["direction_needs_review"],
  };
}

export function formatProductionPlanForPrompt(plan: ProductionPlan) {
  return [
    `内容方向: ${formatContentDirection(plan.contentDirection)}`,
    `制作决策: ${formatDecision(plan.decision)}`,
    `文案策略: ${formatTextStrategy(plan.textStrategy)}`,
    `图片策略: ${formatImageStrategy(plan.imageStrategy)}`,
    `车型资料: ${plan.materialRequirements.vehicleDocs ? "需要" : "不需要"}`,
    `车型图片: ${plan.materialRequirements.vehicleImages ? "需要" : "不需要"}`,
    `视频关键帧: ${plan.materialRequirements.videoKeyframes ? "需要" : "不需要"}`,
    `文案 Brief: ${plan.promptGuidance.textBrief}`,
    `图片 Brief: ${plan.promptGuidance.imageBrief}`,
    plan.riskFlags.length ? `风险标记: ${plan.riskFlags.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function detectContentDirection(item: NormalizedSourceItem): ContentDirection {
  const text = normalizeText([item.title, item.contentText, item.authorName, item.sourceUrl].filter(Boolean).join(" "));
  const hasXpeng = includesAny(text, xpengTerms);
  const hasCompetitor = includesAny(text, competitorTerms);
  const hasIndustry = includesAny(text, industryTerms);

  if (hasXpeng) return "xpeng";
  if (hasCompetitor) return "competitor";
  if (hasIndustry || text) return "industry";
  return "unknown";
}

function hasVideoSignal(item: NormalizedSourceItem) {
  return item.mediaType === "video" || Boolean(item.videoUrl || item.downloadedVideoUrl || item.videoFrames?.length);
}

function hasImageSignal(item: NormalizedSourceItem) {
  return item.mediaType === "image" || item.mediaType === "mixed" || Boolean(item.images.length || item.downloadedImages?.length);
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ");
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term.toLowerCase()));
}

function formatContentDirection(value: ProductionPlan["contentDirection"]) {
  const labels: Record<ProductionPlan["contentDirection"], string> = {
    industry: "行业",
    competitor: "竞品",
    xpeng: "小鹏",
    unknown: "待确认",
  };
  return labels[value];
}

function formatDecision(value: ProductionPlan["decision"]) {
  const labels: Record<ProductionPlan["decision"], string> = {
    adopt: "可制作",
    observe_only: "仅观察",
    needs_review: "待确认",
  };
  return labels[value];
}

function formatTextStrategy(value: ProductionPlan["textStrategy"]) {
  const labels: Record<ProductionPlan["textStrategy"], string> = {
    source_rewrite: "洗稿重写",
    xpeng_original_from_materials: "结合车型资料原创",
    creative_reframe_with_xpeng: "竞品观点转小鹏表达",
    video_extract_rewrite: "视频要点提取后重构",
    not_adopt: "不采用",
  };
  return labels[value];
}

function formatImageStrategy(value: ProductionPlan["imageStrategy"]) {
  const labels: Record<ProductionPlan["imageStrategy"], string> = {
    use_source_image: "原图引用",
    redesign_source_image: "原图洗图",
    redesign_source_or_xpeng_assets: "原图重设计/小鹏素材重构",
    creative_analysis_rebuild_with_xpeng_assets: "创意拆解后用小鹏素材重构",
    video_keyframe_reference: "关键帧参考",
    none: "无图片任务",
    not_adopt: "不采用",
  };
  return labels[value];
}
