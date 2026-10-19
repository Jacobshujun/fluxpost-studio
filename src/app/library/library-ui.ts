import { normalizeLibraryListSort } from "@/lib/library-sort";
import type { LibraryAssetFilters, LibraryTaggingStatus, LibrarySmartFolderCondition } from "@/lib/types";

export type LibraryView = { kind: "all" } | { kind: "uncategorized" } | { kind: "favorites" } | { kind: "collection" | "smart"; id: string };
export const taggingLabels: Record<LibraryTaggingStatus, string> = { idle: "未打标", queued: "排队中", running: "打标中", completed: "已完成", failed: "失败" };
export const numericFilters = ["minWidth", "maxWidth", "minHeight", "maxHeight", "minByteSize", "maxByteSize"] as const;
export const dimensionFilters = { imageTypes: "imageType", vehicleModels: "vehicleModel", vehicleColors: "vehicleColor", angles: "angle", scenes: "scene", people: "people", customTags: "customTag", tags: "tag", ownerIds: "ownerId" } as const;
export const filterKeys = ["color", "q", "visibility", "taggingStatus", "addedFrom", "addedBefore", ...numericFilters, ...Object.values(dimensionFilters)];

export function readLibraryView(params: URLSearchParams): LibraryView {
  const value = params.get("view") || "all";
  if (value === "uncategorized" || value === "favorites") return { kind: value };
  const separator = value.indexOf(":");
  const kind = value.slice(0, separator);
  if ((kind === "collection" || kind === "smart") && separator > 0 && value.slice(separator + 1)) return { kind, id: value.slice(separator + 1) };
  return { kind: "all" };
}

export function readLibraryFilters(params: URLSearchParams): LibraryAssetFilters {
  const view = readLibraryView(params);
  const includeDescendants = params.get("descendants") !== "0";
  const visibility = params.get("visibility");
  const status = params.get("taggingStatus");
  const filters: LibraryAssetFilters = {
    color: /^#[0-9a-f]{6}$/i.test(params.get("color") || "") ? params.get("color")!.toUpperCase() : undefined,
    search: params.get("q")?.trim() || undefined, limit: 60, sort: normalizeLibraryListSort(params.get("sort")),
    collectionId: view.kind === "collection" ? view.id : undefined,
    includeDescendants: view.kind === "collection" ? includeDescendants : undefined,
    smartFolderId: view.kind === "smart" ? view.id : undefined,
    uncategorized: view.kind === "uncategorized", favorite: view.kind === "favorites",
    visibility: visibility === "private" || visibility === "team" ? visibility : undefined,
    taggingStatus: status && Object.hasOwn(taggingLabels, status) ? status as LibraryTaggingStatus : undefined,
    addedFrom: validDate(params.get("addedFrom")), addedBefore: validDate(params.get("addedBefore")),
  };
  for (const key of numericFilters) {
    const value = params.get(key);
    if (value !== null && value.trim() && Number.isFinite(Number(value)) && Number(value) >= 0) filters[key] = Number(value);
  }
  for (const [key, name] of Object.entries(dimensionFilters)) {
    filters[key as keyof typeof dimensionFilters] = [...new Set(params.getAll(name).map((item) => item.trim()).filter(Boolean))];
  }
  return filters;
}

export function filtersToQuery(filters: LibraryAssetFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "" || (value === false && key !== "includeDescendants")) continue;
    const name = dimensionFilters[key as keyof typeof dimensionFilters] || key;
    if (Array.isArray(value)) value.forEach((item) => params.append(name, String(item)));
    else params.set(name, String(value));
  }
  return params.toString();
}

function validDate(value: string | null) { return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined; }
export function beijingDate(value: string | undefined) { return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }) : ""; }
export function dateBoundary(value: string, nextDay = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("请选择有效日期");
  const time = Date.parse(`${value}T00:00:00+08:00`);
  if (!Number.isFinite(time) || beijingDate(new Date(time).toISOString()) !== value) throw new Error("请选择有效日期");
  return new Date(time + (nextDay ? 86400000 : 0)).toISOString();
}
export function recentDateRange(days: number, now = new Date()) {
  const end = dateBoundary(beijingDate(now.toISOString()), true);
  return { addedFrom: new Date(Date.parse(end) - days * 86400000).toISOString(), addedBefore: end };
}
export function validateFilterRanges(params: URLSearchParams) {
  for (const [min, max, label] of [["minWidth", "maxWidth", "宽度"], ["minHeight", "maxHeight", "高度"], ["minByteSize", "maxByteSize", "文件大小"]]) {
    const left = params.get(min), right = params.get(max);
    for (const value of [left, right]) if (value && (!Number.isFinite(Number(value)) || Number(value) < 0)) throw new Error(`${label}必须为非负数`);
    if (left && right && Number(left) > Number(right)) throw new Error(`${label}下限不能大于上限`);
  }
  for (const key of ["addedFrom", "addedBefore"]) if (params.has(key) && !Number.isFinite(Date.parse(params.get(key)!))) throw new Error("请选择有效日期");
  if (params.get("addedFrom") && params.get("addedBefore") && Date.parse(params.get("addedFrom")!) >= Date.parse(params.get("addedBefore")!)) throw new Error("起始日期不能晚于结束日期");
}

export const smartOperators: Record<LibrarySmartFolderCondition["field"], LibrarySmartFolderCondition["operator"][]> = {
  tag: ["contains", "not_contains"], collection: ["contains", "not_contains"], text: ["contains", "not_contains"],
  owner: ["equals", "one_of"], visibility: ["equals", "one_of"], imageType: ["equals", "one_of", "not_contains"],
  width: ["equals", "gte", "lte"], height: ["equals", "gte", "lte"], byteSize: ["equals", "gte", "lte"],
  createdAt: ["before", "after"], taggingStatus: ["equals", "one_of"], favorite: ["is"],
};
