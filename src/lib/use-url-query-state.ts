"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

export type UrlQueryCodec<T> = {
  parse: (params: URLSearchParams, key: string) => T;
  serialize: (value: T, key: string) => string[];
};

export const optionalStringCodec = (defaultValue = ""): UrlQueryCodec<string> => ({
  parse: (params, key) => params.get(key) || defaultValue,
  serialize: (value) => value.trim() && value !== defaultValue ? [value.trim()] : [],
});

export function stringCodec(defaultValue = ""): UrlQueryCodec<string> {
  return {
    parse: (params, key) => params.get(key) || defaultValue,
    serialize: (value) => value && value !== defaultValue ? [value] : [],
  };
}

export function enumCodec<T extends string>(values: readonly T[], defaultValue: T): UrlQueryCodec<T> {
  return {
    parse: (params, key) => {
      const value = params.get(key);
      return value && values.includes(value as T) ? value as T : defaultValue;
    },
    serialize: (value) => value !== defaultValue ? [value] : [],
  };
}

export function listCodec(defaultValue: readonly string[] = []): UrlQueryCodec<string[]> {
  return {
    parse: (params, key) => [...new Set(params.getAll(key).map((value) => value.trim()).filter(Boolean))],
    serialize: (value) => {
      const normalized = [...new Set(value.map((item) => item.trim()).filter(Boolean))];
      return normalized.length && normalized.join("\u0000") !== defaultValue.join("\u0000") ? normalized : [];
    },
  };
}

function readValue<T>(key: string, codec: UrlQueryCodec<T>): T {
  const params = new URLSearchParams(window.location.search);
  return codec.parse(params, key);
}

function writeValue<T>(key: string, value: T, codec: UrlQueryCodec<T>, pathname: string, replace: ReturnType<typeof useRouter>["replace"]) {
  const params = new URLSearchParams(window.location.search);
  params.delete(key);
  const values = codec.serialize(value, key);
  values.forEach((item) => params.append(key, item));
  const query = params.toString();
  const current = window.location.search.replace(/^\?/, "");
  if (query === current) return;
  replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
}

export function useUrlQueryState<T>(key: string, defaultValue: T, codec: UrlQueryCodec<T>): [T, (value: T | ((current: T) => T)) => void, boolean] {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [value, setValue] = useState(defaultValue);
  const [hydrated, setHydrated] = useState(false);
  const codecRef = useRef(codec);
  useEffect(() => {
    codecRef.current = codec;
  }, [codec]);

  useEffect(() => {
    const syncFromUrl = () => setValue(readValue(key, codecRef.current));
    syncFromUrl();
    // URL hydration is an external-store subscription and intentionally updates once after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, [key]);

  useEffect(() => {
    if (hydrated) writeValue(key, value, codecRef.current, pathname, router.replace);
  }, [hydrated, key, pathname, router, value]);

  return [value, setValue, hydrated];
}

// One history entry per command, including commands that change several filters.
// Next.js supports the native History API and synchronizes its router with it.
const subscribeQueryParams = (notify: () => void) => {
  window.addEventListener("popstate", notify);
  return () => window.removeEventListener("popstate", notify);
};
const querySnapshot = () => window.location.search;
const serverQuerySnapshot = () => "";

export function useUrlQueryParams(): [URLSearchParams, (update: (params: URLSearchParams) => void, replace?: boolean) => void, boolean] {
  const query = useSyncExternalStore(subscribeQueryParams, querySnapshot, serverQuerySnapshot);
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    // Client URL becomes available after server hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);
  const update = useCallback((command: (params: URLSearchParams) => void, replace = false) => {
    const next = new URLSearchParams(window.location.search);
    command(next);
    const query = next.toString();
    if (query === new URLSearchParams(window.location.search).toString()) return;
    const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    if (replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);
  return [params, update, hydrated];
}
