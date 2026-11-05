"use client";

import { useEffect, useState } from "react";
import { reviewFiltersFromUrl } from "@/lib/review-filters";
import {
  hasReviewUrlFilters, readReviewFilterMemory, reviewFilterEntryMarker,
  reviewStorageUnavailable, serializeReviewFilterMemory, writeReviewFilterMemory,
} from "@/lib/review-filter-memory";

type UpdateUrl = (command: (params: URLSearchParams) => void, replace?: boolean) => void;
type MemoryState = { accountId: string; dedicated: boolean; restored: boolean; notice: string };

export function useReviewFilterMemory(hydrated: boolean, filterUrlKey: string, updateUrl: UpdateUrl) {
  const [state, setState] = useState<MemoryState | null>(null);
  const [storageNotice, setStorageNotice] = useState("");

  useEffect(() => {
    if (!hydrated) return;
    const controller = new AbortController();
    async function initialize() {
      let accountId: string;
      try {
        const response = await fetch("/api/accounts/session", { signal: controller.signal });
        const data = await response.json() as { account?: { id?: string } | null };
        if (!response.ok || typeof data.account?.id !== "string" || !data.account.id) throw new Error("Account unavailable");
        accountId = data.account.id;
      } catch {
        if (!controller.signal.aborted) setState({ accountId: "", dedicated: true, restored: false, notice: "无法识别当前账号，筛选暂未记忆，请重新进入页面" });
        return;
      }
      if (controller.signal.aborted) return;
      const params = new URLSearchParams(window.location.search);
      // A normal list selection also writes postId. Its history marker survives
      // reload, but is absent when another tab opens a dedicated post URL.
      const dedicated = Boolean(params.get("sourceBatchId") || (params.get("postId") && window.history.state?.[reviewFilterEntryMarker] !== true));
      if (dedicated) { setState({ accountId, dedicated, restored: false, notice: "" }); return; }

      let saved: ReturnType<typeof readReviewFilterMemory>;
      try { saved = readReviewFilterMemory(window.localStorage, accountId); }
      catch { saved = { notice: reviewStorageUnavailable }; } // Accessing localStorage itself can throw SecurityError.
      const restored = !hasReviewUrlFilters(params) && Boolean(saved.filters);
      if (restored && saved.filters) {
        const value = serializeReviewFilterMemory(saved.filters);
        updateUrl((next) => next.set("filters", value), true);
      }
      window.history.replaceState({ ...window.history.state, [reviewFilterEntryMarker]: true }, "");
      setState({ accountId, dedicated, restored, notice: saved.notice });
    }
    void initialize();
    return () => controller.abort();
  }, [hydrated, updateUrl]);

  useEffect(() => {
    if (!state?.accountId || state.dedicated) return;
    // Read the current URL after restoration; never persist pre-hydration defaults.
    const params = new URLSearchParams(window.location.search);
    let filters;
    try { filters = reviewFiltersFromUrl(params); }
    catch { return; } // Invalid URL conditions keep their existing validation error.
    let notice: string;
    try { notice = writeReviewFilterMemory(window.localStorage, state.accountId, filters); }
    catch { notice = reviewStorageUnavailable; }
    // Storage is an external system; report its current failure without changing filters.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStorageNotice(notice);
  }, [state, filterUrlKey]);

  return { ready: Boolean(state), notice: storageNotice || state?.notice || "", restored: state?.restored || false };
}
