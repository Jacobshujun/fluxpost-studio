import { libraryListSortValues } from "./library-sort";
import type { LibraryAssetOrder, LibraryAssetSort } from "./types";

export const canvasLibrarySortOptions = [
  ["updated-newest", "修改时间：新到旧"],
  ["updated-oldest", "修改时间：旧到新"],
  ["newest", "创建时间：新到旧"],
  ["oldest", "创建时间：旧到新"],
  ["name-asc", "文件名：升序"],
  ["name-desc", "文件名：降序"],
  ["random", "随机"],
] as const;

const sorts = new Set<string>([...libraryListSortValues, "updated-newest", "updated-oldest", "random"]);

export function normalizeLibraryAssetSort(value: unknown): LibraryAssetSort {
  if (value === undefined || value === null || value === "") return "newest";
  if (typeof value !== "string" || !sorts.has(value)) throw new Error("无效的素材排序方式");
  return value as LibraryAssetSort;
}

export function normalizeLibraryRandomSeed(value: unknown, sort: LibraryAssetSort) {
  if (sort !== "random") return undefined;
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) throw new Error("随机排序需要有效的随机种子");
  return value;
}

export function libraryAssetOrderDescending(sort: LibraryAssetSort) {
  return sort === "newest" || sort === "updated-newest" || sort === "name-desc" || sort === "owner-desc";
}

export function canvasLibraryOrder(sort: unknown, randomSeed: unknown): LibraryAssetOrder {
  const normalized = normalizeLibraryAssetSort(sort ?? "updated-newest");
  return { sort: normalized, randomSeed: normalizeLibraryRandomSeed(randomSeed, normalized) };
}

export function newLibraryRandomSeed() {
  // getRandomValues is available on HTTP LAN origins; randomUUID is not.
  return Array.from(crypto.getRandomValues(new Uint32Array(4)), (part) => part.toString(16).padStart(8, "0")).join("");
}
