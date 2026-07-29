"use client";

import { useCallback, useSyncExternalStore } from "react";
import { defaultLibraryListSort, normalizeLibraryListSort } from "./library-sort";
import type { LibraryListSort } from "./types";

export function useLibraryListSort(storageKey: string) {
  const subscribe = useCallback((onStoreChange: () => void) => {
    const localEventName = localSortEventName(storageKey);
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey) onStoreChange();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(localEventName, onStoreChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(localEventName, onStoreChange);
    };
  }, [storageKey]);
  const getSnapshot = useCallback(
    () => normalizeLibraryListSort(window.localStorage.getItem(storageKey)),
    [storageKey],
  );
  const getServerSnapshot = useCallback(() => defaultLibraryListSort, []);
  const sort = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setSort = useCallback((value: LibraryListSort | string) => {
    const next = normalizeLibraryListSort(value);
    window.localStorage.setItem(storageKey, next);
    window.dispatchEvent(new Event(localSortEventName(storageKey)));
  }, [storageKey]);

  return [sort, setSort] as const;
}

function localSortEventName(storageKey: string) {
  return `fluxpost:library-sort:${storageKey}`;
}
