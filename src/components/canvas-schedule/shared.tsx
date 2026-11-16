"use client";
import { LibraryOrderControl, useLibraryOrdering } from "@/components/library-order";
import { canvasLibraryOrder } from "@/lib/library-asset-order";
import type { LibraryAssetOrder } from "@/lib/types";
import { LibraryColorFilter, LibraryPalette } from "@/components/library-colors";
import Link from "next/link";
import { ScheduleIterationFailures } from "./IterationFailures";
import { ScheduleAggregateFailure } from "./AggregateFailure";
import Image from "next/image";
import { AlertTriangle, ArrowDown, BookOpenText, CheckCircle2, Download, FileText, FileVideo2, ImageOff, Images, Layers3, LoaderCircle, Eye, Play, Plus, RefreshCw, RotateCcw, Sheet, Search, Share2, Square, Trash2, Video, X } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ContentPoolCustomTagPicker } from "@/components/content-pool-custom-tag-picker";
import { contentPoolCustomTagKey } from "@/lib/content-pool-tags";
import { contentPoolBrowserScope, contentPoolChangedEvent, contentPoolSelectionUrl, readContentPoolBrowserMemory, readContentPoolBrowserPage, requestContentPoolBrowserPage, writeContentPoolBrowserMemory, writeContentPoolBrowserPage } from "@/lib/content-pool-browser-state";
import { canvasBatchBindingKey, getCanvasBatchBindings, getCanvasBatchBindableFields, getCanvasNodeDefinition, getCanvasNodeExecutionMode } from "@/lib/canvas/registry";
import { getCanvasIterationOutputPorts } from "@/lib/canvas/iteration";
import { canvasCollectionScheduleDefinition } from "@/lib/canvas/content-collection-schedule";
import { formatCanvasScheduleScalarValues, parseCanvasScheduleScalarValues } from "@/lib/canvas/scalar-values";
import { CANVAS_SAVE_IMAGE_MAX_ITEMS } from "@/lib/canvas/save-images";
import { canvasVideoSnapshotsFromConfig } from "@/lib/canvas/video-loader";
import { selectIdRange } from "@/lib/list-selection";
import { contentTagOptions } from "@/lib/types";
import type { ContentPoolSelectionFilter, ContentPoolSelectionItem, ContentPoolSelectionPage, CopyLibraryEntryView, LibraryAsset, LibraryAssetPage, LibraryNavigation } from "@/lib/types";
import type { CanvasArtifact, CanvasGraph, CanvasNode, CanvasNodeRun, CanvasPortKind, CanvasPortDefinition, CanvasRunWithNodes, CanvasSchedule, CanvasScheduleAssetFilter, CanvasScheduleAssetSnapshot, CanvasScheduleCopyFilter, CanvasScheduleParameter, CanvasScheduleParameterSource, CanvasScheduleParameterType, CanvasScheduleParameterValue, CanvasScheduleSampleCount, CanvasScheduleV2ChildTask, CanvasScheduleV2Definition, CanvasScheduleV2SharedOutput } from "@/lib/canvas/types";

export type CanvasCopyLibraryResponse = { entries: CopyLibraryEntryView[]; tags: string[] };

export type PreviewState =
  | { kind: "text"; value: string }
  | { kind: "image"; url: string; index: number; width?: number; height?: number; sequence?: Array<{ id: string; url: string; width?: number; height?: number }> }
  | { kind: "video"; url: string; index: number }
  | null;

export let canvasScheduleParameterSequence = 0;

export const canvasScheduleParameterTypes = ["image", "image-group", "directory-group", "video", "source-video", "content-pool", "text", "copy", "number", "boolean", "enum"] as const satisfies readonly CanvasScheduleParameterType[];

export function ContentPoolSelectionBrowser({ filter, selectedIds, mode, onFilterChange, onToggle, onSelectionChange, onPreviewImage, memoryKey, rememberFilter = false }: {
  filter: ContentPoolSelectionFilter;
  selectedIds: string[];
  mode: "single" | "manual" | "match";
  onFilterChange: (filter: ContentPoolSelectionFilter) => void;
  onToggle: (item: ContentPoolSelectionItem) => void;
  onSelectionChange?: (ids: string[]) => void;
  onPreviewImage: (url: string, index: number) => void;
  memoryKey?: string;
  rememberFilter?: boolean;
}) {
  const [page, setPage] = useState<ContentPoolSelectionPage>({ items: [], projects: [], collections: [], total: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const loadSequence = useRef(0);
  const [scope, setScope] = useState("");
  const [notice, setNotice] = useState("");
  const [displayQuery, setDisplayQuery] = useState("");
  const [selecting, setSelecting] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const selectionRequestRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef(page);
  const restoreScroll = useRef<number | undefined>(undefined);
  const query = contentPoolSelectionUrl(filter);
  const current = useRef({ query, mode, filter, onFilterChange, onSelectionChange });
  useLayoutEffect(() => { current.current = { query, mode, filter, onFilterChange, onSelectionChange }; });
  useEffect(() => {
    let cancelled = false;
    void contentPoolBrowserScope().then((nextScope) => {
      if (cancelled) return;
      if (memoryKey) {
        const saved = readContentPoolBrowserMemory(nextScope, memoryKey);
        setNotice(saved.notice);
        if (saved.filter && rememberFilter) current.current.onFilterChange(saved.filter);
      }
      setScope(nextScope);
    }).catch((loadError: unknown) => { if (!cancelled) setError(errorMessage(loadError)); });
    return () => { cancelled = true; };
  }, [memoryKey, rememberFilter]);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const load = useCallback(async (append = false, cursor?: string, force = false) => {
    if (!scope) return;
    const sequence = ++loadSequence.current;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    if (!append && !force) {
      const cached = readContentPoolBrowserPage(scope, query);
      if (cached) {
        pageRef.current = cached;
        setPage(cached);
        setDisplayQuery(query);
        setBusy(false);
        setError("");
        return;
      }
    }
    setBusy(true);
    setError("");
    try {
      const url = cursor ? `${query}&cursor=${encodeURIComponent(cursor)}` : query;
      const next = await requestContentPoolBrowserPage(scope, url, controller.signal);
      if (sequence !== loadSequence.current || current.current.query !== query) return;
      const result = { ...next, items: append ? uniqueContentPoolItems([...pageRef.current.items, ...next.items]) : next.items };
      pageRef.current = result;
      setPage(result);
      setDisplayQuery(query);
      writeContentPoolBrowserPage(scope, query, result);
    } catch (loadError) {
      if (!controller.signal.aborted && sequence === loadSequence.current) setError(errorMessage(loadError));
    } finally {
      if (sequence === loadSequence.current) setBusy(false);
    }
  }, [scope, query]);
  useEffect(() => {
    if (!scope) return;
    const saved = memoryKey ? readContentPoolBrowserMemory(scope, memoryKey) : undefined;
    restoreScroll.current = saved?.filter && contentPoolSelectionUrl(saved.filter) === query ? saved.scrollTop : 0;
    const timer = setTimeout(() => void load(), !readContentPoolBrowserPage(scope, query) && new URLSearchParams(query.split("?")[1]).get("q") ? 240 : 0);
    return () => {
      clearTimeout(timer);
      loadSequence.current += 1;
      requestRef.current?.abort();
    };
  }, [scope, query, load, memoryKey]);
  useEffect(() => {
    const refresh = () => { void load(false, undefined, true); };
    window.addEventListener(contentPoolChangedEvent, refresh);
    return () => window.removeEventListener(contentPoolChangedEvent, refresh);
  }, [load]);
  useEffect(() => () => selectionRequestRef.current?.abort(), [query, mode]);
  useLayoutEffect(() => {
    if (restoreScroll.current !== undefined && resultsRef.current && page.items.length) {
      resultsRef.current.scrollTop = restoreScroll.current;
      restoreScroll.current = undefined;
    }
  }, [page]);
  useEffect(() => {
    if (scope && memoryKey) setNotice(writeContentPoolBrowserMemory(scope, memoryKey, current.current.filter, restoreScroll.current ?? resultsRef.current?.scrollTop ?? 0));
  }, [scope, memoryKey, query]);
  const setListFilter = <K extends "platforms" | "statuses" | "mediaTypes" | "contentTags">(key: K, value: ContentPoolSelectionFilter[K][number]) => {
    const values = filter[key] as string[];
    onFilterChange({ ...filter, [key]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value] });
  };
  const activeAdvancedCount = filter.platforms.length + filter.statuses.length + filter.mediaTypes.length + filter.contentTags.length + filter.customTags.length + Number(filter.localMediaComplete);
  const selectAllMatching = async () => {
    if (!onSelectionChange || mode !== "manual" || displayQuery !== query) return;
    if (page.total > 200) {
      setError("匹配结果超过 200 条，请缩小筛选范围后再全选。");
      return;
    }
    setSelecting(true);
    setError("");
    selectionRequestRef.current?.abort();
    const controller = new AbortController();
    selectionRequestRef.current = controller;
    try {
      const result = await api<{ ids: string[] }>(`${query}&ids=1`, { signal: controller.signal });
      if (!controller.signal.aborted && selectionRequestRef.current === controller && current.current.query === query && current.current.mode === "manual") current.current.onSelectionChange?.(result.ids);
    } catch (selectionError) {
      if (!controller.signal.aborted && current.current.query === query && current.current.mode === "manual") setError(errorMessage(selectionError));
    } finally {
      if (selectionRequestRef.current === controller) setSelecting(false);
    }
  };
  return <div className="canvas-content-pool-browser">
    <div className="canvas-picker-heading"><span>内容池素材</span><button type="button" onClick={() => void load(false, undefined, true)} disabled={busy || !scope} title="刷新列表" aria-label="刷新内容池列表"><RefreshCw className={busy ? "animate-spin" : ""} /></button></div>
    <div className="canvas-content-pool-primary-filters">
      <label className="canvas-picker-search"><Search /><input value={filter.query} onChange={(event) => onFilterChange({ ...filter, query: event.target.value })} placeholder="搜索标题、正文、作者或来源 ID" /></label>
      <label><span>项目</span><select value={filter.projectId || ""} onChange={(event) => onFilterChange({ ...filter, projectId: event.target.value || undefined })}><option value="">全部项目</option>{page.projects.map((project) => <option key={project.id} value={project.id}>{project.name} ({project.totalItems})</option>)}</select></label>
      <label><span>内容库</span><select value={filter.collectionId || ""} onChange={(event) => onFilterChange({ ...filter, collectionId: event.target.value || undefined })}><option value="">全部库</option>{page.collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.relativePath}</option>)}</select></label>
      {filter.collectionId ? <label className="canvas-content-pool-local"><input type="checkbox" checked={filter.includeDescendants} onChange={(event) => onFilterChange({ ...filter, includeDescendants: event.target.checked })} /><span>包含子集</span></label> : null}
      <label><span>排序</span><select value={filter.sort} onChange={(event) => onFilterChange({ ...filter, sort: event.target.value as ContentPoolSelectionFilter["sort"] })}><option value="hot-desc">热度最高</option><option value="published-desc">发布时间最新</option><option value="crawled-desc">抓取时间最新</option></select></label>
    </div>
    <details className="canvas-content-pool-advanced">
      <summary><span>更多筛选</span>{activeAdvancedCount ? <em>{activeAdvancedCount}</em> : null}</summary>
      <ContentPoolFilterChecks label="平台" options={["wechat_channels", "xiaohongshu", "douyin", "weibo", "xiaopeng_bbs", "dongchedi", "feishu", "original"]} selected={filter.platforms} onToggle={(value) => setListFilter("platforms", value as ContentPoolSelectionFilter["platforms"][number])} />
      <ContentPoolFilterChecks label="状态" options={["new", "analyzed", "rewritten", "approved", "published"]} selected={filter.statuses} onToggle={(value) => setListFilter("statuses", value as ContentPoolSelectionFilter["statuses"][number])} />
      <ContentPoolFilterChecks label="媒体" options={["image", "video", "mixed", "text", "unknown"]} selected={filter.mediaTypes} onToggle={(value) => setListFilter("mediaTypes", value as ContentPoolSelectionFilter["mediaTypes"][number])} />
      <ContentPoolFilterChecks label="内容分类（同时满足）" options={[...contentTagOptions]} selected={filter.contentTags} onToggle={(value) => setListFilter("contentTags", value as ContentPoolSelectionFilter["contentTags"][number])} />
      <div className="canvas-content-pool-custom-tags"><span>自定义标签（同时满足）</span><ContentPoolCustomTagPicker tags={filter.customTags} placeholder="搜索并选择自定义标签" allowCreate={false} onAdd={(label) => onFilterChange({ ...filter, customTags: [...filter.customTags, label] })} onRemove={(label) => onFilterChange({ ...filter, customTags: filter.customTags.filter((item) => contentPoolCustomTagKey(item) !== contentPoolCustomTagKey(label)) })} /></div>
      <label className="canvas-content-pool-local"><input type="checkbox" checked={filter.localMediaComplete} onChange={(event) => onFilterChange({ ...filter, localMediaComplete: event.target.checked })} /><span>仅本地媒体完整</span></label>
    </details>
    <div className="canvas-content-pool-toolbar">
      <span>{page.total} 条匹配{mode === "manual" ? ` · 已选 ${selected.size}` : mode === "match" ? " · 预演时动态冻结" : ""}</span>
      {mode === "manual" ? <div><button type="button" onClick={() => void selectAllMatching()} disabled={busy || selecting || displayQuery !== query || !page.total}>选择全部匹配</button><button type="button" onClick={() => onSelectionChange?.([])} disabled={!selected.size}>清空</button></div> : null}
    </div>
    <div ref={resultsRef} onScroll={() => { if (scope && memoryKey) { const nextNotice = writeContentPoolBrowserMemory(scope, memoryKey, current.current.filter, resultsRef.current?.scrollTop || 0); if (nextNotice) setNotice(nextNotice); } }} className={`canvas-content-pool-results${busy ? " is-loading" : ""}`} aria-busy={busy}>
      {page.items.length ? <div className="canvas-content-pool-list">{page.items.map((item) => <article key={item.id} className={selected.has(item.id) ? "is-selected" : ""}>
        <button type="button" className="canvas-content-pool-select" aria-pressed={selected.has(item.id)} disabled={displayQuery !== query || mode === "match" || (mode === "manual" && !selected.has(item.id) && selected.size >= 200)} onClick={() => onToggle(item)}>
          <span className="canvas-content-pool-thumbnail">{item.thumbnailUrl ? <Image src={item.thumbnailUrl} alt="" width={72} height={72} unoptimized referrerPolicy="no-referrer" /> : item.videoUrls.length ? <Video /> : <FileText />}</span>
          <span className="canvas-content-pool-copy"><strong>{item.title || item.body.slice(0, 48) || "未命名素材"}</strong><small>{item.platform} · {item.projectName} · {item.status}</small><small>热度 {item.hotScore} · {formatContentPoolSelectionTime(item)}</small>{item.contentTags.length ? <span className="canvas-content-pool-tags">{item.contentTags.slice(0, 2).map((tag) => <em key={tag}>{tag}</em>)}</span> : null}{item.customTags.length ? <span className="canvas-content-pool-tags is-custom">{item.customTags.slice(0, 2).map((tag) => <em key={tag}>{tag}</em>)}</span> : null}</span>
          {mode !== "match" ? <span className="canvas-content-pool-mark">{selected.has(item.id) ? <CheckCircle2 /> : mode === "single" ? <span /> : <Square />}</span> : null}
        </button>
        {item.thumbnailUrl ? <button type="button" className="canvas-content-pool-preview" onClick={() => onPreviewImage(item.thumbnailUrl!, 0)} title="预览图片" aria-label={`预览 ${item.title || item.id}`}><Eye /></button> : null}
      </article>)}</div> : !busy ? <div className="canvas-schedule-asset-state"><Layers3 /><span>没有符合当前条件的素材</span></div> : null}
      {busy && !page.items.length ? <div className="canvas-schedule-asset-state"><LoaderCircle className="animate-spin" /><span>正在加载内容池</span></div> : null}
      {page.nextCursor ? <div className="canvas-schedule-asset-load-more"><button type="button" disabled={busy || displayQuery !== query} onClick={() => void load(true, page.nextCursor)}>加载更多</button></div> : null}
    </div>
    {error ? <p className="canvas-picker-error">{error}</p> : null}
    {notice ? <p className="canvas-picker-error">{notice}</p> : null}
  </div>;
}

export function ContentPoolFilterChecks({ label, options, selected, onToggle }: { label: string; options: string[]; selected: readonly string[]; onToggle: (value: string) => void }) {
  return <fieldset className="canvas-content-pool-checks"><legend>{label}</legend><div>{options.map((option) => <label key={option}><input type="checkbox" checked={selected.includes(option)} onChange={() => onToggle(option)} /><span>{contentPoolFilterLabel(option)}</span></label>)}</div></fieldset>;
}

export function CanvasScheduleV2Editor({ schedule, graph, busy, onDefinitionChange, onAction, onPreview, presetsOnly = false }: {
  presetsOnly?: boolean;
  schedule: CanvasSchedule;
  graph: CanvasGraph;
  busy: boolean;
  onDefinitionChange: (definition: CanvasScheduleV2Definition) => void;
  onAction: (action: string, payload?: Record<string, unknown>, saveFirst?: boolean) => void;
  onPreview: (preview: Extract<NonNullable<PreviewState>, { kind: "image" }>) => void;
}) {
  const definition = schedule.definition;
  if (!definition) return <div className="canvas-task-empty"><AlertTriangle /><span>灵活调度定义缺失</span></div>;
  const collectionPreset = canvasCollectionScheduleDefinition(graph);
  const childOutputs = graph.nodes.flatMap((node) => {
    return getCanvasIterationOutputPorts(node).filter((port) => ["text", "images", "videos"].includes(port.kind)).map((port) => ({
      node,
      port,
      label: `${canvasNodeDisplayName(node)} · ${port.label} · ${node.id.slice(-4)}`,
    }));
  });
  const sharedOutputCandidates = canvasScheduleSharedOutputCandidates(graph, definition);
  const sharedOutputs = definition.sharedOutputs || [];
  const sharedOutputCandidateKinds = new Map(sharedOutputCandidates.map((candidate) => [`${candidate.node.id}:${candidate.port.id}`, candidate.artifactKind]));
  const isValidSharedOutput = (output: CanvasScheduleV2SharedOutput) =>
    sharedOutputCandidateKinds.get(`${output.nodeId}:${output.outputPort}`) === output.artifactKind;
  const invalidSharedOutputs = sharedOutputs.filter((output) => !isValidSharedOutput(output));
  const mainTargets = graph.nodes.filter((node) => node.type !== "publish.feishu");
  const patchDefinition = (patch: Partial<CanvasScheduleV2Definition>) => onDefinitionChange({ ...definition, ...patch });
  const patchParameter = (parameterId: string, updater: (parameter: CanvasScheduleParameter) => CanvasScheduleParameter) => {
    patchDefinition({ parameters: definition.parameters.map((parameter) => parameter.id === parameterId ? updater(parameter) : parameter) });
  };
  const addParameter = (scope: "main" | "child") => {
    const first = firstCanvasBatchBinding(graph);
    if (!first) return;
    const valueType = first.field.parameterTypes[0];
    const source = defaultCanvasScheduleParameterSource(valueType, first.node.id);
    if (scope === "main" && source.mode === "library-filter") source.filter.mode = "manual";
    patchDefinition({ parameters: [...definition.parameters, {
      id: nextCanvasScheduleParameterId(),
      name: scope === "main" ? `任务组参数 ${definition.parameters.filter((parameter) => parameter.scope === scope).length + 1}` : `结果项参数 ${definition.parameters.filter((parameter) => parameter.scope === scope).length + 1}`,
      scope,
      valueType,
      source,
      expansion: valueType === "video" || scope === "child" ? "each" : "fixed",
      binding: first.binding,
    }] });
  };
  const applyPeopleSceneVehiclePreset = () => {
    const imageInputs = graph.nodes.filter((node) => getCanvasBatchBindableFields(node).some((field) => field.parameterTypes.includes("image")));
    if (imageInputs.length < 3) return;
    const names = ["人物参考图", "场景参考图", "车辆角度图"];
    const parameters = imageInputs.slice(0, 3).map((node, index): CanvasScheduleParameter => ({
      id: nextCanvasScheduleParameterId(),
      name: names[index],
      scope: index === 2 ? "child" : "main",
      valueType: "image",
      source: { mode: "library-filter", filter: { ...emptyScheduleFilter(), mode: "manual" } },
      expansion: index === 2 ? "each" : "fixed",
      binding: { nodeId: node.id, fieldKey: getCanvasBatchBindableFields(node).find((field) => field.parameterTypes.includes("image"))!.key },
    }));
    patchDefinition({ parameters, expansion: { main: "cartesian", child: "cartesian" }, aggregationPolicy: "at-least-one" });
  };
  const sourceVideoNode = graph.nodes.find((node) => getCanvasBatchBindableFields(node).some((field) => field.parameterTypes.includes("source-video")));
  const promptNode = graph.nodes.find((node) => node.type === "input.text");
  const reconstructNode = graph.nodes.find((node) => node.type === "utility.video-reconstruct");
  const applyVideoReconstructPreset = () => {
    if (!sourceVideoNode || !promptNode || !reconstructNode) return;
    const sourceField = getCanvasBatchBindableFields(sourceVideoNode).find((field) => field.parameterTypes.includes("source-video"));
    const promptField = getCanvasBatchBindableFields(promptNode).find((field) => field.parameterTypes.includes("text"));
    if (!sourceField || !promptField) return;
    const parameters: CanvasScheduleParameter[] = [
      {
        id: nextCanvasScheduleParameterId(), name: "源视频", scope: "main", valueType: "source-video",
        source: { mode: "source-video-links", links: [], projectName: "视频内容重构" }, expansion: "each",
        binding: { nodeId: sourceVideoNode.id, fieldKey: sourceField.key },
      },
      {
        id: nextCanvasScheduleParameterId(), name: "画面提示词", scope: "main", valueType: "text",
        source: { mode: "manual-list", values: [""] }, expansion: "each",
        binding: { nodeId: promptNode.id, fieldKey: promptField.key },
      },
    ];
    patchDefinition({
      parameters,
      expansion: { main: "zip", child: "cartesian" },
      childResult: { nodeId: reconstructNode.id, outputPort: "videos", artifactKind: "videos" },
      aggregationPolicy: "all",
    });
  };
  const workbookNode = graph.nodes.find((node) => node.type === "input.competitor-workbook");
  const workbookImageNode = graph.nodes.find((node) => node.type === "model.gpt-image" && node.version >= 2);
  const workbookComposeNode = graph.nodes.find((node) => node.type === "compose.social-post");
  const workbookReferenceNode = graph.nodes.find((node) => node.type === "input.library-images");
  const applyCompetitorWorkbookPreset = () => {
    if (!workbookNode || !workbookImageNode || !workbookComposeNode) return;
    const workbookSource = (field: "title" | "body" | "card") => ({
      mode: "competitor-workbook" as const,
      filePath: String(workbookNode.config.path || ""),
      worksheet: String(workbookNode.config.worksheet || "文案汇总"),
      rowStart: 2,
      rowEnd: undefined,
      field,
    });
    const parameters: CanvasScheduleParameter[] = [
      { id: nextCanvasScheduleParameterId(), name: "Excel 标题", scope: "main", valueType: "text", source: workbookSource("title"), expansion: "each", binding: { nodeId: workbookNode.id, fieldKey: "rowTitle" } },
      { id: nextCanvasScheduleParameterId(), name: "Excel 正文", scope: "main", valueType: "text", source: workbookSource("body"), expansion: "each", binding: { nodeId: workbookNode.id, fieldKey: "rowBody" } },
      { id: nextCanvasScheduleParameterId(), name: "参数卡片", scope: "child", valueType: "text", source: workbookSource("card"), expansion: "each", binding: { nodeId: workbookNode.id, fieldKey: "cardText" } },
    ];
    if (workbookReferenceNode) parameters.push({
      id: nextCanvasScheduleParameterId(), name: "全批次车型参考图", scope: "child", valueType: "image-group",
      source: { mode: "library-filter", filter: { ...emptyScheduleFilter(), mode: "manual", assetIds: normalizeConfigUrls(workbookReferenceNode.config.assetIds) } },
      expansion: "fixed", binding: { nodeId: workbookReferenceNode.id, fieldKey: "assetIds" },
    });
    patchDefinition({
      parameters,
      expansion: { main: "zip", child: "zip" },
      childResult: { nodeId: workbookImageNode.id, outputPort: "images", artifactKind: "images" },
      mainTargetNodeId: workbookComposeNode.id,
      aggregationPolicy: "at-least-one",
    });
  };
  const workbookSource = definition.parameters.find((parameter) => parameter.source.mode === "competitor-workbook")?.source;
  const patchWorkbookSource = (patch: Partial<Extract<CanvasScheduleParameterSource, { mode: "competitor-workbook" }>>) => patchDefinition({
    parameters: definition.parameters.map((parameter) => parameter.source.mode !== "competitor-workbook" ? parameter : {
      ...parameter,
      source: { ...parameter.source, ...patch, snapshot: undefined },
    }),
  });
  if (presetsOnly) return <details className="batch-advanced"><summary>从常用配置开始</summary><p>应用配置会替换当前素材与生成方式，请先保存需要保留的草稿。</p><div className="batch-actions">
    {collectionPreset ? <button type="button" onClick={() => onDefinitionChange(collectionPreset)} disabled={busy}>按链接采集</button> : null}
    <button type="button" disabled={busy || !workbookNode || !workbookImageNode || !workbookComposeNode} onClick={applyCompetitorWorkbookPreset}>竞品 Excel</button>
    <button type="button" disabled={busy || !sourceVideoNode || !promptNode || !reconstructNode} onClick={applyVideoReconstructPreset}>视频重构</button>
    <button type="button" disabled={busy || graph.nodes.filter((node) => getCanvasBatchBindableFields(node).some((field) => field.parameterTypes.includes("image"))).length < 3} onClick={applyPeopleSceneVehiclePreset}>人物与场景</button>
  </div><small>只有工作流包含相应输入与处理步骤时，配置才可使用。</small></details>;
  return <div className="canvas-schedule-v2">
    {collectionPreset ? <div className="canvas-schedule-primary-actions" style={{ flexWrap: "wrap" }}><button type="button" style={{ flexShrink: 0, whiteSpace: "nowrap" }} disabled={busy} onClick={() => onDefinitionChange(collectionPreset)}><Download />内容采集预设</button><small style={{ flex: "1 1 260px" }}>按链接或飞书编号拆任务，每条内容只采集一次，自动执行所选下游。预设支持文字、图片或视频结果；修改节点来源或平台后请重新应用预设。并发使用现有任务队列，叠加逐图节点内部并发，请按需调低。</small></div> : null}
    <section className="canvas-scheduler-bindings">
      <header><span><strong>执行节点</strong><small>结果项输出会在任务组阶段替换为冻结结果</small></span><button type="button" disabled={!workbookNode || !workbookImageNode || !workbookComposeNode} onClick={applyCompetitorWorkbookPreset}><Sheet />竞品 Excel 预设</button><button type="button" disabled={!sourceVideoNode || !promptNode || !reconstructNode} onClick={applyVideoReconstructPreset}><Video />视频重构预设</button><button type="button" disabled={graph.nodes.filter((node) => getCanvasBatchBindableFields(node).some((field) => field.parameterTypes.includes("image"))).length < 3} onClick={applyPeopleSceneVehiclePreset}><Images />人物场景预设</button></header>
      <div>
        <label><span>结果项输出</span><select value={`${definition.childResult.nodeId}::${definition.childResult.outputPort}`} onChange={(event) => {
          const output = childOutputs.find((candidate) => `${candidate.node.id}::${candidate.port.id}` === event.target.value);
          if (output && ["text", "images", "videos"].includes(output.port.kind)) patchDefinition({ childResult: { nodeId: output.node.id, outputPort: output.port.id, artifactKind: output.port.kind as "text" | "images" | "videos" } });
        }}><option value="::">未选择</option>{childOutputs.map((output) => <option key={`${output.node.id}-${output.port.id}`} value={`${output.node.id}::${output.port.id}`}>{output.label}</option>)}</select></label>
        <label><span>任务组目标（可选）</span><select value={definition.mainTargetNodeId || ""} onChange={(event) => patchDefinition({ mainTargetNodeId: event.target.value || undefined })}><option value="">仅汇总结果项</option>{mainTargets.map((node) => <option key={node.id} value={node.id}>{canvasNodeOptionLabel(node)}</option>)}</select></label>
        <label><span>失败聚合</span><select value={definition.aggregationPolicy} onChange={(event) => patchDefinition({ aggregationPolicy: event.target.value as CanvasScheduleV2Definition["aggregationPolicy"] })}><option value="at-least-one">至少一个成功</option><option value="all">必须全部成功</option></select></label>
      </div>
      {workbookSource?.mode === "competitor-workbook" ? <div className="canvas-workbook-schedule-source">
        <label><span>工作簿路径</span><input value={workbookSource.filePath || ""} onChange={(event) => patchWorkbookSource({ filePath: event.target.value })} /></label>
        <label><span>工作表</span><input value={workbookSource.worksheet} onChange={(event) => patchWorkbookSource({ worksheet: event.target.value })} /></label>
        <div><label><span>起始行</span><input type="number" min={2} value={workbookSource.rowStart || 2} onChange={(event) => patchWorkbookSource({ rowStart: Number(event.target.value) })} /></label><label><span>结束行</span><input type="number" min={2} placeholder="全部" value={workbookSource.rowEnd || ""} onChange={(event) => patchWorkbookSource({ rowEnd: event.target.value ? Number(event.target.value) : undefined })} /></label></div>
      </div> : null}
      <div className="canvas-schedule-shared-outputs">
        <header><span><strong>任务组共享输出</strong><small>{invalidSharedOutputs.length ? `${invalidSharedOutputs.length} 项选择已失效，请移除后预演` : sharedOutputs.length ? `已选择 ${sharedOutputs.length} 项 · 每个任务组执行一次` : "未启用时保持现有结果项执行方式"}</small></span>{invalidSharedOutputs.length ? <button type="button" onClick={() => patchDefinition({ sharedOutputs: sharedOutputs.filter(isValidSharedOutput) })}><Trash2 />移除失效项</button> : <Share2 />}</header>
        {sharedOutputCandidates.length ? <div role="group" aria-label="主任务共享输出">
          {sharedOutputCandidates.map((candidate) => {
            const selected = sharedOutputs.some((output) => output.nodeId === candidate.node.id && output.outputPort === candidate.port.id);
            return <label key={`${candidate.node.id}-${candidate.port.id}`} className={selected ? "is-selected" : ""}>
              <input type="checkbox" checked={selected} onChange={(event) => patchDefinition({
                sharedOutputs: event.target.checked
                  ? [...sharedOutputs.filter((output) => !(["input.content-collection", "utility.image-iterate"].includes(candidate.node.type)) || output.nodeId !== candidate.node.id), ...sharedOutputCandidates.filter((item) => item.node.id === candidate.node.id && ((["input.content-collection", "utility.image-iterate"].includes(candidate.node.type)) || item.port.id === candidate.port.id)).map((item) => ({ nodeId: item.node.id, outputPort: item.port.id, artifactKind: item.artifactKind }))]
                  : sharedOutputs.filter((output) => output.nodeId !== candidate.node.id || (!(["input.content-collection", "utility.image-iterate"].includes(candidate.node.type)) && output.outputPort !== candidate.port.id)),
              })} />
              <span><strong>{canvasNodeDisplayName(candidate.node)}</strong><small>{candidate.port.label} · {portKindLabel(candidate.port.kind)} · 每个主任务 1 次</small></span>
              <CheckCircle2 />
            </label>;
          })}
        </div> : <p>当前画布没有可共享的严格上游单输出节点。</p>}
      </div>
    </section>
    {(["main", "child"] as const).map((scope) => <section className="canvas-schedule-parameter-section" key={scope}>
      <header><span><strong>{scope === "main" ? "任务组参数" : "结果项参数"}</strong><small>{definition.parameters.filter((parameter) => parameter.scope === scope).length} 个参数</small></span><label><span>组合</span><select value={definition.expansion[scope]} onChange={(event) => patchDefinition({ expansion: { ...definition.expansion, [scope]: event.target.value as "cartesian" | "zip" } })}><option value="cartesian">笛卡尔积</option><option value="zip">按序配对</option></select></label><button className="canvas-schedule-add" type="button" onClick={() => addParameter(scope)}><Plus />添加参数</button></header>
      <div>{definition.parameters.filter((parameter) => parameter.scope === scope).map((parameter) => <CanvasScheduleParameterEditor
        key={parameter.id}
        parameter={parameter}
        browserKey={`schedule:${schedule.id}:${parameter.id}`}
        graph={graph}
        onPreview={onPreview}
        onChange={(next) => patchParameter(parameter.id, () => next)}
        onRemove={() => patchDefinition({ parameters: definition.parameters.filter((candidate) => candidate.id !== parameter.id) })}
      />)}</div>
      {!definition.parameters.some((parameter) => parameter.scope === scope) ? <div className="canvas-task-empty"><Plus /><span>添加一个{scope === "main" ? "任务组" : "结果项"}参数</span></div> : null}
    </section>)}
    {schedule.mainTasks?.length ? <ScheduleV2Preview schedule={schedule} onPreview={onPreview} /> : null}
    <div className="canvas-schedule-primary-actions">
      <button type="button" onClick={() => onAction("preflight", {}, true)} disabled={busy}><RefreshCw />预演展开</button>
      {schedule.status === "ready" && schedule.previewRevision ? <button type="button" onClick={() => onAction("launch", { previewRevision: schedule.previewRevision })} disabled={busy}><Play />确认并启动</button> : null}
    </div>
  </div>;
}

export function CanvasScheduleParameterEditor({ parameter, graph, onChange, onRemove, onPreview, browserKey }: {
  browserKey: string;
  parameter: CanvasScheduleParameter;
  graph: CanvasGraph;
  onChange: (parameter: CanvasScheduleParameter) => void;
  onRemove: () => void;
  onPreview: (preview: Extract<NonNullable<PreviewState>, { kind: "image" }>) => void;
}) {
  const bindingOptions = canvasBatchBindingOptions(graph, parameter.valueType);
  const sampleCount = canvasScheduleParameterSampleCount(parameter);
  const updateType = (valueType: CanvasScheduleParameterType) => {
    const binding = canvasBatchBindingOptions(graph, valueType)[0];
    let source = defaultCanvasScheduleParameterSource(valueType, binding?.node.id);
    if (source.mode === "fixed" && parameter.expansion !== "fixed") source = { mode: "manual-list", values: source.values };
    if ((valueType === "image" || valueType === "image-group") && parameter.expansion === "fixed" && source.mode === "library-filter") source.filter.mode = "manual";
    onChange({
      ...parameter,
      scope: valueType === "content-pool" ? "main" : parameter.scope,
      valueType,
      source,
      expansion: valueType === "video" ? "each" : parameter.expansion,
      binding: binding ? binding.binding : { nodeId: "", fieldKey: "" },
    });
  };
  const updateExpansion = (expansion: CanvasScheduleParameter["expansion"]) => {
    const source = parameter.source;
    if (source.mode === "content-pool-filter") {
      onChange({
        ...parameter,
        expansion,
        sampleCount: expansion === "random" ? sampleCount : undefined,
        randomCount: undefined,
        source: { ...source, filter: { ...source.filter, itemIds: expansion === "fixed" ? source.filter.itemIds.slice(0, 1) : source.filter.itemIds } },
      });
      return;
    }
    if (source.mode === "fixed" || source.mode === "manual-list") {
      const values = expansion === "fixed" ? source.values.slice(0, 1) : source.values;
      onChange({
        ...parameter,
        expansion,
        sampleCount: expansion === "random" ? sampleCount : undefined,
        randomCount: undefined,
        source: {
          ...source,
          mode: expansion === "fixed" ? "fixed" : "manual-list",
          values: values.length ? values : [defaultCanvasScheduleScalarValue(parameter.valueType)],
          listSeparator: parameter.valueType === "text" && values.some((value) => /[\r\n]/.test(String(value))) ? "delimiter" : source.listSeparator,
        },
      });
      return;
    }
    onChange({ ...parameter, expansion, sampleCount: expansion === "random" ? sampleCount : undefined, randomCount: undefined });
  };
  return <article className="canvas-schedule-parameter">
    <header><input maxLength={80} value={parameter.name} onChange={(event) => onChange({ ...parameter, name: event.target.value })} aria-label="参数名称" /><button type="button" onClick={onRemove} aria-label="删除参数" title="删除参数"><Trash2 /></button></header>
    <div className="canvas-schedule-parameter-grid">
      <label><span>类型</span><select value={parameter.valueType} onChange={(event) => updateType(event.target.value as CanvasScheduleParameterType)}>{canvasScheduleParameterTypes.map((type) => <option key={type} value={type}>{canvasScheduleParameterTypeLabel(type)}</option>)}</select></label>
      <label><span>展开</span><select value={parameter.expansion} onChange={(event) => updateExpansion(event.target.value as CanvasScheduleParameter["expansion"])}><option value="fixed">{parameter.valueType === "content-pool" ? "固定单条" : "固定共享"}</option><option value="each">{parameter.valueType === "content-pool" ? "每条一项" : "全量逐项"}</option><option value="random">随机抽取</option></select></label>
      <label><span>绑定字段</span><select value={canvasBatchBindingKey(parameter.binding)} onChange={(event) => {
        const option = bindingOptions.find((candidate) => canvasBatchBindingKey(candidate.binding) === event.target.value);
        if (option) onChange({
          ...parameter,
          binding: option.binding,
          source: parameter.valueType === "video" ? { mode: "video-loader-queue", nodeId: option.node.id } : parameter.source,
        });
      }}><option value={canvasBatchBindingKey({ nodeId: "", fieldKey: "" })}>未选择</option>{bindingOptions.map((option) => <option key={canvasBatchBindingKey(option.binding)} value={canvasBatchBindingKey(option.binding)}>{option.label}</option>)}</select></label>
    </div>
    {parameter.expansion === "random" ? <CanvasScheduleSampleCountEditor parameter={parameter} sampleCount={sampleCount} onChange={onChange} /> : null}
    <CanvasScheduleParameterSourceEditor parameter={parameter} graph={graph} onChange={onChange} onPreview={onPreview} browserKey={browserKey} />
  </article>;
}

export function CanvasScheduleSampleCountEditor({ parameter, sampleCount, onChange }: {
  parameter: CanvasScheduleParameter;
  sampleCount: CanvasScheduleSampleCount;
  onChange: (parameter: CanvasScheduleParameter) => void;
}) {
  const setSampleCount = (next: CanvasScheduleSampleCount) => onChange({ ...parameter, sampleCount: next, randomCount: undefined });
  const exactValue = sampleCount.mode === "exact" ? sampleCount.value : sampleCount.min;
  return <div className="canvas-schedule-sample-controls">
    <div className="canvas-schedule-sample-mode"><span>抽取数量</span><div role="group" aria-label="抽取数量模式">
      <button type="button" aria-pressed={sampleCount.mode === "exact"} onClick={() => setSampleCount({ mode: "exact", value: exactValue })}>固定个数</button>
      <button type="button" aria-pressed={sampleCount.mode === "range"} onClick={() => setSampleCount({ mode: "range", min: exactValue, max: exactValue })}>随机范围</button>
    </div></div>
    {sampleCount.mode === "exact"
      ? <label><span>个数</span><input type="number" min={1} step={1} value={sampleCount.value} onChange={(event) => setSampleCount({ mode: "exact", value: positiveCanvasScheduleInteger(event.target.value) })} /></label>
      : <div className="canvas-schedule-sample-range"><label><span>最少</span><input type="number" min={1} step={1} value={sampleCount.min} onChange={(event) => {
        const min = positiveCanvasScheduleInteger(event.target.value);
        setSampleCount({ mode: "range", min, max: Math.max(min, sampleCount.max) });
      }} /></label><label><span>最多</span><input type="number" min={1} step={1} value={sampleCount.max} onChange={(event) => {
        const max = positiveCanvasScheduleInteger(event.target.value);
        setSampleCount({ mode: "range", min: Math.min(sampleCount.min, max), max });
      }} /></label></div>}
    <small>{canvasScheduleSampleCountSummary(parameter.scope, sampleCount)}</small>
  </div>;
}

export function CanvasScheduleParameterSourceEditor({ parameter, graph, onChange, onPreview, browserKey }: { browserKey: string; parameter: CanvasScheduleParameter; graph: CanvasGraph; onChange: (parameter: CanvasScheduleParameter) => void; onPreview: (preview: Extract<NonNullable<PreviewState>, { kind: "image" }>) => void }) {
  if (parameter.source.mode === "competitor-workbook") {
    return <div className="canvas-schedule-parameter-source canvas-workbook-parameter-source"><Sheet /><span><strong>{parameter.source.field === "title" ? "标题" : parameter.source.field === "body" ? "正文" : "参数卡片"}</strong><small>预演时按工作簿行冻结，路径与行区间在上方统一配置</small></span></div>;
  }
  if (parameter.valueType === "video") {
    const nodeId = parameter.source.mode === "video-loader-queue" ? parameter.source.nodeId : parameter.binding.nodeId;
    const node = graph.nodes.find((candidate) => candidate.id === nodeId && candidate.type === "input.video-loader");
    const count = node ? canvasVideoSnapshotsFromConfig(node.config).length : 0;
    return <div className="canvas-schedule-parameter-source canvas-schedule-video-source">
      <FileVideo2 />
      <span><strong>{node ? canvasNodeDisplayName(node) : "视频加载节点未绑定"}</strong><small>{node ? `预演时按当前顺序冻结 ${count} 个视频` : "请选择兼容的视频队列字段"}</small></span>
    </div>;
  }
  if (parameter.valueType === "source-video") {
    const source = parameter.source.mode === "source-video-links"
      ? parameter.source
      : defaultCanvasScheduleParameterSource("source-video") as Extract<CanvasScheduleParameterSource, { mode: "source-video-links" }>;
    return <div className="canvas-schedule-parameter-source canvas-schedule-parameter-values">
      <label><span>内容池项目</span><input value={source.projectName} maxLength={80} onChange={(event) => onChange({ ...parameter, source: { ...source, projectName: event.target.value } })} /></label>
      <label><span>源链接（每行一个，最多 200 条）</span><textarea value={source.links.join("\n")} onChange={(event) => onChange({ ...parameter, expansion: "each", source: { ...source, links: event.target.value.split(/\r?\n/).map((link) => link.trim()).filter(Boolean).slice(0, 200) } })} /></label>
    </div>;
  }
  if (parameter.valueType === "content-pool") {
    const source = parameter.source.mode === "content-pool-filter"
      ? parameter.source
      : defaultCanvasScheduleParameterSource("content-pool") as Extract<CanvasScheduleParameterSource, { mode: "content-pool-filter" }>;
    return <ContentPoolScheduleSourceEditor parameter={parameter} source={source} onChange={onChange} onPreview={onPreview} browserKey={browserKey} />;
  }
  if (parameter.valueType === "image" || parameter.valueType === "image-group") {
    const source = parameter.source.mode === "library-filter" ? parameter.source : defaultCanvasScheduleParameterSource(parameter.valueType) as Extract<CanvasScheduleParameterSource, { mode: "library-filter" }>;
    return <ScheduleAssetFilterEditor title={parameter.valueType === "image-group" ? "图片组来源" : "图片来源"} filter={source.filter} singleSelection={parameter.valueType === "image" && parameter.expansion === "fixed"} filterMatchLabel onChange={(filter) => onChange({ ...parameter, source: { ...source, filter } })} onPreview={onPreview} />;
  }
  if (parameter.valueType === "copy") {
    const source = parameter.source.mode === "copy-filter" ? parameter.source : defaultCanvasScheduleParameterSource("copy") as Extract<CanvasScheduleParameterSource, { mode: "copy-filter" }>;
    return <ScheduleCopyFilterEditor filter={source.filter} singleSelection={parameter.expansion === "fixed"} filterMatchLabel onChange={(filter) => onChange({ ...parameter, source: { mode: "copy-filter", filter } })} />;
  }
  const source = parameter.source.mode === "fixed" || parameter.source.mode === "manual-list" ? parameter.source : defaultCanvasScheduleParameterSource(parameter.valueType) as Extract<CanvasScheduleParameterSource, { mode: "fixed" | "manual-list" }>;
  return <div className="canvas-schedule-parameter-source canvas-schedule-parameter-values"><label><span>值来源</span><select value={source.mode} onChange={(event) => {
    const mode = event.target.value as "fixed" | "manual-list";
    const nextValues = mode === "fixed" ? source.values.slice(0, 1) : source.values;
    onChange({ ...parameter, expansion: mode === "manual-list" ? "each" : "fixed", sampleCount: undefined, randomCount: undefined, source: { ...source, mode, values: nextValues.length ? nextValues : [defaultCanvasScheduleScalarValue(parameter.valueType)], listSeparator: parameter.valueType === "text" && nextValues.some((value) => /[\r\n]/.test(String(value))) ? "delimiter" : source.listSeparator } });
  }}><option value="fixed">固定值</option><option value="manual-list">手工列表</option></select></label><CanvasScheduleScalarValuesEditor key={`${parameter.id}:${parameter.valueType}:${source.mode}`} valueType={parameter.valueType} source={source} onChange={(source) => onChange({ ...parameter, source })} /></div>;
}

export function CanvasScheduleScalarValuesEditor({ valueType, source, onChange }: {
  valueType: CanvasScheduleParameterType;
  source: Extract<CanvasScheduleParameterSource, { mode: "fixed" | "manual-list" }>;
  onChange: (source: Extract<CanvasScheduleParameterSource, { mode: "fixed" | "manual-list" }>) => void;
}) {
  const noteId = useId();
  const serializedValues = JSON.stringify([source.values, source.listSeparator]);
  const [draft, setDraft] = useState({ source: serializedValues, value: formatCanvasScheduleScalarValues(source) });
  if (draft.source !== serializedValues) {
    setDraft({ source: serializedValues, value: formatCanvasScheduleScalarValues(source) });
  }
  const updateDraft = (value: string, listSeparator = source.listSeparator) => {
    const values = parseCanvasScheduleScalarValues(valueType, value, source.mode, listSeparator);
    // Keep editing whitespace while publishing normalized values to the schedule.
    setDraft({ source: JSON.stringify([values, listSeparator]), value });
    onChange({ ...source, values, ...(listSeparator === undefined ? {} : { listSeparator }) });
  };
  const isTextList = valueType === "text" && source.mode === "manual-list";
  const delimiterMode = isTextList && source.listSeparator === "delimiter";
  return <div className="canvas-schedule-scalar-editor">
    {isTextList ? <label><span>分隔方式</span><select aria-label="分隔方式" value={source.listSeparator ?? "line"} onChange={(event) => updateDraft(draft.value, event.target.value as "line" | "delimiter")}><option value="line">按行</option><option value="delimiter">按分隔符（---）</option></select></label> : null}
    <label><span>{source.mode === "fixed" ? "参数值" : delimiterMode ? "多行任务文本" : "每行一个值"}</span><textarea aria-label={source.mode === "fixed" ? "参数值" : delimiterMode ? "多行任务文本" : "每行一个值"} aria-describedby={isTextList ? noteId : undefined} rows={delimiterMode ? 10 : 3} value={draft.value} onChange={(event) => updateDraft(event.target.value)} /></label>
    {isTextList ? <small id={noteId}>{delimiterMode ? "单独一行 --- 分隔任务；段内换行和空行保留，分隔符不会传入任务。" : "每行一个任务；多段提示词请选择“按分隔符（---）”。"}</small> : null}
  </div>;
}

export function ScheduleV2Preview({ schedule, onPreview }: {
  schedule: CanvasSchedule;
  onPreview: (preview: Extract<NonNullable<PreviewState>, { kind: "image" }>) => void;
}) {
  const hasSharedOutputs = Boolean(schedule.definition?.sharedOutputs?.length);
  return <div className="canvas-schedule-preview canvas-schedule-v2-preview"><header><span>展开预览 · {schedule.totalMainTasks || 0} 个任务组 · {schedule.totalChildTasks || 0} 个结果项</span></header><div>{(schedule.mainTasks || []).map((main, index) => <article key={main.id}><div className="canvas-schedule-v2-main-task"><ScheduleV2PreviewImages values={main.parameterValues} label={`任务组 ${index + 1}`} onPreview={onPreview} /><span><strong>{main.workbookRow ? `Excel 第 ${main.workbookRow.excelRowNumber} 行` : `任务组 ${index + 1}`} · {main.childTasks.length} 个结果项</strong><small>{main.workbookRow?.title || formatCanvasScheduleParameterValues(main.parameterValues)}</small></span></div>{hasSharedOutputs ? <CanvasScheduleSharedStage main={main} preview /> : null}<div>{main.childTasks.map((child, childIndex) => <span className="canvas-schedule-v2-child-task" key={child.id}><ScheduleV2PreviewImages values={child.parameterValues} label={`结果项 ${childIndex + 1}`} onPreview={onPreview} /><strong>{child.workbookCard ? `参数卡片 ${child.workbookCard.cardIndex}` : `结果项 ${childIndex + 1}`}</strong><small>{child.workbookCard?.text || formatCanvasScheduleParameterValues(child.parameterValues)}</small></span>)}</div></article>)}</div></div>;
}

export function ScheduleV2PreviewImages({ values, label, onPreview }: {
  values: Record<string, CanvasScheduleParameterValue>;
  label: string;
  onPreview: (preview: Extract<NonNullable<PreviewState>, { kind: "image" }>) => void;
}) {
  const images = canvasScheduleParameterImages(values);
  if (!images.length) return null;
  const sequence = images.map((image) => ({ id: image.id, url: image.url, width: image.width, height: image.height }));
  return <div className="canvas-schedule-v2-preview-images">{images.slice(0, 4).map((image, index) => <button
    type="button"
    key={`${image.id}-${index}`}
    onClick={() => onPreview({ kind: "image", url: image.url, index, width: image.width, height: image.height, sequence })}
    aria-label={`预览${label}图片 ${index + 1}：${image.name || image.id}`}
    title="预览图片"
  >
    <Image src={image.url} alt={image.name || ""} width={72} height={52} unoptimized referrerPolicy="no-referrer" />
    {index === 3 && images.length > 4 ? <em>+{images.length - 4}</em> : null}
  </button>)}</div>;
}

export function ScheduleV2RuntimeTree({ schedule, busy, onAction }: { schedule: CanvasSchedule; busy: boolean; onAction: (action: string, payload?: Record<string, unknown>) => void }) {
  const mainTasks = schedule.mainTasks || [];
  const completed = mainTasks.filter((main) => ["completed", "partial"].includes(main.status)).length;
  const retryableCount = mainTasks.reduce((count, main) => count + main.childTasks.filter(isCanvasScheduleV2ChildRetryable).length + (main.sharedStatus === "failed" ? 1 : 0) + (main.aggregateRetryable ? 1 : 0), 0);
  const failedCount = mainTasks.reduce((count, main) => count + main.childTasks.filter((child) => child.status === "failed").length + (main.sharedStatus === "failed" ? 1 : 0) + (main.aggregateRetryable ? 1 : 0), 0);
  return <div className="canvas-schedule-runtime">
    <div className="canvas-schedule-runtime-actions">
      {["queued", "running"].includes(schedule.status) ? <button type="button" onClick={() => onAction("pause")} disabled={busy}><Square />暂停</button> : null}
      {schedule.status === "paused" ? <button type="button" onClick={() => onAction("resume")} disabled={busy}><Play />继续</button> : null}
      {["queued", "running", "paused"].includes(schedule.status) ? <button className="danger" type="button" onClick={() => onAction("cancel")} disabled={busy}><X />取消</button> : null}
      {retryableCount ? <button type="button" onClick={() => onAction("retry-all")} disabled={busy}><RotateCcw />重试全部失败项（{retryableCount}）</button> : null}
      <span>完成 {completed}/{mainTasks.length} 组 · 失败 {failedCount} · 可重试 {retryableCount}</span>
    </div>
    {mainTasks.map((main, index) => <details key={main.id} open><summary><StatusIcon status={main.status} /><strong>{main.workbookRow ? `Excel 第 ${main.workbookRow.excelRowNumber} 行 · ${main.workbookRow.title}` : `任务组 ${index + 1} · ${formatCanvasScheduleParameterValues(main.parameterValues)}`}</strong><span>{main.childTasks.filter((child) => child.status === "completed").length}/{main.childTasks.length}</span><em>{canvasScheduleStatusLabel(main.status)}</em></summary><div className="canvas-schedule-runtime-content">
      {schedule.definition?.sharedOutputs?.length || main.sharedStatus ? <CanvasScheduleSharedStage main={main} busy={busy} onRetry={() => onAction("retry-shared", { mainTaskId: main.id })} /> : null}
      {main.resultArtifacts.length ? <CanvasScheduleArtifactSummary artifacts={main.resultArtifacts} /> : null}
      {main.generatedPostId ? <Link href={`/review?postId=${encodeURIComponent(main.generatedPostId)}`}>打开评审草稿</Link> : null}
      {["completed", "partial"].includes(main.status) && main.mainRunId ? <CanvasScheduleMainImageDownload runId={main.mainRunId} /> : null}
      {main.pendingCandidateSync ? <button type="button" onClick={() => onAction("accept-candidates", { mainTaskId: main.id })} disabled={busy}>接受新增候选图</button> : null}
      {main.childTasks.some(isCanvasScheduleV2ChildRetryable) ? <button type="button" onClick={() => onAction("retry-row", { mainTaskId: main.id })} disabled={busy}><RotateCcw />重试本组失败项（{main.childTasks.filter(isCanvasScheduleV2ChildRetryable).length}）</button> : null}
      {main.error ? <p>{main.error}</p> : null}
      <ScheduleAggregateFailure main={main} busy={busy} onAction={onAction} />
      <ScheduleIterationFailures key={`${schedule.id}:${main.id}:shared:${main.sharedStatus}`} scheduleId={schedule.id} mainTaskId={main.id} label={`任务组 ${index + 1} · 共享处理`} status={main.sharedStatus || "pending"} runId={main.sharedRunId} summaries={main.sharedIterationSummary} busy={busy} frozen={Boolean(main.sharedArtifacts?.length || main.childTasks.some((child) => child.runId))} onAction={onAction} />
      <ul>{main.childTasks.map((child, childIndex) => <li key={child.id}><StatusIcon status={child.status} /><span>{child.workbookCard ? `参数卡片 ${child.workbookCard.cardIndex} · ${child.workbookCard.text}` : `结果项 ${childIndex + 1} · ${formatCanvasScheduleParameterValues(child.parameterValues)}`}</span><em>{canvasScheduleStatusLabel(child.status)}</em>{child.resultSummary && (child.resultSummary.produced || child.resultSummary.failed) ? <small>已生成 {child.resultSummary.produced}，失败 {child.resultSummary.failed}</small> : null}{child.error ? <small>{child.error}</small> : null}<ScheduleIterationFailures key={`${schedule.id}:${child.id}:${child.status}`} scheduleId={schedule.id} mainTaskId={main.id} childTaskId={child.id} label={`任务组 ${index + 1} · 结果项 ${childIndex + 1}`} status={child.status} runId={child.runId} summaries={child.iterationSummary} busy={busy} onAction={onAction} />{isCanvasScheduleV2ChildRetryable(child) ? <button type="button" onClick={() => onAction("retry", { mainTaskId: main.id, childTaskId: child.id })} disabled={busy}><RotateCcw />{child.resultSummary?.failed ? "重试失败项" : "重试"}</button> : null}</li>)}</ul>
    </div></details>)}
  </div>;
}

export function isCanvasScheduleV2ChildRetryable(child: CanvasScheduleV2ChildTask) {
  return child.status === "failed" || child.retryable === true;
}

export function CanvasScheduleMainImageDownload({ runId }: { runId: string }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [hasFailures, setHasFailures] = useState(false);
  const busyRef = useRef(false);

  async function download() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFeedback("");
    setHasFailures(false);
    try {
      const counts = await downloadCanvasRunSaveImages(runId);
      setHasFailures(counts.failed > 0);
      setFeedback(`下载成功 ${counts.success} 张，下载失败 ${counts.failed} 张`);
    } catch (error) {
      setHasFailures(true);
      setFeedback(errorMessage(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return <div className="canvas-schedule-main-download">
    <button type="button" disabled={busy} onClick={() => void download()}>
      {busy ? <LoaderCircle className="animate-spin" /> : <Download />}
      {busy ? "下载中" : "下载图片"}
    </button>
    {feedback ? <small className={hasFailures ? "is-error" : ""} role="status">{feedback}</small> : null}
  </div>;
}

export function ContentPoolScheduleSourceEditor({ parameter, source, onChange, onPreview, browserKey }: {
  browserKey: string;
  parameter: CanvasScheduleParameter;
  source: Extract<CanvasScheduleParameterSource, { mode: "content-pool-filter" }>;
  onChange: (parameter: CanvasScheduleParameter) => void;
  onPreview: (preview: Extract<NonNullable<PreviewState>, { kind: "image" }>) => void;
}) {
  const [browsing, setBrowsing] = useState(false);
  const filter = source.filter;
  const setFilter = (next: ContentPoolSelectionFilter) => onChange({ ...parameter, source: { ...source, filter: { ...filter, ...next } } });
  const setItemIds = (itemIds: string[]) => onChange({ ...parameter, source: { ...source, filter: { ...filter, itemIds: itemIds.slice(0, 200) } } });
  const toggleItem = (item: ContentPoolSelectionItem) => {
    if (parameter.expansion === "fixed") {
      setItemIds([item.id]);
      return;
    }
    setItemIds(filter.itemIds.includes(item.id) ? filter.itemIds.filter((id) => id !== item.id) : [...filter.itemIds, item.id]);
  };
  return <div className="canvas-schedule-parameter-source canvas-content-pool-schedule-source">
    <div className="canvas-content-pool-source-mode" role="group" aria-label="内容池素材来源">
      <button type="button" aria-pressed={filter.mode === "manual"} onClick={() => onChange({ ...parameter, source: { ...source, filter: { ...filter, mode: "manual" } } })}>手工选择</button>
      <button type="button" aria-pressed={filter.mode === "match"} onClick={() => onChange({ ...parameter, source: { ...source, filter: { ...filter, mode: "match" } } })}>条件匹配</button>
    </div>
    <button type="button" onClick={() => setBrowsing((value) => !value)}>{browsing ? "收起筛选与选择" : "配置筛选与选择"}</button>
    <small>{filter.mode === "manual" ? `已选 ${filter.itemIds.length} 条` : "按筛选条件匹配"}{filter.query ? ` · ${filter.query}` : ""}</small>
    {browsing ? <ContentPoolSelectionBrowser
      memoryKey={browserKey}
      filter={filter}
      selectedIds={filter.itemIds}
      mode={filter.mode}
      onFilterChange={setFilter}
      onToggle={toggleItem}
      onSelectionChange={setItemIds}
      onPreviewImage={(url, index) => onPreview({ kind: "image", url, index })}
    /> : null}
  </div>;
}

export function CanvasScheduleSharedStage({ main, preview = false, busy = false, onRetry }: {
  main: NonNullable<CanvasSchedule["mainTasks"]>[number];
  preview?: boolean;
  busy?: boolean;
  onRetry?: () => void;
}) {
  const status = main.sharedStatus || "pending";
  const artifacts = main.sharedArtifacts?.map((entry) => entry.artifact) || [];
  const canRetry = !preview && (status === "failed" || (status === "partial" && Boolean(main.sharedError))) && onRetry;
  return <section className={`canvas-schedule-shared-stage is-${status}`} aria-label="主任务共享阶段">
    <header><Share2 /><span><strong>共享阶段</strong><small>{preview ? "每个主任务执行一次" : main.sharedRunId || "等待创建运行"}</small></span><em>{canvasScheduleStatusLabel(status)}</em>{canRetry ? <button type="button" onClick={onRetry} disabled={busy}><RotateCcw />重试共享阶段</button> : null}</header>
    {artifacts.length ? <CanvasScheduleArtifactSummary artifacts={artifacts} /> : null}
    {main.sharedError ? <p><AlertTriangle />{main.sharedError}</p> : null}
  </section>;
}

export function CanvasScheduleArtifactSummary({ artifacts }: { artifacts: CanvasArtifact[] }) {
  const images = artifacts.flatMap((artifact) => artifact.kind === "images" ? artifact.items : []);
  const videos = artifacts.flatMap((artifact) => artifact.kind === "videos" ? artifact.items : []);
  const texts = artifacts.flatMap((artifact) => artifact.kind === "text" ? [artifact.value] : []);
  const posts = artifacts.flatMap((artifact) => artifact.kind === "socialPost" ? [artifact] : []);
  return <div className="canvas-schedule-runtime-media">{images.map((item, index) => <Image key={`${item.url}-${index}`} src={item.url} alt="" width={70} height={52} unoptimized referrerPolicy="no-referrer" />)}{videos.map((item, index) => <span key={`${item.url}-${index}`}><Video />视频 {index + 1}</span>)}{texts.map((value, index) => <span key={index}>{value.slice(0, 80)}</span>)}{posts.map((artifact) => <Link key={artifact.postId} href={`/review?postId=${encodeURIComponent(artifact.postId)}`}>打开评审草稿</Link>)}</div>;
}

export function ScheduleAssetFilterEditor({ title, filter, count, onCountChange, onChange, onPreview, singleSelection = false, filterMatchLabel = false }: {
  title: string;
  filter: CanvasScheduleAssetFilter;
  count?: number;
  onCountChange?: (value: number) => void;
  onChange: (filter: CanvasScheduleAssetFilter) => void;
  onPreview: (preview: Extract<NonNullable<PreviewState>, { kind: "image" }>) => void;
  singleSelection?: boolean;
  filterMatchLabel?: boolean;
}) {
  const [data, setData] = useState<LibraryAssetPage>({ assets: [], total: 0 });
  const [navigation, setNavigation] = useState<LibraryNavigation>({ collections: [], smartFolders: [], counts: { all: 0, uncategorized: 0, favorites: 0 } });
  const [searchDraftState, setSearchDraftState] = useState({ source: filter.search, value: filter.search });
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);
  const [selectedAllQuery, setSelectedAllQuery] = useState("");
  const [error, setError] = useState("");
  const requestGenerationRef = useRef(0);
  const pageOperationRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const selectingAllRef = useRef(false);
  const selectionAnchorIdRef = useRef<string | undefined>(undefined);
  const searchCommitTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tagsText = filter.tags.join(", ");
  const order = canvasLibraryOrder(filter.sort, filter.randomSeed);
  const { sort, randomSeed } = order;
  const { reorder, ordering, orderError } = useLibraryOrdering(JSON.stringify(filter));
  const applySelection = (assetIds: string[], nextOrder: LibraryAssetOrder = order) => {
    void reorder(assetIds, nextOrder, (ordered) => onChange({ ...filterRef.current, ...nextOrder, assetIds: ordered }));
  };
  const queryString = (() => {
    const params = new URLSearchParams({ limit: "24", sort });
    if (randomSeed) params.set("randomSeed", randomSeed);
    if (filter.search.trim()) params.set("search", filter.search.trim());
    if (filter.color) params.set("color", filter.color);
    if (filter.collectionId) params.set("collectionId", filter.collectionId);
    if (filter.includeDescendants === false) params.set("includeDescendants", "false");
    if (filter.smartFolderId) params.set("smartFolderId", filter.smartFolderId);
    splitScheduleTags(tagsText).forEach((tag) => params.append("tag", tag));
    return params.toString();
  })();
  const queryStringRef = useRef(queryString);
  const filterRef = useRef(filter);
  const searchDraft = searchDraftState.source === filter.search ? searchDraftState.value : filter.search;

  useLayoutEffect(() => {
    queryStringRef.current = queryString;
    filterRef.current = filter;
  }, [filter, queryString]);

  useEffect(() => () => {
    if (searchCommitTimerRef.current) clearTimeout(searchCommitTimerRef.current);
  }, []);
  useEffect(() => { void api<LibraryNavigation>("/api/library/navigation").then(setNavigation).catch(() => undefined); }, []);

  const commitSearch = useCallback((value: string) => {
    if (searchCommitTimerRef.current) clearTimeout(searchCommitTimerRef.current);
    searchCommitTimerRef.current = undefined;
    if (value === filterRef.current.search) return;
    onChange({ ...filterRef.current, search: value });
  }, [onChange]);

  const updateSearchDraft = (value: string) => {
    setSearchDraftState({ source: filter.search, value });
    if (searchCommitTimerRef.current) clearTimeout(searchCommitTimerRef.current);
    searchCommitTimerRef.current = setTimeout(() => commitSearch(value), 350);
  };

  useEffect(() => {
    const generation = ++requestGenerationRef.current;
    pageOperationRef.current += 1;
    loadingMoreRef.current = false;
    selectingAllRef.current = false;
    selectionAnchorIdRef.current = undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSelectedAllQuery("");
      setBusy(true);
      setLoadingMore(false);
      setSelectingAll(false);
      setError("");
      void (async () => {
        try {
          const result = await api<LibraryAssetPage>(`/api/library/assets?${queryString}`, { signal: controller.signal });
          if (generation === requestGenerationRef.current && queryString === queryStringRef.current) setData(result);
        } catch (loadError) {
          if (!controller.signal.aborted && generation === requestGenerationRef.current && queryString === queryStringRef.current) setError(errorMessage(loadError));
        } finally {
          if (!controller.signal.aborted && generation === requestGenerationRef.current && queryString === queryStringRef.current) setBusy(false);
        }
      })();
    }, 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
      if (requestGenerationRef.current === generation) requestGenerationRef.current += 1;
    };
  }, [queryString]);

  const loadMore = useCallback(async () => {
    const cursor = data.nextCursor;
    if (!cursor || loadingMoreRef.current || selectingAllRef.current) return;
    const generation = requestGenerationRef.current;
    const operation = ++pageOperationRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setError("");
    try {
      const result = await api<LibraryAssetPage>(`/api/library/assets?${queryString}&cursor=${encodeURIComponent(cursor)}`);
      if (generation !== requestGenerationRef.current || queryString !== queryStringRef.current) return;
      if (result.nextCursor === cursor) throw new Error("图库分页游标重复，无法继续加载");
      setData((current) => {
        if (current.nextCursor !== cursor) return current;
        const knownIds = new Set(current.assets.map((asset) => asset.id));
        return { ...result, assets: [...current.assets, ...result.assets.filter((asset) => !knownIds.has(asset.id))] };
      });
    } catch (loadError) {
      if (generation === requestGenerationRef.current && queryString === queryStringRef.current) setError(errorMessage(loadError));
    } finally {
      if (operation === pageOperationRef.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [data.nextCursor, queryString]);

  const selectAllAssets = useCallback(async () => {
    if (busy || loadingMoreRef.current || selectingAllRef.current || !data.assets.length) return;
    selectingAllRef.current = true;
    setSelectingAll(true);
    setError("");
    const generation = requestGenerationRef.current;
    const operation = ++pageOperationRef.current;
    const assetIds = data.assets.map((asset) => asset.id);
    const knownIds = new Set(assetIds);
    const seenCursors = new Set<string>();
    let cursor = data.nextCursor;
    try {
      while (cursor) {
        if (seenCursors.has(cursor)) throw new Error("图库分页游标重复，无法完成全选");
        seenCursors.add(cursor);
        const result = await api<LibraryAssetPage>(`/api/library/assets?${queryString}&cursor=${encodeURIComponent(cursor)}`);
        if (generation !== requestGenerationRef.current || queryString !== queryStringRef.current) return;
        result.assets.forEach((asset) => {
          if (!knownIds.has(asset.id)) {
            knownIds.add(asset.id);
            assetIds.push(asset.id);
          }
        });
        cursor = result.nextCursor;
      }
      const latestFilter = filterRef.current;
      if (generation !== requestGenerationRef.current || queryString !== queryStringRef.current || latestFilter.mode !== "manual") return;
      onChange({ ...latestFilter, assetIds });
      setSelectedAllQuery(queryString);
    } catch (selectError) {
      if (generation === requestGenerationRef.current && queryString === queryStringRef.current) setError(errorMessage(selectError));
    } finally {
      if (operation === pageOperationRef.current) {
        selectingAllRef.current = false;
        setSelectingAll(false);
      }
    }
  }, [busy, data.assets, data.nextCursor, onChange, queryString]);

  const toggle = (assetId: string, event: React.MouseEvent<HTMLButtonElement>) => {
    if (filter.mode !== "manual" || busy) return;
    setSelectedAllQuery("");
    if (singleSelection) {
      selectionAnchorIdRef.current = assetId;
      applySelection(filter.assetIds.includes(assetId) ? [] : [assetId]);
      return;
    }
    const selectedIds = new Set(filter.assetIds);
    if (event.shiftKey) {
      const anchorId = selectionAnchorIdRef.current;
      const next = selectIdRange(data.assets.map((asset) => asset.id), selectedIds, anchorId, assetId, event.ctrlKey || event.metaKey);
      if (!anchorId || !data.assets.some((asset) => asset.id === anchorId)) selectionAnchorIdRef.current = assetId;
      applySelection([...next]);
      return;
    }
    selectionAnchorIdRef.current = assetId;
    if (selectedIds.has(assetId)) selectedIds.delete(assetId);
    else selectedIds.add(assetId);
    applySelection([...selectedIds]);
  };

  const openPreview = (asset: LibraryAsset, index: number) => onPreview({
    kind: "image",
    url: asset.publicUrl,
    index,
    width: asset.width,
    height: asset.height,
    sequence: data.assets.map((item) => ({ id: item.id, url: item.publicUrl, width: item.width, height: item.height })),
  });
  const allMatchesSelected = (data.total ?? 0) > 0 && selectedAllQuery === queryString;
  const status = busy
    ? "正在筛选"
    : selectingAll
      ? "正在全选匹配图片"
      : loadingMore
        ? `正在加载更多 · 已加载 ${data.assets.length} 张`
        : `已加载 ${data.assets.length} / 匹配 ${data.total} 张${filter.mode === "manual" ? ` · 已选 ${filter.assetIds.length} 张` : ""}`;

  return <div className="canvas-schedule-assets">
    <fieldset className="canvas-library-picker-fields" disabled={ordering}>
    <LibraryOrderControl order={order} onChange={(next) => applySelection(filter.assetIds, next)} />
    <div className="canvas-schedule-assets-head"><strong>{title}</strong><div className="canvas-task-filters"><button type="button" aria-pressed={filter.mode === "manual"} onClick={() => onChange({ ...filter, mode: "manual" })}>手动选择</button><button type="button" aria-pressed={filter.mode === "random"} onClick={() => onChange({ ...filter, mode: "random" })}>{filterMatchLabel ? "条件匹配" : "条件随机"}</button></div></div>
    <div className="canvas-schedule-filter-row">
      <label><Search /><input value={searchDraft} onChange={(event) => updateSearchDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitSearch(searchDraft); } }} placeholder="关键字" /></label>
      <select value={filter.smartFolderId ? `smart:${filter.smartFolderId}` : filter.collectionId ? `collection:${filter.collectionId}` : ""} onChange={(event) => { const [kind, id] = event.target.value.split(":"); onChange({ ...filter, collectionId: kind === "collection" ? id : undefined, smartFolderId: kind === "smart" ? id : undefined }); }}><option value="">全部图片</option><optgroup label="图集">{navigation.collections.map((collection) => <option value={`collection:${collection.id}`} key={collection.id}>{collection.relativePath || collection.name}</option>)}</optgroup><optgroup label="智能文件夹">{navigation.smartFolders.map((folder) => <option value={`smart:${folder.id}`} key={folder.id}>{folder.name}</option>)}</optgroup></select>
      <input value={tagsText} onChange={(event) => onChange({ ...filter, tags: splitScheduleTags(event.target.value) })} placeholder="多个标签，AND" />
      {count !== undefined && filter.mode === "random" ? <label className="canvas-schedule-count"><span>抽取</span><input type="number" min={1} max={500} value={count} onChange={(event) => onCountChange?.(Number(event.target.value))} /></label> : null}
    </div>
    <LibraryColorFilter color={filter.color} onChange={(color) => onChange({ ...filter, color })} hint />
    <div className="canvas-schedule-asset-toolbar">
      <small className="canvas-schedule-pool-count" aria-live="polite">{status}</small>
      {filter.mode === "manual" && !singleSelection ? <div>
        <button type="button" onClick={() => void selectAllAssets()} disabled={busy || loadingMore || selectingAll || !data.assets.length || allMatchesSelected}><CheckCircle2 />{selectingAll ? "全选中..." : allMatchesSelected ? "已全选" : "全选当前筛选结果"}</button>
        <button type="button" onClick={() => { setSelectedAllQuery(""); onChange({ ...filter, assetIds: [] }); }} disabled={selectingAll || !filter.assetIds.length}><X />清空已选</button>
      </div> : null}
    </div>
    <div className={`canvas-schedule-asset-results ${busy ? "is-loading" : ""}`} aria-busy={busy}>
      {busy && !data.assets.length ? <div className="canvas-schedule-asset-state"><LoaderCircle className="animate-spin" />正在载入图片</div> : null}
      {!busy && !error && !data.assets.length ? <div className="canvas-schedule-asset-state"><Images />当前筛选没有图片</div> : null}
      {data.assets.length ? <div className="canvas-schedule-asset-grid">{data.assets.map((asset, index) => <article key={asset.id} className={filter.assetIds.includes(asset.id) ? "is-selected" : ""}>
        <button className="canvas-schedule-asset-select" type="button" onClick={(event) => toggle(asset.id, event)} disabled={filter.mode !== "manual" || selectingAll || busy} title={filter.mode === "manual" ? asset.name : undefined} aria-label={`${filter.assetIds.includes(asset.id) ? "取消选择" : "选择"} ${asset.name}`}>
          <ScheduleAssetThumbnail asset={asset} /><span>{asset.name}</span>{filter.mode === "manual" && filter.assetIds.includes(asset.id) ? <CheckCircle2 className="canvas-schedule-asset-selected-mark" /> : null}
        </button>
        <button className="canvas-schedule-asset-preview" type="button" disabled={busy} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); openPreview(asset, index); }} aria-label={`预览 ${asset.name}`} title="预览图片"><Eye /></button>
        <LibraryPalette palette={asset.palette} disabled={busy} onColor={(color) => onChange({ ...filter, color })} />
      </article>)}</div> : null}
      {data.nextCursor ? <div className="canvas-schedule-asset-load-more"><button type="button" onClick={() => void loadMore()} disabled={busy || loadingMore || selectingAll}>{loadingMore ? <LoaderCircle className="animate-spin" /> : <ArrowDown />}{loadingMore ? "正在加载下一页..." : "加载更多"}</button></div> : null}
    </div>
    </fieldset>
    {ordering ? <p role="status">正在排序已选图片…</p> : null}
    {error || orderError ? <p className="canvas-picker-error">{orderError || error}</p> : null}
  </div>;
}

export function ScheduleAssetThumbnail({ asset }: { asset: LibraryAsset }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  return <span className={`canvas-schedule-asset-thumbnail is-${state}`}>
    {state === "loading" ? <LoaderCircle className="animate-spin" /> : null}
    {state === "error" ? <span role="alert"><ImageOff />缩略图读取失败</span> : null}
    <Image
      src={`/api/library/assets/${encodeURIComponent(asset.id)}/thumbnail?variant=square&version=2`}
      alt=""
      width={240}
      height={240}
      unoptimized
      loading="lazy"
      onLoad={() => setState("ready")}
      onError={() => setState("error")}
    />
  </span>;
}

export function ScheduleCopyFilterEditor({ filter, onChange, onDisable, singleSelection = false, filterMatchLabel = false }: {
  filter: CanvasScheduleCopyFilter;
  onChange: (filter: CanvasScheduleCopyFilter) => void;
  onDisable?: () => void;
  singleSelection?: boolean;
  filterMatchLabel?: boolean;
}) {
  const [data, setData] = useState<CanvasCopyLibraryResponse>({ entries: [], tags: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tagsText = filter.tags.join(", ");
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const params = new URLSearchParams();
        if (filter.search.trim()) params.set("q", filter.search.trim());
        if (filter.mode === "tags") splitScheduleTags(tagsText).forEach((tagValue) => params.append("tag", tagValue));
        const response = await fetch(`/api/copy-library${params.size ? `?${params}` : ""}`, { signal: controller.signal });
        const result = (await response.json()) as CanvasCopyLibraryResponse & { error?: string };
        if (!response.ok) throw new Error(result.error || "文案池加载失败");
        setData(result);
        setError("");
      } catch (loadError) {
        if (!controller.signal.aborted) setError(errorMessage(loadError));
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [filter.mode, filter.search, tagsText]);
  const toggle = (entryId: string) => onChange({
    ...filter,
    entryIds: filter.entryIds.includes(entryId) ? filter.entryIds.filter((id) => id !== entryId) : singleSelection ? [entryId] : [...filter.entryIds, entryId],
  });
  const allMatchesSelected = data.entries.length > 0 && data.entries.every((entry) => filter.entryIds.includes(entry.id));
  const selectAllEntries = () => {
    if (filter.mode !== "manual" || singleSelection || !data.entries.length) return;
    onChange({ ...filter, entryIds: data.entries.map((entry) => entry.id) });
  };
  const clearSelectedEntries = () => {
    if (singleSelection || !filter.entryIds.length) return;
    onChange({ ...filter, entryIds: [] });
  };
  return <div className="canvas-schedule-assets canvas-schedule-copy-pool">
    <div className="canvas-schedule-assets-head"><strong>文案池</strong><div className="canvas-task-filters"><button type="button" aria-pressed={filter.mode === "manual"} onClick={() => onChange({ ...filter, mode: "manual" })}>手动选择</button><button type="button" aria-pressed={filter.mode === "tags"} onClick={() => onChange({ ...filter, mode: "tags" })}>{filterMatchLabel ? "条件匹配" : "条件随机"}</button>{onDisable ? <button type="button" onClick={onDisable}>停用</button> : null}</div></div>
    <div className="canvas-schedule-filter-row">
      <label><Search /><input value={filter.search} onChange={(event) => onChange({ ...filter, search: event.target.value })} placeholder="搜索文案" /></label>
      <input value={tagsText} disabled={filter.mode !== "tags"} onChange={(event) => onChange({ ...filter, tags: splitScheduleTags(event.target.value) })} placeholder="多个标签，AND" />
    </div>
    <div className="canvas-schedule-asset-toolbar">
      <small className="canvas-schedule-pool-count" aria-live="polite">{busy ? "正在筛选" : filter.mode === "manual" ? `匹配 ${data.entries.length} 篇 · 已选 ${filter.entryIds.length} 篇 · 批次内随机去重` : `条件匹配 ${data.entries.length} 篇 · 批次内随机去重`}</small>
      {filter.mode === "manual" && !singleSelection ? <div>
        <button type="button" onClick={selectAllEntries} disabled={busy || !data.entries.length || allMatchesSelected}><CheckCircle2 />{allMatchesSelected ? "已全选" : "全选当前筛选结果"}</button>
        <button type="button" onClick={clearSelectedEntries} disabled={busy || !filter.entryIds.length}><X />清空已选</button>
      </div> : null}
    </div>
    <div className="canvas-schedule-copy-list">{data.entries.slice(0, 50).map((entry) => <button type="button" key={entry.id} className={filter.entryIds.includes(entry.id) ? "is-selected" : ""} onClick={() => filter.mode === "manual" && toggle(entry.id)} disabled={filter.mode === "tags"}>
      <BookOpenText /><span><strong>{entry.title}</strong><small>{entry.tags.join(" · ") || "无标签"}</small></span>{filter.mode === "manual" && filter.entryIds.includes(entry.id) ? <CheckCircle2 /> : null}
    </button>)}</div>
    {error ? <p className="canvas-picker-error">{error}</p> : null}
  </div>;
}

export function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 />;
  if (status === "queued" || status === "running") return <LoaderCircle className={status === "running" ? "animate-spin" : ""} />;
  return <AlertTriangle />;
}

export function normalizeConfigUrls(value: CanvasNode["config"][string]) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\r?\n/) : [];
  return Array.from(new Set(values.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)));
}

export function emptyContentPoolSelectionFilter(): ContentPoolSelectionFilter {
  return { query: "", platforms: [], statuses: [], mediaTypes: [], contentTags: [], customTags: [], localMediaComplete: false, includeDescendants: true, sort: "hot-desc" };
}

export { contentPoolSelectionUrl } from "@/lib/content-pool-browser-state";

export function uniqueContentPoolItems(items: ContentPoolSelectionItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.id) && Boolean(seen.add(item.id)));
}

export function contentPoolFilterLabel(value: string) {
  return ({
    wechat_channels: "视频号", xiaohongshu: "小红书", douyin: "抖音", weibo: "微博", xiaopeng_bbs: "小鹏社区", dongchedi: "懂车帝", feishu: "飞书", original: "原创",
    new: "新素材", analyzed: "已分析", rewritten: "已改写", approved: "已审核", published: "已发布",
    image: "图片", video: "视频", mixed: "图文/视频", text: "纯文本", unknown: "未知",
  } as Record<string, string>)[value] || value;
}

export function formatContentPoolSelectionTime(item: ContentPoolSelectionItem) {
  const value = item.publishedAt || item.crawledAt;
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleDateString("zh-CN") : "时间未知";
}

export function getSaveImagesArtifact(nodeRun: CanvasNodeRun) {
  const artifact = nodeRun.outputs.downloads;
  return artifact?.kind === "images" && artifact.items.length > 0 && artifact.items.length <= CANVAS_SAVE_IMAGE_MAX_ITEMS ? artifact : undefined;
}

export function parseCanvasDownloadFilename(contentDisposition: string | null) {
  if (!contentDisposition) return undefined;
  const encoded = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/iu)?.[1]?.trim();
  if (encoded) {
    try {
      const filename = decodeURIComponent(encoded);
      if (filename && !/[\u0000-\u001f\u007f/\\]/u.test(filename)) return filename;
    } catch {
      // Fall through to the ASCII filename supplied by the same response.
    }
  }
  const quoted = contentDisposition.match(/filename\s*=\s*"([^"]+)"/iu)?.[1]?.trim();
  return quoted && !/[\u0000-\u001f\u007f/\\]/u.test(quoted) ? quoted : undefined;
}

export async function downloadCanvasSaveImages(runId: string, nodeRunId: string, count: number) {
  let success = 0;
  let failed = 0;
  for (let index = 0; index < count; index += 1) {
    try {
      const response = await fetch(`/api/canvas/runs/${encodeURIComponent(runId)}/downloads/images?nodeRunId=${encodeURIComponent(nodeRunId)}&index=${index}`);
      if (!response.ok) {
        await response.text();
        throw new Error(`Image download failed (${response.status})`);
      }
      const filename = parseCanvasDownloadFilename(response.headers.get("Content-Disposition"));
      if (!filename) throw new Error("Image download filename is missing.");
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      try {
        link.href = objectUrl;
        link.download = filename;
        link.hidden = true;
        document.body.append(link);
        link.click();
        success += 1;
      } finally {
        link.remove();
        URL.revokeObjectURL(objectUrl);
      }
    } catch {
      failed += 1;
    }
  }
  return { success, failed };
}

export async function downloadCanvasRunSaveImages(runId: string) {
  const data = await api<CanvasRunWithNodes>(`/api/canvas/runs/${encodeURIComponent(runId)}`);
  const latest = latestAttempts(data.nodeRuns);
  const results = data.run.graphSnapshot.nodes.flatMap((node) => {
    if (node.type !== "utility.save-images") return [];
    const nodeRun = latest.get(node.id);
    const artifact = nodeRun && (nodeRun.status === "completed" || nodeRun.status === "reused"
      || (nodeRun.status === "failed" && nodeRun.internalMetadata?.saveImages))
      ? getSaveImagesArtifact(nodeRun)
      : undefined;
    return nodeRun && artifact ? [{ nodeRunId: nodeRun.id, count: artifact.items.length }] : [];
  });
  if (!results.length) throw new Error("该主任务没有可下载的保存图片结果。");

  const total = { success: 0, failed: 0 };
  for (const result of results) {
    const counts = await downloadCanvasSaveImages(runId, result.nodeRunId, result.count);
    total.success += counts.success;
    total.failed += counts.failed;
  }
  return total;
}

export function latestAttempts(nodeRuns: CanvasNodeRun[]) {
  const result = new Map<string, CanvasNodeRun>();
  nodeRuns.forEach((nodeRun) => {
    if (!result.has(nodeRun.nodeId) || (result.get(nodeRun.nodeId)?.attempt || 0) < nodeRun.attempt) result.set(nodeRun.nodeId, nodeRun);
  });
  return result;
}

export function canvasBatchBindingOptions(graph: CanvasGraph, valueType: CanvasScheduleParameterType) {
  return getCanvasBatchBindings(graph)
    .filter(({ field }) => field.parameterTypes.includes(valueType))
    .map((option) => ({ ...option, label: `${option.region ? `${canvasNodeDisplayName(option.region)} · ${option.region.id.slice(-4)} → ` : ""}${canvasNodeDisplayName(option.node)} · ${option.field.label} · ${option.node.id.slice(-4)}` }));
}

export function firstCanvasBatchBinding(graph: CanvasGraph) {
  return getCanvasBatchBindings(graph)[0];
}

export function canvasNodeDisplayName(node: CanvasNode) {
  return node.label?.trim() || getCanvasNodeDefinition(node.type, node.version)?.label || node.type;
}

export function canvasNodeOptionLabel(node: CanvasNode) {
  return `${canvasNodeDisplayName(node)} · ${getCanvasNodeDefinition(node.type, node.version)?.label || node.type} · ${node.id.slice(-4)}`;
}

export function nextCanvasScheduleParameterId() {
  canvasScheduleParameterSequence += 1;
  return `canvas-v2-parameter-${Date.now()}-${canvasScheduleParameterSequence}`;
}

export function defaultCanvasScheduleParameterSource(valueType: CanvasScheduleParameterType, nodeId = ""): CanvasScheduleParameterSource {
  if (valueType === "video") return { mode: "video-loader-queue", nodeId };
  if (valueType === "source-video") return { mode: "source-video-links", links: [], projectName: "视频内容重构" };
  if (valueType === "content-pool") return { mode: "content-pool-filter", filter: { ...emptyContentPoolSelectionFilter(), mode: "manual", itemIds: [] } };
  if (valueType === "image" || valueType === "image-group") return { mode: "library-filter", filter: emptyScheduleFilter() };
  if (valueType === "copy") return { mode: "copy-filter", filter: emptyScheduleCopyFilter() };
  return { mode: "fixed", values: [defaultCanvasScheduleScalarValue(valueType)] };
}

export function canvasScheduleParameterSampleCount(parameter: CanvasScheduleParameter): CanvasScheduleSampleCount {
  if (parameter.sampleCount?.mode === "exact") return { mode: "exact", value: positiveCanvasScheduleInteger(parameter.sampleCount.value) };
  if (parameter.sampleCount?.mode === "range") return {
    mode: "range",
    min: positiveCanvasScheduleInteger(parameter.sampleCount.min),
    max: Math.max(positiveCanvasScheduleInteger(parameter.sampleCount.min), positiveCanvasScheduleInteger(parameter.sampleCount.max)),
  };
  return { mode: "exact", value: positiveCanvasScheduleInteger(parameter.randomCount) };
}

export function positiveCanvasScheduleInteger(value: unknown) {
  return Math.max(1, Math.trunc(Number(value) || 1));
}

export function canvasScheduleSampleCountSummary(scope: CanvasScheduleParameter["scope"], sampleCount: CanvasScheduleSampleCount) {
  const count = sampleCount.mode === "exact" ? `${sampleCount.value}` : `${sampleCount.min}-${sampleCount.max}`;
  return scope === "child" ? `每个主任务随机抽取 ${count} 项` : `每次预演随机抽取 ${count} 项`;
}

export function defaultCanvasScheduleScalarValue(valueType: CanvasScheduleParameterType): CanvasScheduleParameterValue {
  if (valueType === "number") return 1;
  if (valueType === "boolean") return false;
  return "";
}

export function canvasScheduleParameterTypeLabel(value: CanvasScheduleParameterType) {
  return ({ image: "图片", "image-group": "图片组", "directory-group": "目录组", video: "视频", "source-video": "源视频", "content-pool": "内容池素材", text: "文本", copy: "文案记录", number: "数字", boolean: "布尔值", enum: "枚举" } as const)[value];
}

export function formatCanvasScheduleParameterValues(values: Record<string, CanvasScheduleParameterValue>) {
  const labels = Object.values(values).map((value) => {
    if (Array.isArray(value)) return `${value.length} 张图片`;
    if (value && typeof value === "object") {
      if ("projectName" in value) return value.title || value.id;
      if ("url" in value) return ("name" in value ? value.name : "filename" in value ? value.filename : undefined) || value.id;
      if ("body" in value) return value.title;
    }
    return String(value);
  }).filter(Boolean);
  return labels.join(" · ") || "固定参数";
}

export function canvasScheduleParameterImages(values: Record<string, CanvasScheduleParameterValue>) {
  const seen = new Set<string>();
  const candidates: unknown[] = Object.values(values).flatMap((value): unknown[] => {
    if (!Array.isArray(value) && value && typeof value === "object" && "imageUrls" in value && Array.isArray(value.imageUrls)) {
      return value.imageUrls.map((url, index) => ({ id: `${value.id}-${index}`, url, name: value.title }));
    }
    return Array.isArray(value) ? value : [value];
  });
  return candidates
    .filter((value): value is CanvasScheduleAssetSnapshot => Boolean(
      value
      && typeof value === "object"
      && "id" in value
      && typeof value.id === "string"
      && "url" in value
      && typeof value.url === "string"
      && value.url
      && !("projectName" in value)
      && !("filename" in value),
    ))
    .filter((image) => {
      const key = `${image.id}\u0000${image.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function canvasScheduleSharedOutputCandidates(
  graph: CanvasGraph,
  definition: CanvasScheduleV2Definition,
): Array<{ node: CanvasNode; port: CanvasPortDefinition; artifactKind: CanvasScheduleV2Definition["childResult"]["artifactKind"] }> {
  const childBindingNodeIds = new Set(definition.parameters
    .filter((parameter) => parameter.scope === "child")
    .map((parameter) => parameter.binding.nodeId));
  const candidates: Array<{ node: CanvasNode; port: CanvasPortDefinition; artifactKind: CanvasScheduleV2Definition["childResult"]["artifactKind"] }> = [];
  for (const node of graph.nodes) {
    const nodeDefinition = getCanvasNodeDefinition(node.type, node.version);
    const outputPorts = getCanvasIterationOutputPorts(node);
    const port = outputPorts[0];
    if (!nodeDefinition
      || (nodeDefinition.category === "input" && node.type !== "input.content-collection")
      || nodeDefinition.passiveSink
      || nodeDefinition.capability === "external_write"
      || getCanvasNodeExecutionMode(node) === "disabled"
      || (outputPorts.length !== 1 && node.type !== "input.content-collection" && node.type !== "utility.image-iterate")
      || !port
      || !isCanvasScheduleArtifactKind(port.kind)
      || node.id === definition.childResult.nodeId
      || !hasCanvasGraphPath(graph, node.id, definition.childResult.nodeId)) continue;
    const ancestors = collectCanvasGraphAncestors(graph, node.id);
    if (Array.from(childBindingNodeIds).some((nodeId) => ancestors.has(nodeId))) continue;
    for (const output of outputPorts) {
      if (isCanvasScheduleArtifactKind(output.kind)) candidates.push({ node, port: output, artifactKind: output.kind });
    }
  }
  return candidates;
}

export function isCanvasScheduleArtifactKind(kind: CanvasPortKind): kind is "text" | "images" | "videos" {
  return kind === "text" || kind === "images" || kind === "videos";
}

export function hasCanvasGraphPath(graph: CanvasGraph, sourceId: string, targetId: string) {
  const outgoing = new Map<string, string[]>();
  for (const edge of graph.edges) outgoing.set(edge.source, [...(outgoing.get(edge.source) || []), edge.target]);
  const pending = [sourceId];
  const visited = new Set<string>();
  while (pending.length) {
    const current = pending.pop()!;
    if (current === targetId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(outgoing.get(current) || []));
  }
  return false;
}

export function collectCanvasGraphAncestors(graph: CanvasGraph, targetId: string) {
  const incoming = new Map<string, string[]>();
  for (const edge of graph.edges) incoming.set(edge.target, [...(incoming.get(edge.target) || []), edge.source]);
  const pending = [targetId];
  const result = new Set<string>();
  while (pending.length) {
    const current = pending.pop()!;
    if (result.has(current)) continue;
    result.add(current);
    pending.push(...(incoming.get(current) || []));
  }
  return result;
}

export function emptyScheduleFilter(): CanvasScheduleAssetFilter {
  return { mode: "manual", assetIds: [], search: "", tags: [], sort: "updated-newest" };
}

export function mergeCanvasScheduleWorkbookPaths(response: CanvasSchedule, local: CanvasSchedule) {
  if (!response.definition || !local.definition) return response;
  const localById = new Map(local.definition.parameters.map((parameter) => [parameter.id, parameter]));
  return {
    ...response,
    definition: {
      ...response.definition,
      parameters: response.definition.parameters.map((parameter) => {
        if (parameter.source.mode !== "competitor-workbook") return parameter;
        const localParameter = localById.get(parameter.id);
        const filePath = localParameter?.source.mode === "competitor-workbook" ? localParameter.source.filePath : undefined;
        return { ...parameter, source: { ...parameter.source, filePath } };
      }),
    },
  };
}

export function emptyScheduleCopyFilter(): CanvasScheduleCopyFilter {
  return { mode: "manual", entryIds: [], search: "", tags: [] };
}

export function splitScheduleTags(value: string) {
  return Array.from(new Set(value.split(/[,，]/).map((item) => item.trim()).filter(Boolean)));
}

export function canvasScheduleStatusLabel(status: string) {
  return ({
    draft: "草稿",
    ready: "待确认",
    pending: "待调度",
    queued: "排队中",
    running: "运行中",
    paused: "已暂停",
    completed: "已完成",
    partial: "部分完成",
    failed: "失败",
    cancelled: "已取消",
  } as Record<string, string>)[status] || status;
}

export async function api<T = { ok: boolean }>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

export function errorMessage(error: unknown) { return error instanceof Error ? error.message : "操作失败"; }

export function portKindLabel(kind: CanvasPortKind) { return ({ any: "任意", visual: "图片或视频", text: "文字", images: "图片", audios: "音乐", videos: "视频", socialPost: "内容", publishJobRef: "发布任务" } as Record<CanvasPortKind, string>)[kind]; }
