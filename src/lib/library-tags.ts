import type {
  LibraryAsset,
  LibraryAssetRole,
  LibraryImageType,
  LibraryManualTagOverrides,
  LibraryPeoplePresence,
  LibraryTagProfile,
} from "./types";

type LibraryTagDimension = keyof LibraryManualTagOverrides;

export type LibraryUnifiedTag = {
  label: string;
  source: "ai" | "manual" | "ai_manual";
};

export const libraryImageTypeLabels: Record<LibraryImageType, string> = {
  exterior: "外观",
  interior: "内饰",
  detail: "细节",
  people_vehicle: "人车",
  lifestyle: "生活方式",
  event: "活动",
  poster_info: "海报/信息图",
  screenshot: "截图",
  comparison: "对比",
  other: "其他",
};

const libraryAngleLabels: Record<string, string> = {
  front: "正前",
  front_left_three_quarter: "左前 45°",
  left_side: "左侧",
  rear_left_three_quarter: "左后 45°",
  rear: "正后",
  rear_right_three_quarter: "右后 45°",
  right_side: "右侧",
  front_right_three_quarter: "右前 45°",
  top: "俯视",
  interior: "内饰视角",
  detail: "局部特写",
  multiple: "多角度",
  unknown: "未知角度",
};

const tagDimensions: LibraryTagDimension[] = [
  "imageType",
  "scenes",
  "vehicleModels",
  "vehicleColors",
  "angles",
  "people",
  "customTags",
];

export const libraryImageTypes: LibraryImageType[] = [
  "exterior",
  "interior",
  "detail",
  "people_vehicle",
  "lifestyle",
  "event",
  "poster_info",
  "screenshot",
  "comparison",
  "other",
];

export const libraryAngleOptions = [
  "front",
  "front_left_three_quarter",
  "left_side",
  "rear_left_three_quarter",
  "rear",
  "rear_right_three_quarter",
  "right_side",
  "front_right_three_quarter",
  "top",
  "interior",
  "detail",
  "multiple",
  "unknown",
] as const;

export const emptyLibraryTagProfile = (): LibraryTagProfile => ({
  scenes: [],
  vehicleModels: [],
  vehicleColors: [],
  angles: [],
  people: "unknown",
  customTags: [],
});

export function normalizeLibraryTagProfile(value: unknown, metadata: Partial<LibraryTagProfile> = {}): LibraryTagProfile {
  const record = isRecord(value) ? value : {};
  const imageType = normalizeImageType(record.imageType);
  return {
    ...(imageType ? { imageType } : {}),
    scenes: normalizeStringList(record.scenes, 8),
    vehicleModels: normalizeStringList(record.vehicleModels, 8),
    vehicleColors: normalizeStringList(record.vehicleColors, 8),
    angles: normalizeStringList(record.angles, 8),
    people: normalizePeople(record.people),
    customTags: normalizeStringList(record.customTags, 20),
    confidence: normalizeConfidence(record.confidence ?? metadata.confidence),
    model: normalizeOptionalString(metadata.model ?? record.model, 120),
    taggedAt: normalizeOptionalString(metadata.taggedAt ?? record.taggedAt, 64),
  };
}

export function normalizeLibraryManualOverrides(value: unknown): LibraryManualTagOverrides {
  const record = isRecord(value) ? value : {};
  const next: LibraryManualTagOverrides = {};
  if (Object.prototype.hasOwnProperty.call(record, "imageType")) next.imageType = record.imageType === null ? null : normalizeImageType(record.imageType) || null;
  if (Object.prototype.hasOwnProperty.call(record, "scenes")) next.scenes = normalizeStringList(record.scenes, 8);
  if (Object.prototype.hasOwnProperty.call(record, "vehicleModels")) next.vehicleModels = normalizeStringList(record.vehicleModels, 8);
  if (Object.prototype.hasOwnProperty.call(record, "vehicleColors")) next.vehicleColors = normalizeStringList(record.vehicleColors, 8);
  if (Object.prototype.hasOwnProperty.call(record, "angles")) next.angles = normalizeStringList(record.angles, 8);
  if (Object.prototype.hasOwnProperty.call(record, "people")) next.people = record.people === null ? null : normalizePeople(record.people);
  if (Object.prototype.hasOwnProperty.call(record, "customTags")) next.customTags = normalizeStringList(record.customTags, 20);
  return next;
}

export function mergeLibraryTagProfile(aiTags: LibraryTagProfile, overrides: LibraryManualTagOverrides): LibraryTagProfile {
  const has = (key: keyof LibraryManualTagOverrides) => Object.prototype.hasOwnProperty.call(overrides, key);
  const imageType = has("imageType") ? overrides.imageType || undefined : aiTags.imageType;
  return {
    ...(imageType ? { imageType } : {}),
    scenes: has("scenes") ? overrides.scenes || [] : aiTags.scenes,
    vehicleModels: has("vehicleModels") ? overrides.vehicleModels || [] : aiTags.vehicleModels,
    vehicleColors: has("vehicleColors") ? overrides.vehicleColors || [] : aiTags.vehicleColors,
    angles: has("angles") ? overrides.angles || [] : aiTags.angles,
    people: has("people") ? overrides.people || "unknown" : aiTags.people,
    customTags: has("customTags") ? overrides.customTags || [] : aiTags.customTags,
    confidence: aiTags.confidence,
    model: aiTags.model,
    taggedAt: aiTags.taggedAt,
  };
}

export function getLibraryUnifiedTags(
  effectiveTags: LibraryTagProfile,
  manualOverrides: LibraryManualTagOverrides = {},
  aiTags?: LibraryTagProfile,
): LibraryUnifiedTag[] {
  const sources = new Map<string, LibraryUnifiedTag>();
  for (const dimension of tagDimensions) {
    const aiKeys = new Set(projectDimensionLabels(aiTags || effectiveTags, dimension).map(normalizeLibraryTagKey));
    for (const label of projectDimensionLabels(effectiveTags, dimension)) {
      const key = normalizeLibraryTagKey(label);
      const source = !hasOwn(manualOverrides, dimension) || aiKeys.has(key) ? "ai" : "manual";
      const existing = sources.get(key);
      if (!existing) sources.set(key, { label, source });
      else if (existing.source !== source) sources.set(key, { ...existing, source: "ai_manual" });
    }
  }
  return [...sources.values()];
}

export function getLibraryUnifiedTagLabels(tags: LibraryTagProfile) {
  return getLibraryUnifiedTags(tags).map((tag) => tag.label);
}

export function getLibraryTagProfileForRole(
  asset: Pick<LibraryAsset, "effectiveTags" | "manualOverrides">,
  role: LibraryAssetRole,
): LibraryTagProfile {
  if (role === "reference") return asset.effectiveTags;
  const overrides = normalizeLibraryManualOverrides(asset.manualOverrides);
  return {
    ...(overrides.imageType ? { imageType: overrides.imageType } : {}),
    scenes: overrides.scenes || [],
    vehicleModels: overrides.vehicleModels || [],
    vehicleColors: overrides.vehicleColors || [],
    angles: overrides.angles || [],
    people: overrides.people || "unknown",
    customTags: overrides.customTags || [],
  };
}

export function getLibraryUnifiedTagsForRole(
  asset: Pick<LibraryAsset, "aiTags" | "effectiveTags" | "manualOverrides">,
  role: LibraryAssetRole,
) {
  const profile = getLibraryTagProfileForRole(asset, role);
  return role === "reference"
    ? getLibraryUnifiedTags(profile, asset.manualOverrides, asset.aiTags)
    : getLibraryUnifiedTags(profile, normalizeLibraryManualOverrides(asset.manualOverrides), emptyLibraryTagProfile());
}

export function getLibraryUnifiedTagLabelsForRole(
  asset: Pick<LibraryAsset, "aiTags" | "effectiveTags" | "manualOverrides">,
  role: LibraryAssetRole,
) {
  return getLibraryUnifiedTagsForRole(asset, role).map((tag) => tag.label);
}

export function applyLibraryTagChanges(
  asset: { effectiveTags: LibraryTagProfile; manualOverrides: LibraryManualTagOverrides },
  input: { add?: string[]; remove?: string[] },
): LibraryManualTagOverrides {
  const overrides = { ...asset.manualOverrides };
  const removeKeys = new Set(normalizeStringList(input.remove).map(normalizeLibraryTagKey));
  if (removeKeys.size) {
    for (const dimension of tagDimensions) {
      const labels = projectDimensionLabels(asset.effectiveTags, dimension);
      if (!labels.some((label) => removeKeys.has(normalizeLibraryTagKey(label)))) continue;
      if (dimension === "imageType" || dimension === "people") {
        overrides[dimension] = null;
        continue;
      }
      const values = asset.effectiveTags[dimension].filter((value) => {
        const label = projectValueLabel(dimension, value);
        return !removeKeys.has(normalizeLibraryTagKey(label));
      });
      overrides[dimension] = values;
    }
  }

  const additions = normalizeStringList(input.add);
  if (additions.length) {
    const displayedKeys = new Set(getLibraryUnifiedTagLabels(asset.effectiveTags).map(normalizeLibraryTagKey));
    const newAdditions = additions.filter((label) => !displayedKeys.has(normalizeLibraryTagKey(label)) || removeKeys.has(normalizeLibraryTagKey(label)));
    if (!newAdditions.length) return normalizeLibraryManualOverrides(overrides);
    const current = hasOwn(overrides, "customTags") ? overrides.customTags || [] : asset.effectiveTags.customTags;
    const customTags = normalizeStringList([...current, ...newAdditions], 20);
    const customKeys = new Set(customTags.map(normalizeLibraryTagKey));
    const rejected = newAdditions.find((label) => !customKeys.has(normalizeLibraryTagKey(label)));
    if (rejected) throw new Error("Each image supports at most 20 custom tags.");
    overrides.customTags = customTags;
  }
  return normalizeLibraryManualOverrides(overrides);
}

export function matchesAllLibraryTags(tags: LibraryTagProfile, filters?: string[]) {
  if (!filters?.length) return true;
  const labels = new Set(getLibraryUnifiedTagLabels(tags).map(normalizeLibraryTagKey));
  return normalizeStringList(filters).every((filter) => labels.has(normalizeLibraryTagKey(filter)));
}

export function normalizeLibraryTagKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function buildLibraryTaggingPrompt(assetName: string) {
  return [
    "You label automotive reference images for a production asset library.",
    "Return one JSON object only. Do not return markdown.",
    `Asset name: ${assetName}`,
    `imageType must be one of: ${libraryImageTypes.join(", ")}.`,
    `angles may use: ${libraryAngleOptions.join(", ")}.`,
    "Use short normalized Chinese values for scenes, vehicleModels, vehicleColors, and customTags.",
    "people must be yes, no, or unknown. Do not guess a vehicle model when it is not visually reliable.",
    '{"imageType":"exterior","scenes":["城市道路"],"vehicleModels":["小鹏G6"],"vehicleColors":["白色"],"angles":["front_left_three_quarter"],"people":"no","customTags":["夜景"],"confidence":0.9}',
  ].join("\n");
}

export function normalizeStringList(value: unknown, limit = 20) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,，、\n]+/) : [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of values) {
    const label = typeof item === "string" ? item.trim().replace(/\s+/g, " ") : "";
    const key = normalizeLibraryTagKey(label);
    if (!label || seen.has(key)) continue;
    seen.add(key);
    result.push(label);
    if (result.length >= limit) break;
  }
  return result;
}

function projectDimensionLabels(tags: LibraryTagProfile, dimension: LibraryTagDimension) {
  if (dimension === "imageType") return tags.imageType ? [libraryImageTypeLabels[tags.imageType]] : [];
  if (dimension === "people") return tags.people === "yes" ? ["有人物"] : tags.people === "no" ? ["无人物"] : [];
  return tags[dimension].map((value) => projectValueLabel(dimension, value));
}

function projectValueLabel(dimension: Exclude<LibraryTagDimension, "imageType" | "people">, value: string) {
  return dimension === "angles" ? libraryAngleLabels[value] || value : value;
}

function hasOwn(value: object, key: PropertyKey) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeImageType(value: unknown): LibraryImageType | undefined {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return libraryImageTypes.includes(normalized as LibraryImageType) ? (normalized as LibraryImageType) : undefined;
}

function normalizePeople(value: unknown): LibraryPeoplePresence {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : value;
  if (normalized === true || normalized === "yes" || normalized === "有" || normalized === "是") return "yes";
  if (normalized === false || normalized === "no" || normalized === "无" || normalized === "否") return "no";
  return "unknown";
}

function normalizeConfidence(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : undefined;
}

function normalizeOptionalString(value: unknown, limit: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
