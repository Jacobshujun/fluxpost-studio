export type ReviewMatch = "all" | "any";
export const reviewFields = ["title", "body", "taskKeyword", "imagePrompt", "vehicle", "author", "platform", "status", "createdAt", "updatedAt"] as const;
export type ReviewField = typeof reviewFields[number];
export const textOperators = ["contains", "notContains", "eq", "ne", "empty", "notEmpty"] as const;
export const datePresets = ["today", "yesterday", "thisWeek", "lastWeek", "thisMonth", "lastMonth", "7d", "30d", "lastDays"] as const;
export type DatePreset = typeof datePresets[number];
export type ReviewCondition = { field: ReviewField; op: string; value?: string | string[] | number; end?: string };
export type ReviewGroup = { match: ReviewMatch; children: (ReviewCondition | ReviewGroup)[] };
export type ReviewFilters = { version: 1; search: { field: "all" | "title" | "body" | "vehicle"; value: string }; match: ReviewMatch; groups: ReviewGroup[]; asOf?: string };
export const reviewPlatforms = ["xiaohongshu", "douyin", "weibo", "wechat_channels", "xiaopeng_bbs", "dongchedi", "feishu", "original"];
export const reviewStatuses = ["draft", "editing", "approved", "published"];
export class ReviewFilterError extends Error {}
const fail = (message: string): never => { throw new ReviewFilterError(message); };
const day = 86400000;
const offset = 8 * 3600000;
export const emptyReviewFilters = (): ReviewFilters => ({ version: 1, search: { field: "all", value: "" }, match: "all", groups: [] });
export const defaultReviewFilters = (): ReviewFilters => ({ ...emptyReviewFilters(), groups: [{ match: "all", children: [{ field: "status", op: "in", value: ["draft", "editing", "approved"] }] }] });

export function calendarDay(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail("日期必须是 YYYY-MM-DD");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return fail("日期无效");
  return date.getTime() - offset;
}

function instant(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return fail("时间边界必须是 ISO 日期或带时区的时间");
  calendarDay(value.slice(0, 10));
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return fail("时间边界无效");
  return time;
}

export function reviewTimeBounds(condition: ReviewCondition, asOf: string): { since?: string; until?: string } {
  const now = instant(asOf);
  if (!Number.isFinite(now)) return fail("时间基准无效");
  const date = new Date(now + offset);
  const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - offset;
  let start: number | undefined, end: number | undefined;
  if (condition.op === "preset") {
    const preset = condition.value;
    if (preset === "today") { start = today; end = today + day; }
    else if (preset === "yesterday") { start = today - day; end = today; }
    else if (preset === "thisWeek" || preset === "lastWeek") {
      start = today - ((date.getUTCDay() + 6) % 7) * day - (preset === "lastWeek" ? 7 * day : 0); end = start + 7 * day;
    } else if (preset === "thisMonth" || preset === "lastMonth") {
      const month = date.getUTCMonth() - (preset === "lastMonth" ? 1 : 0);
      start = Date.UTC(date.getUTCFullYear(), month, 1) - offset;
      end = Date.UTC(date.getUTCFullYear(), month + 1, 1) - offset;
    } else {
      const n = preset === "7d" ? 7 : preset === "30d" ? 30 : preset === "lastDays" ? Number(condition.end) : 0;
      if (!Number.isInteger(n) || n < 1 || n > 36500) return fail("近 N 天必须是 1–36500 的整数");
      start = today - (n - 1) * day; end = today + day;
    }
  } else if (condition.op === "interval") {
    // Exact legacy timestamps retain their original semantics.
    start = condition.value ? instant(String(condition.value)) : undefined;
    end = condition.end ? instant(condition.end) : undefined;
    if (start === undefined && end === undefined) return fail("时间边界不能为空");
  } else {
    const at = calendarDay(String(condition.value));
    if (condition.op === "before") end = at;
    else if (condition.op === "after") start = at + day;
    else { start = at; end = condition.op === "between" ? calendarDay(condition.end || "") + day : at + day; }
  }
  if ((start !== undefined && !Number.isFinite(start)) || (end !== undefined && !Number.isFinite(end)) || (start !== undefined && end !== undefined && start >= end)) return fail("时间范围无效或起止倒置");
  return { since: start === undefined ? undefined : new Date(start).toISOString(), until: end === undefined ? undefined : new Date(end).toISOString() };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("筛选结构无效");
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) fail("筛选包含未知属性");
}
function text(value: unknown, optional = false): string {
  if (typeof value !== "string" || value.length > 1000 || (!optional && !value.trim())) return fail("筛选值不能为空或超过 1000 字符");
  return value;
}
function match(value: unknown): ReviewMatch { return value === "all" || value === "any" ? value : fail("条件组合必须是全部或任一"); }

export function parseReviewFilters(raw: string): ReviewFilters {
  if (!raw || raw.length > 16000) return fail("筛选参数为空或超过 16000 字符");
  let input: unknown;
  try { input = JSON.parse(raw); } catch { return fail("筛选 JSON 无效"); }
  const root = object(input); keys(root, ["version", "search", "match", "groups", "asOf"]);
  if (root.version !== 1) return fail("不支持的筛选版本");
  const search = object(root.search); keys(search, ["field", "value"]);
  if (!["all", "title", "body", "vehicle"].includes(String(search.field))) return fail("搜索字段无效");
  const asOf = root.asOf === undefined ? undefined : text(root.asOf);
  if (asOf) instant(asOf);
  let count = 0, groups = 0;
  function group(input: unknown, depth: number): ReviewGroup {
    const value = object(input); keys(value, ["match", "children"]);
    if (depth > 2 || ++groups > 50 || !Array.isArray(value.children) || !value.children.length) return fail("最多两层组合且条件组不能为空");
    return { match: match(value.match), children: value.children.map((child) => {
      const row = object(child);
      if ("children" in row) return group(row, depth + 1);
      keys(row, ["field", "op", "value", "end"]);
      if (++count > 50) return fail("最多 50 条条件");
      if (!reviewFields.includes(row.field as ReviewField)) return fail("筛选字段无效");
      const field = row.field as ReviewField, op = text(row.op);
      const result: ReviewCondition = { field, op };
      if (field === "createdAt" || field === "updatedAt") {
        if (!["preset", "on", "between", "before", "after", "interval"].includes(op)) return fail("时间运算符无效");
        result.value = text(row.value, op === "interval");
        if (row.end !== undefined) result.end = text(row.end, op === "interval");
        if (op === "preset" && !datePresets.includes(result.value as DatePreset)) return fail("时间预设无效");
        reviewTimeBounds(result, asOf || "2026-01-01T00:00:00.000Z");
      } else if (["vehicle", "status", "platform"].includes(field)) {
        if (!["in", "notIn", ...(field === "vehicle" ? ["empty", "notEmpty"] : [])].includes(op)) return fail("枚举运算符无效");
        if (op !== "empty" && op !== "notEmpty") {
          if (!Array.isArray(row.value) || !row.value.length || row.value.length > 100) return fail("请选择 1–100 个值");
          result.value = row.value.map((v) => text(v));
          const allowed = field === "status" ? reviewStatuses : field === "platform" ? reviewPlatforms : null;
          if (allowed && result.value.some((v) => !allowed.includes(v))) return fail("枚举值无效");
        }
      } else {
        if (!textOperators.includes(op as typeof textOperators[number])) return fail("文本运算符无效");
        if (op !== "empty" && op !== "notEmpty") result.value = text(row.value);
      }
      return result;
    }) };
  }
  if (!Array.isArray(root.groups)) return fail("条件组无效");
  return { version: 1, search: { field: search.field as ReviewFilters["search"]["field"], value: text(search.value, true) }, match: match(root.match), groups: root.groups.map((value) => group(value, 1)), ...(asOf ? { asOf } : {}) };
}

export function reviewFiltersFromUrl(params: URLSearchParams): ReviewFilters {
  if (params.has("filters")) return parseReviewFilters(params.get("filters")!);
  const result = emptyReviewFilters();
  result.search.value = params.get("q") || "";
  const conditions: ReviewCondition[] = [];
  const status = params.get("status") || "ready";
  if (status !== "all") conditions.push({ field: "status", op: "in", value: status === "ready" ? ["draft", "editing", "approved"] : [status] });
  for (const field of ["author", "platform"] as const) {
    const value = params.get(field);
    if (value && value !== "all") conditions.push({ field, op: field === "author" ? "eq" : "in", value: field === "author" ? value : [value] });
  }
  if (params.has("since") || params.has("until")) conditions.push({ field: "updatedAt", op: "interval", value: params.get("since") || "", end: params.get("until") || "" });
  else if (params.get("time") && params.get("time") !== "all") conditions.push({ field: "updatedAt", op: "preset", value: params.get("time")! });
  if (conditions.length) result.groups = [{ match: "all", children: conditions }];
  return parseReviewFilters(JSON.stringify(result));
}
