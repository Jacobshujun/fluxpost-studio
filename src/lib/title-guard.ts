export const minGeneratedTitleChars = 10;
export const maxGeneratedTitleChars = 20;

export type TitleLengthProfile = {
  label: string;
  min: number;
  max: number;
  guidance: string;
};

export const titleLengthProfiles: TitleLengthProfile[] = [
  { label: "短标题", min: 10, max: 13, guidance: "短促有钩子，适合一眼扫到重点。" },
  { label: "中标题", min: 14, max: 17, guidance: "信息密度更高，兼顾口语感和具体卖点。" },
  { label: "长标题", min: 18, max: 20, guidance: "像真实用户笔记标题，但必须压在 20 字以内。" },
];

export function pickTitleLengthProfile() {
  return titleLengthProfiles[Math.floor(Math.random() * titleLengthProfiles.length)] || titleLengthProfiles[1];
}

export function formatTitleStyleInstruction(profile: TitleLengthProfile) {
  return [
    `title 长度规则：本次采用${profile.label}，必须控制在 ${profile.min}-${profile.max} 个可见字符之间。`,
    `title 铁律：无论原标题、正文信息量或本次档位如何，最终 title 绝不能超过 ${maxGeneratedTitleChars} 个可见字符/汉字。`,
    `title 全局允许范围是 ${minGeneratedTitleChars}-${maxGeneratedTitleChars} 个可见字符，本次优先遵守上面的随机档位。`,
    "title 不要固定 12 字，也不要每次贴区间下限；在本次区间内按信息量自然变化。",
    `title 风格提示：${profile.guidance}`,
    "title 必须包含车型/颜色/场景/核心冲突中的至少两个信息点，不能只写泛情绪短句。",
    "title 避免只使用“有点”“看完了”“到了”“纠结了”等短口语收尾；需要保留真实用户语气，同时提高信息量。",
    "如果原标题信息不足，请从正文里提取车型、使用场景、价格/销量/颜色/试驾等具体信息补足 title。",
  ].join("\n");
}

export function normalizeGeneratedTitle(value: string) {
  return value.replace(/\s+/g, "").trim();
}

export function countVisibleTitleChars(value: string) {
  return Array.from(normalizeGeneratedTitle(value)).length;
}

export function isGeneratedTitleLengthValid(value: string, profile?: TitleLengthProfile) {
  const length = countVisibleTitleChars(value);
  const min = profile?.min ?? minGeneratedTitleChars;
  const profileMax = profile?.max ?? maxGeneratedTitleChars;
  const max = Math.min(profileMax, maxGeneratedTitleChars);
  return length >= min && length <= max;
}

export function clampGeneratedTitleMax(title: string, fallback = "未命名图文草稿") {
  const normalized = normalizeGeneratedTitle(title || fallback) || fallback;
  const chars = Array.from(normalized);
  return chars.length > maxGeneratedTitleChars ? chars.slice(0, maxGeneratedTitleChars).join("") : normalized;
}

export function fitTitleLength(title: string, profile: TitleLengthProfile) {
  let chars = Array.from(clampGeneratedTitleMax(title));
  const max = Math.min(profile.max, maxGeneratedTitleChars);
  if (chars.length > max) {
    chars = chars.slice(0, max);
  }
  while (chars.length < profile.min) {
    chars.push(...Array.from("真实体验"));
    if (chars.length > max) {
      chars = chars.slice(0, max);
      break;
    }
  }
  return chars.join("");
}
