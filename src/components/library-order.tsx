"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { canvasLibrarySortOptions, newLibraryRandomSeed } from "@/lib/library-asset-order";
import type { LibraryAssetOrder, LibraryAssetSort } from "@/lib/types";

export function LibraryOrderControl({ order, onChange }: { order: LibraryAssetOrder; onChange: (order: LibraryAssetOrder) => void }) {
  return <div className="canvas-library-order">
    <label>排序<select aria-label="素材排序" value={order.sort} onChange={(event) => {
      const sort = event.target.value as LibraryAssetSort;
      onChange({ sort, randomSeed: sort === "random" ? newLibraryRandomSeed() : undefined });
    }}>{canvasLibrarySortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {order.sort === "random" ? <button type="button" onClick={() => onChange({ sort: "random", randomSeed: newLibraryRandomSeed() })}>重新打乱</button> : null}
  </div>;
}

// The identity includes the owning draft and selection. A delayed response may
// never overwrite a newer selection/filter or commit after the picker unmounts.
export function useLibraryOrdering(identity: string) {
  const live = useRef(identity);
  const controller = useRef<AbortController | undefined>(undefined);
  const [pendingIdentity, setPendingIdentity] = useState<string>();
  const [failure, setFailure] = useState<{ identity: string; message: string }>();
  useLayoutEffect(() => {
    live.current = identity;
    return () => { controller.current?.abort(); };
  }, [identity]);

  async function reorder(assetIds: string[], order: LibraryAssetOrder, commit: (ids: string[]) => void) {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setPendingIdentity(identity);
    setFailure(undefined);
    try {
      const response = await fetch("/api/library/assets/order", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetIds, ...order }), signal: request.signal,
      });
      const result = await response.json() as { assetIds?: string[]; error?: string };
      if (!response.ok || !Array.isArray(result.assetIds)) throw new Error(result.error || "素材排序失败");
      if (!request.signal.aborted && live.current === identity) commit(result.assetIds);
    } catch (error) {
      if (!request.signal.aborted && live.current === identity) setFailure({ identity, message: error instanceof Error ? error.message : "素材排序失败" });
    } finally {
      if (controller.current === request) setPendingIdentity(undefined);
    }
  }

  return { reorder, ordering: pendingIdentity === identity, orderError: failure?.identity === identity ? failure.message : "" };
}
