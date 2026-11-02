import type { ContentPoolTagColor } from "./types";

export const CONTENT_POOL_CUSTOM_TAG_LIMIT = 20;
export const CONTENT_POOL_CUSTOM_TAG_LENGTH_LIMIT = 40;
export const contentPoolTagColorValues = ["mint", "cyan", "amber", "rose", "violet", "blue", "lime", "slate"] as const;
export const contentPoolTagColorHex: Record<ContentPoolTagColor, string> = {
  mint: "#36d399",
  cyan: "#22d3ee",
  amber: "#f4c55d",
  rose: "#ff566a",
  violet: "#a78bfa",
  blue: "#60a5fa",
  lime: "#a3e635",
  slate: "#94a3b8",
};

export class ContentPoolTagValidationError extends Error {}

export function contentPoolTagColor(key: string): ContentPoolTagColor {
  let hash = 0;
  for (const character of key) hash = (hash * 31 + (character.codePointAt(0) || 0)) >>> 0;
  return contentPoolTagColorValues[hash % contentPoolTagColorValues.length];
}

export function normalizeContentPoolTagColor(value: unknown): ContentPoolTagColor | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLocaleLowerCase();
  return contentPoolTagColorValues.includes(normalized as (typeof contentPoolTagColorValues)[number])
    ? (normalized as ContentPoolTagColor)
    : undefined;
}

export function normalizeContentPoolCustomTags(value: unknown, limit = CONTENT_POOL_CUSTOM_TAG_LIMIT) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ContentPoolTagValidationError("Custom tags must be an array.");
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (typeof candidate !== "string") throw new ContentPoolTagValidationError("Each custom tag must be text.");
    const label = normalizeContentPoolCustomTagLabel(candidate);
    if (!label) continue;
    if (Array.from(label).length > CONTENT_POOL_CUSTOM_TAG_LENGTH_LIMIT) {
      throw new ContentPoolTagValidationError(`Each custom tag must be ${CONTENT_POOL_CUSTOM_TAG_LENGTH_LIMIT} characters or fewer.`);
    }
    const key = contentPoolCustomTagKey(label);
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(label);
    if (tags.length > limit) {
      throw new ContentPoolTagValidationError(`Each content item supports at most ${limit} custom tags.`);
    }
  }
  return tags;
}

export function applyContentPoolCustomTagChanges(current: unknown, input: { add?: unknown; remove?: unknown }) {
  const existing = normalizeContentPoolCustomTags(current);
  const add = normalizeContentPoolCustomTags(input.add);
  const removeKeys = new Set(normalizeContentPoolCustomTags(input.remove).map(contentPoolCustomTagKey));
  return normalizeContentPoolCustomTags([
    ...existing.filter((label) => !removeKeys.has(contentPoolCustomTagKey(label))),
    ...add,
  ]);
}

export function matchesAllContentPoolCustomTags(value: unknown, filters: unknown) {
  const selected = normalizeContentPoolCustomTags(filters);
  if (!selected.length) return true;
  const itemKeys = new Set(normalizeContentPoolCustomTags(value).map(contentPoolCustomTagKey));
  return selected.every((label) => itemKeys.has(contentPoolCustomTagKey(label)));
}

export function contentPoolCustomTagKey(value: string) {
  return normalizeContentPoolCustomTagLabel(value).toLocaleLowerCase();
}

function normalizeContentPoolCustomTagLabel(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}
