import type { LibraryListSort } from "./types";

export const defaultLibraryListSort: LibraryListSort = "newest";

export const libraryListSortValues: readonly LibraryListSort[] = [
  "newest",
  "oldest",
  "name-asc",
  "name-desc",
  "owner-asc",
  "owner-desc",
];

const libraryListSortSet = new Set<LibraryListSort>(libraryListSortValues);

export function normalizeLibraryListSort(value: unknown): LibraryListSort {
  return typeof value === "string" && libraryListSortSet.has(value as LibraryListSort)
    ? value as LibraryListSort
    : defaultLibraryListSort;
}

export function compareLibraryText(left: string, right: string) {
  return left.localeCompare(right, "zh-CN", { numeric: true, sensitivity: "base" });
}

export function libraryListSortDirection(sort: LibraryListSort) {
  return sort === "newest" || sort === "name-desc" || sort === "owner-desc" ? -1 : 1;
}
