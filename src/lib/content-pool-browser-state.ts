import { normalizeContentPoolSelectionFilter } from "./content-pool-selection";
import type { ContentPoolSelectionFilter, ContentPoolSelectionPage } from "./types";

const pages = new Map<string, { page: ContentPoolSelectionPage; at: number; bytes: number }>();
const requests = new Map<string, { controller: AbortController; promise: Promise<ContentPoolSelectionPage>; users: number }>();
let activeScope = "";
let sessionRequest: Promise<string> | undefined;
export const contentPoolChangedEvent = "fluxpost:content-pool-changed";

export function contentPoolSelectionUrl(input: ContentPoolSelectionFilter, cursor?: string, limit = 40) {
  const filter = normalizeContentPoolSelectionFilter(input);
  const search = new URLSearchParams({ q: filter.query, sort: filter.sort, limit: String(limit) });
  if (filter.projectId) search.set("projectId", filter.projectId);
  if (filter.collectionId) {
    search.set("collectionId", filter.collectionId);
    if (!filter.includeDescendants) search.set("descendants", "0");
  }
  if (filter.localMediaComplete) search.set("localMedia", "complete");
  for (const [key, values] of Object.entries({ platform: filter.platforms, status: filter.statuses, mediaType: filter.mediaTypes, contentTag: filter.contentTags, customTag: filter.customTags })) {
    for (const value of [...values].sort()) search.append(key, value);
  }
  if (cursor) search.set("cursor", cursor);
  return `/api/content-pool/selection?${search}`;
}

export function clearContentPoolBrowserPages() {
  pages.clear();
  for (const request of requests.values()) request.controller.abort();
  requests.clear();
}

export function invalidateContentPoolBrowserPages() {
  clearContentPoolBrowserPages();
  if (typeof window !== "undefined") window.dispatchEvent(new Event(contentPoolChangedEvent));
}

export function contentPoolBrowserScope(): Promise<string> {
  if (sessionRequest) return sessionRequest;
  sessionRequest = fetch("/api/accounts/session", { cache: "no-store" }).then(async (response) => {
    const data = await response.json() as { account?: { id: string; role: string } | null; error?: string };
    if (!response.ok || !data.account) throw new Error(data.error || "请先登录后选择内容池素材。");
    const scope = `${data.account.id}:${data.account.role}`;
    if (scope !== activeScope) clearContentPoolBrowserPages();
    activeScope = scope;
    return scope;
  }).catch((error: unknown) => {
    activeScope = "";
    clearContentPoolBrowserPages();
    throw error;
  }).finally(() => { sessionRequest = undefined; });
  return sessionRequest;
}

export function readContentPoolBrowserPage(scope: string, query: string) {
  const key = `${scope}\n${query}`;
  const entry = pages.get(key);
  if (!entry || Date.now() - entry.at >= 60_000) {
    pages.delete(key);
    return undefined;
  }
  pages.delete(key);
  pages.set(key, entry);
  return entry.page;
}

export function writeContentPoolBrowserPage(scope: string, query: string, page: ContentPoolSelectionPage) {
  if (scope !== activeScope) return;
  const key = `${scope}\n${query}`;
  pages.delete(key);
  const bytes = JSON.stringify(page).length * 2;
  if (bytes > 2 * 1024 * 1024 || page.items.length > 400) return;
  pages.set(key, { page, at: Date.now(), bytes });
  while (pages.size > 10 || [...pages.values()].reduce((sum, entry) => sum + entry.bytes, 0) > 2 * 1024 * 1024) {
    pages.delete(pages.keys().next().value!);
  }
}

export function requestContentPoolBrowserPage(scope: string, url: string, signal: AbortSignal) {
  const key = `${scope}\n${url}`;
  let request = requests.get(key);
  if (!request) {
    const controller = new AbortController();
    const promise = fetch(url, { signal: controller.signal }).then(async (response) => {
      const data = await response.json() as ContentPoolSelectionPage & { error?: string };
      if (!response.ok) throw new Error(data.error || "内容池读取失败");
      return data;
    });
    request = { controller, promise, users: 0 };
    requests.set(key, request);
  }
  const entry = request;
  entry.users += 1;
  return new Promise<ContentPoolSelectionPage>((resolve, reject) => {
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      signal.removeEventListener("abort", abort);
      entry.users -= 1;
      if (!entry.users) {
        entry.controller.abort();
        if (requests.get(key) === entry) requests.delete(key);
      }
    };
    const abort = () => { release(); reject(new DOMException("Aborted", "AbortError")); };
    signal.addEventListener("abort", abort, { once: true });
    entry.promise.then((data) => { if (!released) { release(); resolve(data); } }, (error: unknown) => { if (!released) { release(); reject(error); } });
    if (signal.aborted) abort();
  });
}

export function readContentPoolBrowserMemory(scope: string, instance: string) {
  try {
    const raw = sessionStorage.getItem(`fluxpost:pool-browser:${scope}:${instance}`);
    if (!raw) return { notice: "" };
    const data = JSON.parse(raw) as { filter?: ContentPoolSelectionFilter; scrollTop?: number };
    if (!data.filter || typeof data.filter !== "object") throw new Error("Invalid saved filter");
    return { filter: normalizeContentPoolSelectionFilter(data.filter), scrollTop: typeof data.scrollTop === "number" ? Math.max(0, data.scrollTop) : 0, notice: "" };
  } catch {
    return { notice: "无法恢复上次浏览位置，请重新设置筛选。" };
  }
}

export function writeContentPoolBrowserMemory(scope: string, instance: string, filter: ContentPoolSelectionFilter, scrollTop: number) {
  try {
    sessionStorage.setItem(`fluxpost:pool-browser:${scope}:${instance}`, JSON.stringify({ filter: normalizeContentPoolSelectionFilter(filter), scrollTop }));
    return "";
  } catch {
    return "当前浏览器无法记住内容池筛选和位置。";
  }
}
