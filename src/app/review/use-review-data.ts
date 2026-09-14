"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { changedReviewFields, reviewListItemFromPost, type ReviewListItem, type ReviewListPage, type ReviewMetadata } from "@/lib/review-contract";
import type { GeneratedPost } from "@/lib/types";

type Filters = { status: string; time: string; q: string; author: string; platform: string; sourceBatchId: string };
const emptyMetadata: ReviewMetadata = { summary: { total: 0, ready: 0, approved: 0, published: 0 }, authors: [], platforms: [] };

export function useReviewData(filters: Filters, selectedId: string, setSelectedId: (id: string) => void, hydrated: boolean, onError: (message: string) => void) {
  const [posts, setPosts] = useState<ReviewListItem[]>([]);
  const [metadata, setMetadata] = useState(emptyMetadata);
  const [draft, setDraftState] = useState<GeneratedPost | null>(null);
  const draftRef = useRef(draft);
  const persisted = useRef(new Map<string, GeneratedPost>());
  const selectedRef = useRef("");
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [selectionItems, setSelectionItems] = useState<Record<string, ReviewListItem>>({});
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [cursors, setCursors] = useState<string[]>([""]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [currentFilterKey, setCurrentFilterKey] = useState(JSON.stringify(filters));
  const [debouncedQ, setDebouncedQ] = useState(filters.q);
  const detailRequest = useRef<AbortController | null>(null);
  const listGeneration = useRef(0);
  const saveGeneration = useRef(new Map<string, number>());
  const setIdRef = useRef(setSelectedId);
  useEffect(() => { setIdRef.current = setSelectedId; }, [setSelectedId]);
  const setDraft: Dispatch<SetStateAction<GeneratedPost | null>> = useCallback((action) => {
    const value = typeof action === "function" ? action(draftRef.current) : action;
    draftRef.current = value;
    setDraftState(value);
  }, []);
  useEffect(() => { const timer = setTimeout(() => setDebouncedQ(filters.q), 300); return () => clearTimeout(timer); }, [filters.q]);

  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    // Filters invalidate both cursor position and batch selection.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCursors([""]);
    setCurrentFilterKey(filterKey);
    setSelectedPostIds([]);
    setSelectionItems({});
    setNextCursor(undefined);
  }, [filterKey]);
  const query = useMemo(() => {
    const params = new URLSearchParams({ status: filters.status, q: debouncedQ, author: filters.author, platform: filters.platform, sourceBatchId: filters.sourceBatchId });
    if (filters.time !== "all") {
      const now = new Date();
      const since = filters.time === "today" ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : new Date(now.getTime() - (filters.time === "7d" ? 7 : 30) * 86400000);
      params.set("since", since.toISOString());
      if (filters.time === "today") params.set("until", new Date(now.getFullYear(), now.getMonth(), now.getDate()+1).toISOString());
    }
    return params.toString();
  }, [filters.status, filters.author, filters.platform, filters.sourceBatchId, filters.time, debouncedQ]);

  const loadDetail = useCallback(async (id: string, force = false) => {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    const cached = persisted.current.get(id);
    if (!force && cached) { setDraft(cached); setDetailLoading(false); return; }
    const previousDraft = draftRef.current;
    const generation = saveGeneration.current.get(id);
    if (previousDraft?.id !== id) setDraft(null);
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/review/posts/${encodeURIComponent(id)}`, { signal: controller.signal });
      const data = await response.json() as { post?: GeneratedPost; error?: string };
      if (!response.ok || !data.post) throw new Error(data.error || "加载稿件失败");
      if (controller.signal.aborted || selectedRef.current !== id || generation !== saveGeneration.current.get(id)) return;
      persisted.current.delete(id);
      persisted.current.set(id, data.post);
      if (persisted.current.size > 10) persisted.current.delete([...persisted.current.keys()].find((key) => key !== selectedRef.current)!);
      if (draftRef.current === previousDraft || draftRef.current === null) setDraft(data.post);
    } catch (error) {
      if (!controller.signal.aborted) onError(error instanceof Error ? error.message : "加载稿件失败");
    } finally { if (!controller.signal.aborted) setDetailLoading(false); }
  }, [onError, setDraft]);
  const selectPost = useCallback((post: Pick<ReviewListItem, "id">) => {
    if (selectedRef.current === post.id && draftRef.current?.id === post.id) return;
    selectedRef.current = post.id;
    setIdRef.current(post.id);
    void loadDetail(post.id);
  }, [loadDetail]);
  useEffect(() => {
    if (!hydrated || !selectedId || selectedRef.current === selectedId) return;
    selectedRef.current = selectedId;
    void loadDetail(selectedId);
  }, [hydrated, selectedId, loadDetail]);
  useEffect(() => () => detailRequest.current?.abort(), []);

  const cursor = cursors.at(-1) || "";
  useEffect(() => {
    if (!hydrated || filters.q !== debouncedQ || currentFilterKey !== filterKey) return;
    const controller = new AbortController();
    const generation = ++listGeneration.current;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const params = new URLSearchParams(query);
    if (cursor) params.set("cursor", cursor);
    void (async () => {
      try {
        const response = await fetch(`/api/review/posts?${params}`, { signal: controller.signal });
        const data = await response.json() as ReviewListPage & { error?: string };
        if (!response.ok) throw new Error(data.error || "加载列表失败");
        if (controller.signal.aborted || generation !== listGeneration.current) return;
        setPosts(data.posts);
        setNextCursor(data.nextCursor);
        if (!selectedRef.current && data.posts[0]) selectPost(data.posts[0]);
      } catch (error) {
        if (!controller.signal.aborted) onError(error instanceof Error ? error.message : "加载列表失败");
      } finally { if (!controller.signal.aborted && generation === listGeneration.current) setLoading(false); }
    })();
    return () => { controller.abort(); };
  }, [query, cursor, hydrated, revision, selectPost, onError, filters.q, debouncedQ, currentFilterKey, filterKey]);
  useEffect(() => {
    if (!hydrated) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/review/posts/metadata?${new URLSearchParams({ sourceBatchId: filters.sourceBatchId })}`, { signal: controller.signal });
        const data = await response.json() as ReviewMetadata & { error?: string };
        if (!response.ok) throw new Error(data.error || "加载统计失败");
        if (!controller.signal.aborted) setMetadata(data);
      } catch (error) { if (!controller.signal.aborted) onError(error instanceof Error ? error.message : "加载统计失败"); }
    })();
    return () => controller.abort();
  }, [filters.sourceBatchId, hydrated, revision, onError]);

  const refresh = useCallback(() => { setRevision((value) => value+1); }, []);
  const mergeSavedPost = useCallback((saved: GeneratedPost, submitted?: GeneratedPost, item = reviewListItemFromPost(saved)) => {
    saveGeneration.current.set(saved.id, (saveGeneration.current.get(saved.id) || 0) + 1);
    ++listGeneration.current;
    const baseline = persisted.current.get(saved.id);
    persisted.current.delete(saved.id);
    persisted.current.set(saved.id, saved);
    if (persisted.current.size > 10) persisted.current.delete([...persisted.current.keys()].find((key) => key !== selectedRef.current)!);
    const current = draftRef.current;
    if (current?.id === saved.id) setDraft({ ...saved, ...changedReviewFields(current, submitted || baseline || current) });
    if (item) {
      setPosts((current) => current.map((row) => row.id === item.id ? item : row));
      setSelectionItems((current) => current[item.id] ? { ...current, [item.id]: item } : current);
    }
    refresh();
  }, [refresh, setDraft]);
  const toggleSelection = useCallback((id: string) => {
    if (selectedPostIds.length >= 200 && !selectedPostIds.includes(id)) return;
    const item = posts.find((row) => row.id === id);
    if (item) setSelectionItems((current) => ({ ...current, [id]: item }));
    setSelectedPostIds((current) => current.includes(id) ? current.filter((value)=>value!==id) : current.length < 200 ? [...current, id] : current);
  }, [posts, selectedPostIds]);
  useEffect(() => {
    // Keep only checked summaries; repeated browsing must not accumulate history.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectionItems((current) => Object.keys(current).some((id) => !selectedPostIds.includes(id))
      ? Object.fromEntries(Object.entries(current).filter(([id]) => selectedPostIds.includes(id))) : current);
  }, [selectedPostIds]);
  const selectVisible = useCallback(() => {
    setSelectionItems((current) => ({ ...current, ...Object.fromEntries(posts.map((row)=>[row.id,row])) }));
    setSelectedPostIds((current) => [...new Set([...current,...posts.map((row)=>row.id)])].slice(0,200));
  }, [posts]);
  const selectedPosts = useMemo(() => selectedPostIds.map((id)=>selectionItems[id]).filter(Boolean), [selectedPostIds, selectionItems]);
  const persistedPost = useCallback((id: string) => persisted.current.get(id), []);
  const refreshDetail = useCallback(() => {
    const current = draftRef.current;
    const baseline = current && persisted.current.get(current.id);
    if (current && baseline && Object.keys(changedReviewFields(current, baseline)).length) return;
    if (selectedRef.current) void loadDetail(selectedRef.current, true);
  }, [loadDetail]);
  const nextPage = useCallback(() => { if (nextCursor) setCursors((current)=>[...current,nextCursor]); }, [nextCursor]);
  const previousPage = useCallback(() => setCursors((current)=>current.length>1?current.slice(0,-1):current), []);
  const removePosts = useCallback((ids: string[]) => {
    for (const id of ids) persisted.current.delete(id);
    if (ids.includes(selectedRef.current)) { detailRequest.current?.abort(); selectedRef.current=""; setIdRef.current(""); setDraft(null); }
    setSelectedPostIds((current)=>current.filter((id)=>!ids.includes(id)));
    setCursors([""]);
    refresh();
  }, [refresh, setDraft]);
  return { posts, metadata, draft, setDraft, selectedPostIds, setSelectedPostIds, selectedPosts, loading, detailLoading, selectPost, refresh, refreshDetail, mergeSavedPost, toggleSelection, selectVisible, persistedPost, nextPage, previousPage, pageNumber: cursors.length, hasNext: Boolean(nextCursor), removePosts };
}
