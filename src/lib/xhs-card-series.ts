import type { ImageProviderProfile } from "./image-providers/contracts";
import { FINISHED_BODY_TARGET_INSTRUCTION } from "./finished-body-policy";
import type {
  OriginalBatchSettings,
  OriginalContentPlan,
  XhsCard,
  XhsCardRole,
  XhsLayout,
  XhsPalette,
  XhsStrategy,
  XhsStyle,
} from "./types";

export const XHS_CARD_SOURCE = {
  name: "baoyu-xhs-images",
  version: "2.0.1",
  commit: "6b7a2e417500561a5ecdd0b168332f4142584617",
} as const;

export const xhsStrategies = ["a", "b", "c"] as const satisfies readonly XhsStrategy[];
export const xhsStyles = ["cute", "fresh", "warm", "bold", "minimal", "retro", "pop", "notion", "chalkboard", "study-notes", "screen-print", "sketch-notes"] as const satisfies readonly XhsStyle[];
export const xhsLayouts = ["sparse", "balanced", "dense", "list", "comparison", "flow", "mindmap", "quadrant"] as const satisfies readonly XhsLayout[];
export const xhsPalettes = ["macaron", "warm", "neon"] as const satisfies readonly XhsPalette[];

const styleSpecs: Record<XhsStyle, string> = {
  cute: "甜美可爱，圆润手绘字，柔和粉彩与轻盈贴纸装饰",
  fresh: "清爽自然，明亮留白，轻线条和植物感色彩",
  warm: "温暖亲和，柔和暖色，生活化手绘场景",
  bold: "高冲击力，大标题、强对比色块和明确警示符号",
  minimal: "极简专业，克制配色、清晰网格和大量留白",
  retro: "复古印刷质感，怀旧配色与经典海报构图",
  pop: "高饱和流行视觉，活力形状与夸张重点",
  notion: "黑白线稿知识卡，少量柔和强调色，理性清晰",
  chalkboard: "彩色粉笔黑板风，教学感图示与手写标题",
  "study-notes": "真实手写学习笔记，蓝笔正文、红色批注和黄色高亮",
  "screen-print": "2-5 种平面色的丝网印刷海报，半调纹理，不使用渐变",
  "sketch-notes": "暖白底马卡龙手绘信息图，轻微抖动线条和分区图解",
};

const layoutSpecs: Record<XhsLayout, string> = {
  sparse: "1-2 个信息点，60%-70% 留白，单一视觉焦点",
  balanced: "3-4 个信息点，40%-50% 留白，标题置顶且分布均衡",
  dense: "5-8 个信息点，20%-30% 留白，用清晰网格与分区组织",
  list: "4-7 项纵向编号或清单，项目格式保持一致",
  comparison: "左右对称对比，中线明确，差异一眼可扫读",
  flow: "3-6 个节点按方向连接，用箭头表达步骤或时间线",
  mindmap: "中心主题向外辐射 4-8 个分支，层级清楚",
  quadrant: "2x2 四象限结构，轴线和分类标签明确",
};

const paletteSpecs: Record<XhsPalette, string> = {
  macaron: "暖白 #F5F0E8，浅蓝 #A8D8EA，薰衣草 #D5C6E0，薄荷 #B5E5CF，珊瑚 #E8655A",
  warm: "柔桃 #FFECD2，橙 #ED8936，陶土 #C05621，金黄 #F6AD55，赭色 #A0522D",
  neon: "深紫 #1A1025，青 #00F5FF，洋红 #FF00FF，荧光绿 #39FF14，黄 #FFFF00",
};

export const defaultOriginalBatchSettings: OriginalBatchSettings = {
  strategy: "auto",
  style: "auto",
  layout: "auto",
  palette: "auto",
  imageCount: "auto",
  webSearch: false,
};

export function buildOriginalPlanningPrompt(input: {
  topic: string;
  requirements?: string;
  vehicleKeyword?: string;
  settings: OriginalBatchSettings;
}) {
  return [
    "你是小红书原创图文策划专家。先策划，不写最终正文。",
    "只输出严格 JSON，字段为 contentType, targetAudience, hook, factBoundary, strategy, style, defaultLayout, palette, cards。",
    "strategy 只能是 a/b/c：a=故事驱动，b=信息密集，c=视觉优先。",
    `style 只能是 ${xhsStyles.join(", ")}；defaultLayout 和每张卡 layout 只能是 ${xhsLayouts.join(", ")}。`,
    "cards 每项字段为 role, layout, coreMessage, swipeHook；第一张必须 cover，最后一张必须 ending，中间为 content。",
    "根据内容复杂度规划 2-10 张；封面用 sparse，结尾用 sparse 或 balanced。每张只承担一个清晰信息任务。",
    "不得编造价格、配置、销量、政策、日期或测试数据；把不能确认的事实写入 factBoundary。",
    `用户策略覆盖：${JSON.stringify(input.settings)}`,
    `选题：${input.topic}`,
    `创作要求：${input.requirements || "无"}`,
    `车型/关键词：${input.vehicleKeyword || "未指定，按通用内容处理"}`,
  ].join("\n");
}

export function buildOriginalWritingPrompt(input: {
  topic: string;
  requirements?: string;
  vehicleKeyword?: string;
  plan: OriginalContentPlan;
}) {
  return [
    "你是小红书原创中文图文作者。严格根据冻结策划生成最终文案。",
    "只输出严格 JSON，字段为 title, body, contentTags, cards。",
    "cards 数量和顺序必须与策划一致，每项字段为 title, subtitle, points, visualConcept。",
    "标题简洁有钩子但不虚假夸张；正文自然分段，可直接发布；不要声称未验证的事实。",
    FINISHED_BODY_TARGET_INSTRUCTION,
    "卡片文字必须短、明确、适合直接画进图片；points 是字符串数组，不要塞入长段落。",
    `选题：${input.topic}`,
    `创作要求：${input.requirements || "无"}`,
    `车型/关键词：${input.vehicleKeyword || "无"}`,
    `冻结策划：${JSON.stringify(input.plan)}`,
  ].join("\n");
}

export function normalizeOriginalContentPlan(value: Record<string, unknown>, settings: OriginalBatchSettings): OriginalContentPlan {
  const rawCards = Array.isArray(value.cards) ? value.cards : [];
  const desiredCount = settings.imageCount === "auto" ? clampInteger(rawCards.length || 5, 2, 10) : clampInteger(settings.imageCount, 2, 10);
  const strategy = settings.strategy === "auto" ? enumValue(value.strategy, xhsStrategies, "b") : settings.strategy;
  const style = settings.style === "auto" ? enumValue(value.style, xhsStyles, "notion") : settings.style;
  const defaultLayout = settings.layout === "auto" ? enumValue(value.defaultLayout, xhsLayouts, "balanced") : settings.layout;
  const palette = settings.palette === "default" ? undefined : settings.palette === "auto" ? optionalEnumValue(value.palette, xhsPalettes) : settings.palette;
  const cards = Array.from({ length: desiredCount }, (_, index) => {
    const raw = isRecord(rawCards[index]) ? rawCards[index] : {};
    const role: XhsCardRole = index === 0 ? "cover" : index === desiredCount - 1 ? "ending" : "content";
    const fallbackLayout: XhsLayout = role === "cover" ? "sparse" : role === "ending" ? "balanced" : defaultLayout;
    return {
      role,
      layout: settings.layout === "auto" ? enumValue(raw.layout, xhsLayouts, fallbackLayout) : settings.layout,
      coreMessage: stringValue(raw.coreMessage, role === "cover" ? stringValue(value.hook, "核心主题") : role === "ending" ? "总结与行动建议" : `核心要点 ${index}`),
      swipeHook: role === "ending" ? undefined : optionalString(raw.swipeHook),
    };
  });
  return {
    contentType: stringValue(value.contentType, "原创分享"),
    targetAudience: stringArray(value.targetAudience).slice(0, 6),
    hook: stringValue(value.hook, "值得收藏的实用分享"),
    factBoundary: stringArray(value.factBoundary).slice(0, 12),
    strategy,
    style,
    defaultLayout,
    palette,
    cards,
  };
}

export function buildXhsCardsFromWriting(plan: OriginalContentPlan, writing: Record<string, unknown>): XhsCard[] {
  const rawCards = Array.isArray(writing.cards) ? writing.cards : [];
  return plan.cards.map((outline, index) => {
    const raw = isRecord(rawCards[index]) ? rawCards[index] : {};
    const id = `card-${String(index + 1).padStart(2, "0")}`;
    const title = stringValue(raw.title, outline.coreMessage);
    const subtitle = optionalString(raw.subtitle);
    const points = stringArray(raw.points).slice(0, 8);
    const card: XhsCard = {
      id,
      index,
      role: outline.role,
      layout: outline.layout,
      hook: index === 0 ? plan.hook : undefined,
      coreMessage: outline.coreMessage,
      title,
      subtitle,
      points,
      visualConcept: stringValue(raw.visualConcept, `围绕“${outline.coreMessage}”的手绘信息图`),
      swipeHook: outline.swipeHook,
      prompt: "",
      candidateUrls: [],
      status: "planned",
      qa: { status: "pending", attempts: 0, issues: [] },
    };
    return card;
  });
}

export function assembleXhsCardPrompt(input: {
  card: XhsCard;
  total: number;
  strategy: XhsStrategy;
  style: XhsStyle;
  palette?: XhsPalette;
}) {
  const { card } = input;
  const textLines = [card.title, card.subtitle, ...card.points].filter(Boolean);
  return [
    "生成一张小红书竖版信息图卡片。输出必须是完整位图，不使用外部字体覆盖或后期文字修补。",
    "画布优先 3:4 竖版；关键内容避开顶部右侧操作区和底部 10% 标题遮挡区。",
    `系列页：${card.index + 1}/${input.total}；页面角色：${card.role}；叙事策略：${input.strategy}。`,
    `视觉风格：${input.style}。${styleSpecs[input.style]}`,
    `信息布局：${card.layout}。${layoutSpecs[card.layout]}`,
    input.palette ? `配色覆盖：${input.palette}。${paletteSpecs[input.palette]}` : "配色使用所选风格的默认色系。",
    "所有中文必须清晰、可读、无乱码、无错别字；不要擅自增加标题、品牌、价格、参数或数据。",
    "保持明确的 H1/H2/正文层级，关键词可高亮，正文不要使用过小字号。",
    `核心信息：${card.coreMessage}`,
    `必须逐字呈现的文字：\n${textLines.map((line) => `- ${line}`).join("\n")}`,
    `视觉概念：${card.visualConcept}`,
    card.swipeHook ? `翻页衔接语：${card.swipeHook}` : "结尾保持干净，不添加虚构互动数据。",
  ].join("\n\n");
}

export function buildXhsQaPrompt(card: XhsCard) {
  const expected = [card.title, card.subtitle, ...card.points].filter(Boolean);
  return [
    "检查这张小红书信息图。只返回 JSON：{\"passed\":boolean,\"issues\":string[]}。",
    "passed 仅在以下条件全部满足时为 true：预期中文清楚且语义一致；无乱码/明显错别字；层级可读；关键内容不在顶部右侧或底部10%危险区；没有新增虚构数据。",
    `预期文字：${JSON.stringify(expected)}`,
    `页面角色：${card.role}；布局：${card.layout}。`,
  ].join("\n");
}

export function parseXhsQaResult(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Vision QA did not return JSON.");
  const value = JSON.parse(match[0]) as unknown;
  if (!isRecord(value) || typeof value.passed !== "boolean") throw new Error("Vision QA returned an invalid result.");
  return { passed: value.passed, issues: stringArray(value.issues).slice(0, 12) };
}

export function resolveXhsImageOptions(profile: ImageProviderProfile) {
  if (profile === "openai_json") return { size: "1024x1536", effectiveRatio: "2:3" as const };
  if (profile === "toapis_async") return { size: "1200x1600", ratio: "3:4", resolution: "2k" as const, effectiveRatio: "3:4" as const };
  return { size: "1200x1600", effectiveRatio: "3:4" as const };
}

export function isXhsStyle(value: unknown): value is XhsStyle { return xhsStyles.includes(value as XhsStyle); }
export function isXhsLayout(value: unknown): value is XhsLayout { return xhsLayouts.includes(value as XhsLayout); }
export function isXhsPalette(value: unknown): value is XhsPalette { return xhsPalettes.includes(value as XhsPalette); }
export function isXhsStrategy(value: unknown): value is XhsStrategy { return xhsStrategies.includes(value as XhsStrategy); }

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

function optionalEnumValue<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? value as T : undefined;
}

function clampInteger(value: unknown, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(Math.max(Math.floor(number), min), max);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [];
}
