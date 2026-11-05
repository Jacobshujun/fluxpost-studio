import { parseReviewFilters, type ReviewFilters } from "./review-filters";

export const reviewFilterUrlKeys = ["filters", "status", "time", "q", "author", "platform", "since", "until"] as const;
export const reviewFilterEntryMarker = "fluxpostReviewFilterEntry";
// Pass only our metadata. Next.js adds its own router state to native history
// calls; passing __NA back would bypass that router synchronization.
export const reviewFilterHistoryMetadata = () => window.history.state?.[reviewFilterEntryMarker] === true ? { [reviewFilterEntryMarker]: true } : null;
export const reviewFilterMemoryKey = (accountId: string) => `fluxpost:review-filters:v1:${accountId}`;
export const hasReviewUrlFilters = (params: URLSearchParams) => reviewFilterUrlKeys.some((key) => params.has(key));

export function serializeReviewFilterMemory(filters: ReviewFilters): string {
  const value = parseReviewFilters(JSON.stringify(filters));
  delete value.asOf;
  return JSON.stringify(value);
}

type FilterStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const reviewStorageUnavailable = "当前浏览器无法记住筛选";

export function readReviewFilterMemory(storage: FilterStorage, accountId: string): { filters?: ReviewFilters; notice: string } {
  let raw: string | null;
  try { raw = storage.getItem(reviewFilterMemoryKey(accountId)); }
  catch { return { notice: reviewStorageUnavailable }; }
  if (raw === null) return { notice: "" };
  try {
    const filters = parseReviewFilters(raw);
    delete filters.asOf;
    return { filters, notice: "" };
  } catch {
    try { storage.removeItem(reviewFilterMemoryKey(accountId)); }
    catch { return { notice: reviewStorageUnavailable }; }
    return { notice: "上次筛选记录已损坏，请重新设置筛选" };
  }
}

export function writeReviewFilterMemory(storage: FilterStorage, accountId: string, filters: ReviewFilters): string {
  const value = serializeReviewFilterMemory(filters);
  try { storage.setItem(reviewFilterMemoryKey(accountId), value); }
  catch { return reviewStorageUnavailable; }
  return "";
}
