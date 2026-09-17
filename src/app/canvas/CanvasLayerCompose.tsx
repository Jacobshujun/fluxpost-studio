"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { Layers3, Plus, Undo2, Redo2, X, Play, Pause, Copy, Trash2, ArrowUp, ArrowDown, Eye, EyeOff, LockKeyhole, LockKeyholeOpen, Crop } from "lucide-react";
import { composeConfigKey, composeDuration, composeLayerGeometry, composeLayerSource, defaultLayerComposeConfig, findComposeSource, fullLayerCrop, isLayerComposeConfig, newComposeLayer, validateLayerComposeConfig } from "@/lib/canvas/layer-compose-contract";
import type { ComposeLayer, ComposeSource, LayerComposeConfig } from "@/lib/canvas/layer-compose-contract";
import { composeMetadataId, createComposeMetadataLoader, hasComposeMetadata } from "@/lib/canvas/layer-compose-metadata";
import type { ComposeMetadataState } from "@/lib/canvas/layer-compose-metadata";
import type { CanvasNode, CanvasNodeConfig, CanvasNodeRun } from "@/lib/canvas/types";
import { toRemoteImagePreviewSrc } from "@/lib/media-preview";
import "./layer-compose.css";

let layerSequence = 0;
const nextId = () => `layer-${Date.now()}-${++layerSequence}`;
export function CanvasLayerComposeControls({ node, getSources, onPatch, nodeRun, latestSuccessful }: {
  node: CanvasNode; getSources: () => ComposeSource[]; onPatch: (patch: CanvasNodeConfig) => void; nodeRun?: CanvasNodeRun; latestSuccessful?: CanvasNodeRun;
}) {
  const [session, setSession] = useState<{ sources: ComposeSource[]; config: LayerComposeConfig }>();
  const config = isLayerComposeConfig(node.config.composition) ? node.config.composition : defaultLayerComposeConfig();
  const run = nodeRun && ["completed", "reused"].includes(nodeRun.status) ? nodeRun : latestSuccessful;
  const artifact = run?.outputs.images || run?.outputs.videos;
  const item = artifact && (artifact.kind === "images" || artifact.kind === "videos") ? artifact.items[0] : undefined;
  return <div className="layer-node nodrag nopan nowheel" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
    <strong>{config.width} × {config.height} · {config.layers.length} 个图层</strong>
    <button type="button" onClick={() => setSession({ sources: getSources(), config: structuredClone(config) })}><Layers3 />编辑图层</button>
    {nodeRun?.error ? <small role="alert">{nodeRun.error}</small> : null}
    {nodeRun && ["running", "queued"].includes(nodeRun.status) ? <small role="status">{nodeRun.status === "running" ? "正在合成…" : "等待合成…"}</small> : null}
    {item ? <><small>{item.layerComposition?.configKey !== composeConfigKey(config) ? "参数已修改，请重新运行" : "合成结果"}</small>
      {artifact?.kind === "videos" ? <><video src={item.url} controls playsInline preload="metadata" /><small>{item.layerComposition?.hasAudio ? "含所选视频原声" : "无声视频"}</small></> : <a href={item.url} target="_blank" rel="noreferrer"><Image src={item.url} alt="合成结果" width={240} height={240} unoptimized /></a>}
    </> : <small>连接素材，编辑图层后运行。</small>}
    {session ? createPortal(<LayerComposeEditor initial={session.config} initialSources={session.sources} onApply={(composition) => { onPatch({ composition }); setSession(undefined); }} onClose={() => setSession(undefined)} />, document.body) : null}
  </div>;
}

function LayerComposeEditor({ initial, initialSources, onApply, onClose }: { initial: LayerComposeConfig; initialSources: ComposeSource[]; onApply: (config: LayerComposeConfig) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [metadata, setMetadata] = useState<Record<string, ComposeMetadataState>>({});
  const loader = useRef<ReturnType<typeof createComposeMetadataLoader> | null>(null);
  const sources = initialSources.map((source) => {
    const state = metadata[composeMetadataId(source)];
    return state?.status === "ready" ? state.source : source;
  });
  const [selectedId, setSelectedId] = useState(initial.layers.at(-1)?.id);
  const [undo, setUndo] = useState<LayerComposeConfig[]>([]), [redo, setRedo] = useState<LayerComposeConfig[]>([]);
  const [message, setMessage] = useState("");
  const [cropMode, setCropMode] = useState(false), [playing, setPlaying] = useState(false), [time, setTime] = useState(0);
  const timeRef = useRef(0);
  useEffect(() => { timeRef.current = time; }, [time]);
  const dialogRef = useRef<HTMLDivElement>(null), stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 500, height: 600 });
  const drag = useRef<{ pointer: number; x: number; y: number; mode: "move" | "scale" | "crop"; original: LayerComposeConfig; layer: ComposeLayer; scale: number; cropWidth: number; cropHeight: number } | null>(null);
  const selected = draft.layers.find((layer) => layer.id === selectedId);
  const selectedSource = selected && findComposeSource(selected, sources);
  const videos = draft.layers.filter((layer) => layer.visible && layer.kind === "video");
  const duration = composeDuration(draft, sources);
  const errors = validateLayerComposeConfig(draft);
  const missing = draft.layers.filter((layer) => layer.visible && layer.kind !== "solid" && !findComposeSource(layer, sources));
  const scale = Math.min((stageSize.width - 32) / draft.width, (stageSize.height - 32) / draft.height);
  const commit = (next: LayerComposeConfig) => {
    if (JSON.stringify(next) === JSON.stringify(draft)) return;
    setUndo((items) => [...items, structuredClone(draft)].slice(-50)); setRedo([]); setDraft(next);
  };
  const patch = (changes: Partial<LayerComposeConfig>) => commit({ ...draft, ...changes });
  const patchLayer = (changes: Partial<ComposeLayer>) => {
    if (!selected || selected.locked) return;
    patch({ layers: draft.layers.map((layer) => layer.id === selected.id ? { ...layer, ...changes } : layer) });
  };
  const step = (direction: -1 | 1) => {
    const stack = direction === -1 ? undo : redo, next = stack.at(-1);
    if (!next) return;
    if (direction === -1) { setUndo(stack.slice(0, -1)); setRedo((items) => [...items, draft]); }
    else { setRedo(stack.slice(0, -1)); setUndo((items) => [...items, draft]); }
    setDraft(structuredClone(next)); setPlaying(false);
  };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const observer = new ResizeObserver(([entry]) => setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    if (stageRef.current) observer.observe(stageRef.current);
    return () => { observer.disconnect(); previous?.focus(); };
  }, []);
  useEffect(() => {
    const session = createComposeMetadataLoader((id, state) => setMetadata((items) => ({ ...items, [id]: state })));
    loader.current = session;
    return () => { session.dispose(); loader.current = null; };
  }, []);
  useEffect(() => {
    for (const source of initialSources) {
      if (draft.layers.some((layer) => layer.visible && findComposeSource(layer, initialSources) === source)) loader.current?.ensure(source);
    }
  }, [draft.layers, initialSources]);
  useEffect(() => {
    if (!playing || !duration) return;
    const start = performance.now() - timeRef.current * 1000;
    let frame = 0;
    const tick = (now: number) => {
      const next = Math.min(duration, (now - start) / 1000);
      setTime(next);
      if (next >= duration) setPlaying(false); else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration]);
  function addMedia(source: ComposeSource, replace = false) {
    if ((!replace && draft.layers.length >= 24) || (!replace && source.kind === "video" && draft.layers.filter((layer) => layer.kind === "video").length >= 4)) { setMessage("最多 24 个图层，其中最多 4 个视频。"); return; }
    setMessage(""); setPlaying(false);
    if (replace && selected && !selected.locked) {
      commit({ ...draft, layers: draft.layers.map((layer) => layer.id === selected.id ? { ...layer, source: composeLayerSource(source) } : layer) });
    } else {
      const layer = { ...newComposeLayer(nextId(), source.kind, draft.width, draft.height), name: source.media.name || `${source.kind === "image" ? "图片" : "视频"} ${draft.layers.length}`, source: composeLayerSource(source) };
      commit({ ...draft, layers: [...draft.layers, layer], audioLayerId: source.kind === "video" && !draft.layers.some((item) => item.kind === "video") ? layer.id : draft.audioLayerId });
      setSelectedId(layer.id);
    }
  }
  function beginDrag(event: ReactPointerEvent<HTMLDivElement | HTMLButtonElement>, layer: ComposeLayer, mode: "move" | "scale" | "crop", displayScale = scale) {
    if (layer.locked || playing) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    setSelectedId(layer.id);
    drag.current = { pointer: event.pointerId, x: mode === "crop" ? event.clientX - rect.left : event.clientX, y: mode === "crop" ? event.clientY - rect.top : event.clientY, mode, original: structuredClone(draft), layer: structuredClone(layer), scale: displayScale, cropWidth: rect.width, cropHeight: rect.height };
  }
  function moveDrag(event: ReactPointerEvent) {
    const state = drag.current;
    if (!state || event.pointerId !== state.pointer) return;
    let changes: Partial<ComposeLayer>;
    if (state.mode === "crop") {
      const rect = event.currentTarget.getBoundingClientRect();
      const x2 = Math.max(0, Math.min(state.cropWidth, event.clientX - rect.left));
      const y2 = Math.max(0, Math.min(state.cropHeight, event.clientY - rect.top));
      changes = { crop: { x: Math.min(state.x, x2) / state.cropWidth, y: Math.min(state.y, y2) / state.cropHeight, width: Math.max(0.001, Math.abs(x2 - state.x) / state.cropWidth), height: Math.max(0.001, Math.abs(y2 - state.y) / state.cropHeight) } };
      changes.crop!.width = Math.min(changes.crop!.width, 1 - changes.crop!.x); changes.crop!.height = Math.min(changes.crop!.height, 1 - changes.crop!.y);
    } else if (state.mode === "move") changes = { x: Math.round(Math.max(-32768, Math.min(32768, state.layer.x + (event.clientX - state.x) / state.scale))), y: Math.round(Math.max(-32768, Math.min(32768, state.layer.y + (event.clientY - state.y) / state.scale))) };
    else {
      const ratio = Math.max(1 / Math.min(state.layer.width, state.layer.height), Math.min(16384 / Math.max(state.layer.width, state.layer.height), 1 + (event.clientX - state.x) / state.scale / state.layer.width));
      changes = { width: state.layer.width * ratio, height: state.layer.height * ratio };
    }
    setDraft({ ...state.original, layers: state.original.layers.map((layer) => layer.id === state.layer.id ? { ...layer, ...changes } : layer) });
  }
  function endDrag(event: ReactPointerEvent, cancel = false) {
    const state = drag.current;
    if (!state) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (cancel) setDraft(state.original);
    else { setUndo((items) => [...items, state.original].slice(-50)); setRedo([]); }
  }
  const pointerHandlers = { onPointerMove: moveDrag, onPointerUp: (event: ReactPointerEvent) => endDrag(event), onPointerCancel: (event: ReactPointerEvent) => endDrag(event, true) };
  const numeric = (label: string, value: number, change: (value: number) => void, min: number, max: number, stepValue = 1) => <label><span>{label}</span><input aria-label={label} type="number" min={min} max={max} step={stepValue} value={Number(value.toFixed(4))} onChange={(event) => { const next = event.currentTarget.valueAsNumber; if (Number.isFinite(next) && next >= min && next <= max) change(next); }} /></label>;
  const hasVideo = videos.length > 0;
  return <div className="layer-dialog-backdrop nodrag nopan nowheel" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
    <div className="layer-dialog" role="dialog" aria-modal="true" aria-label="图层合成编辑器" tabIndex={-1} ref={dialogRef} onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !(event.target instanceof HTMLInputElement)) { event.preventDefault(); step(event.shiftKey ? 1 : -1); }
      if (event.key === "Tab") {
        const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]') || [])].filter((item) => item.getClientRects().length);
        if (event.shiftKey && (document.activeElement === focusable[0] || document.activeElement === dialogRef.current)) { event.preventDefault(); focusable.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0]?.focus(); }
      }
    }}>
      <header><strong><Layers3 />图层合成</strong><div><button type="button" aria-label="撤销图层编辑" disabled={!undo.length} onClick={() => step(-1)}><Undo2 /></button><button type="button" aria-label="重做图层编辑" disabled={!redo.length} onClick={() => step(1)}><Redo2 /></button><button type="button" onClick={onClose}>取消</button><button type="button" className="layer-primary" disabled={Boolean(errors.length) || Boolean(missing.length)} onClick={() => onApply(draft)}>应用</button><button type="button" aria-label="关闭图层编辑器" onClick={onClose}><X /></button></div></header>
      <div className="layer-editor-layout">
        <aside className="layer-assets"><h3>输入素材</h3>{!sources.length ? <p>连接图片或视频输入；计算节点尚无结果时，请先运行上游。</p> : null}
          {sources.map((source, index) => {
            const state = metadata[composeMetadataId(source)];
            return <div className="layer-asset" key={composeMetadataId(source)}><span>{source.kind === "image" ? "图片" : "视频"} · {source.media.name || index + 1}</span><button type="button" aria-label={`添加素材 ${index + 1}`} onClick={() => addMedia(source)}><Plus /></button>{selected?.kind === source.kind && !selected.locked ? <button type="button" onClick={() => addMedia(source, true)}>替换</button> : null}
              <small>{source.binding ? "跟随上游最新输出" : "固定当前素材"}</small>
              {state?.status === "loading" ? <small role="status">正在读取素材…</small> : state?.status === "error" ? <small role="alert">{state.message}<button type="button" aria-label={`重试素材 ${index + 1}`} onClick={() => loader.current?.retry(source)}>重试</button></small> : hasComposeMetadata(source) ? <small>{source.width} × {source.height}{source.kind === "video" ? ` · ${source.durationSeconds?.toFixed(1)} 秒${source.hasAudio ? "" : " · 无音轨"}` : ""}</small> : null}
            </div>;
          })}
          <button type="button" disabled={draft.layers.length >= 24} onClick={() => { const layer = newComposeLayer(nextId(), "solid", draft.width, draft.height); patch({ layers: [...draft.layers, layer] }); setSelectedId(layer.id); }}><Plus />新建纯色层</button>
          <h3>图层 · 上方优先显示</h3>
          <div className="layer-list">{[...draft.layers].reverse().map((layer) => <div key={layer.id} className={selectedId === layer.id ? "is-selected" : ""}>
            <button type="button" className="layer-name" onClick={() => { setSelectedId(layer.id); setCropMode(false); }}>{layer.name}</button>
            <button type="button" aria-label={`${layer.visible ? "隐藏" : "显示"}${layer.name}`} onClick={() => patch({ layers: draft.layers.map((item) => item.id === layer.id ? { ...item, visible: !item.visible } : item), audioLayerId: layer.visible && draft.audioLayerId === layer.id ? null : draft.audioLayerId })}>{layer.visible ? <Eye /> : <EyeOff />}</button>
            <button type="button" aria-label={`${layer.locked ? "解锁" : "锁定"}${layer.name}`} onClick={() => patch({ layers: draft.layers.map((item) => item.id === layer.id ? { ...item, locked: !item.locked } : item) })}>{layer.locked ? <LockKeyhole /> : <LockKeyholeOpen />}</button>
          </div>)}</div>
        </aside>
        <main className="layer-preview"><div className="layer-stage" ref={stageRef}>
          {cropMode && selected && selectedSource?.width && selectedSource.height ? <div className="layer-crop-source" style={{ width: selectedSource.width * Math.min((stageSize.width - 32) / selectedSource.width, (stageSize.height - 32) / selectedSource.height), aspectRatio: `${selectedSource.width}/${selectedSource.height}` }} onPointerDown={(event) => beginDrag(event, selected, "crop")} {...pointerHandlers}>
            {selected.kind === "image" ? <Image src={toRemoteImagePreviewSrc(selectedSource.media.url)} alt="裁剪素材" fill unoptimized draggable={false} /> : <video src={selectedSource.media.url} muted preload="metadata" />}
            <div className="layer-crop-rect" style={{ left: `${selected.crop.x * 100}%`, top: `${selected.crop.y * 100}%`, width: `${selected.crop.width * 100}%`, height: `${selected.crop.height * 100}%` }} />
          </div> : <div className={`layer-board ${draft.background === "transparent" ? "is-transparent" : ""}`} aria-label="合成画布" style={{ width: draft.width * scale, height: draft.height * scale, backgroundColor: draft.background }}>
            {draft.layers.filter((layer) => layer.visible).map((layer) => {
              const source = findComposeSource(layer, sources);
              const hidden = layer.kind === "video" && layer.endBehavior === "hide" && time >= (source?.durationSeconds || Infinity);
              if (hidden) return null;
              return <div key={layer.id} className={`layer-object ${selectedId === layer.id ? "is-selected" : ""}`} style={{ left: layer.x * scale, top: layer.y * scale, width: layer.width * scale, height: layer.height * scale, pointerEvents: layer.locked ? "none" : "auto" }} onPointerDown={(event) => beginDrag(event, layer, "move")} {...pointerHandlers}>
                <LayerVisual metadataState={source ? metadata[composeMetadataId(source)] : undefined} layer={layer} source={source} scale={scale} time={time} playing={playing} audible={draft.audioLayerId === layer.id} onError={setMessage} />
                {selectedId === layer.id && !layer.locked ? <button className="layer-scale-handle" type="button" aria-label="等比缩放图层" onPointerDown={(event) => beginDrag(event, layer, "scale")} {...pointerHandlers} /> : null}
              </div>;
            })}
          </div>}
        </div><div className="layer-playback"><span>{draft.width} × {draft.height} · {hasVideo ? "MP4" : "PNG"}</span>{hasVideo ? <><button type="button" aria-label={playing ? "暂停合成预览" : "播放合成预览"} disabled={!duration || cropMode || videos.some((layer) => { const source = findComposeSource(layer, sources); return !source || !hasComposeMetadata(source); })} onClick={() => { if (time >= duration) setTime(0); setPlaying(!playing); }}>{playing ? <Pause /> : <Play />}</button><input aria-label="合成预览进度" type="range" min={0} max={duration || 1} step={1 / 30} value={Math.min(time, duration)} onChange={(event) => { setPlaying(false); setTime(Number(event.target.value)); }} /><small>{time.toFixed(1)} / {duration.toFixed(1)} 秒</small></> : null}</div></main>
        <aside className="layer-properties"><h3>成品画布</h3><label><span>尺寸预设</span><select aria-label="合成尺寸预设" value="" onChange={(event) => { const [width, height] = event.target.value.split("x").map(Number); patch({ width, height }); }}><option value="" disabled>选择尺寸</option>{["1080x1920", "1080x1440", "1080x1080", "1920x1080"].map((value) => <option key={value} value={value}>{value.replace("x", " × ")}</option>)}</select></label>
          <div className="layer-fields">{numeric("画布宽度", draft.width, (width) => patch({ width }), 64, 4096)}{numeric("画布高度", draft.height, (height) => patch({ height }), 64, 4096)}</div>
          <label><span>透明底色</span><input type="checkbox" checked={draft.background === "transparent"} onChange={(event) => patch({ background: event.target.checked ? "transparent" : "#ffffff" })} /></label>{draft.background !== "transparent" ? <label><span>底色</span><input aria-label="画布底色" type="color" value={draft.background} onChange={(event) => patch({ background: event.target.value })} /></label> : <small>删除或隐藏背景图层后可见透明区域。</small>}
          {hasVideo ? <><label><span>成品时长</span><select aria-label="成品时长模式" value={draft.durationMode} onChange={(event) => patch({ durationMode: event.target.value as "longest" | "custom" })}><option value="longest">最长视频</option><option value="custom">自定义</option></select></label>{draft.durationMode === "custom" ? numeric("时长秒", draft.durationSeconds, (durationSeconds) => patch({ durationSeconds }), 1 / 30, 600, 1 / 30) : null}<label><span>声音来源</span><select aria-label="声音来源" value={draft.audioLayerId || ""} onChange={(event) => patch({ audioLayerId: event.target.value || null })}><option value="">整体静音</option>{videos.map((layer) => <option key={layer.id} value={layer.id}>{layer.name}{findComposeSource(layer, sources)?.hasAudio === false ? " · 无音轨" : ""}</option>)}</select></label></> : null}
          {selected ? <><h3>图层属性</h3><div className="layer-actions"><button type="button" aria-label="上移图层" disabled={selected.locked || draft.layers.at(-1)?.id === selected.id} onClick={() => { const layers = [...draft.layers], index = layers.findIndex((layer) => layer.id === selected.id); [layers[index], layers[index + 1]] = [layers[index + 1], layers[index]]; patch({ layers }); }}><ArrowUp /></button><button type="button" aria-label="下移图层" disabled={selected.locked || draft.layers[0]?.id === selected.id} onClick={() => { const layers = [...draft.layers], index = layers.findIndex((layer) => layer.id === selected.id); [layers[index], layers[index - 1]] = [layers[index - 1], layers[index]]; patch({ layers }); }}><ArrowDown /></button><button type="button" aria-label="复制图层" disabled={draft.layers.length >= 24 || (selected.kind === "video" && draft.layers.filter((layer) => layer.kind === "video").length >= 4)} onClick={() => { const layer = { ...structuredClone(selected), id: nextId(), name: `${selected.name} 副本`, locked: false }; patch({ layers: [...draft.layers, layer] }); setSelectedId(layer.id); }}><Copy /></button><button type="button" aria-label="删除图层" disabled={selected.locked} onClick={() => { patch({ layers: draft.layers.filter((layer) => layer.id !== selected.id), audioLayerId: draft.audioLayerId === selected.id ? null : draft.audioLayerId }); setSelectedId(undefined); }}><Trash2 /></button></div>
            <fieldset disabled={selected.locked}><label><span>名称</span><input aria-label="图层名称" maxLength={200} value={selected.name} onChange={(event) => patchLayer({ name: event.target.value })} /></label><label><span>不透明度 {Math.round(selected.opacity * 100)}%</span><input aria-label="图层不透明度" type="range" min={0} max={1} step={0.01} value={selected.opacity} onChange={(event) => patchLayer({ opacity: Number(event.target.value) })} /></label>
            <div className="layer-fields">{numeric("图层 X", selected.x, (x) => patchLayer({ x }), -32768, 32768)}{numeric("图层 Y", selected.y, (y) => patchLayer({ y }), -32768, 32768)}{numeric("图层宽度", selected.width, (width) => patchLayer({ width, height: selected.height * width / selected.width }), 1, 16384)}{numeric("图层高度", selected.height, (height) => patchLayer({ height, width: selected.width * height / selected.height }), 1, 16384)}</div>
            <button type="button" onClick={() => patchLayer({ x: (draft.width - selected.width) / 2, y: (draft.height - selected.height) / 2 })}>居中</button>
            {selected.kind === "solid" ? <label><span>图层颜色</span><input aria-label="图层颜色" type="color" value={selected.color} onChange={(event) => patchLayer({ color: event.target.value })} /></label> : <>
              <div className="layer-actions"><button type="button" onClick={() => patchLayer({ fit: "contain", x: 0, y: 0, width: draft.width, height: draft.height })}>完整显示</button><button type="button" onClick={() => patchLayer({ fit: "cover", x: 0, y: 0, width: draft.width, height: draft.height })}>裁剪填满</button></div>
              <button type="button" disabled={!selectedSource?.width} aria-pressed={cropMode} onClick={() => { setPlaying(false); setCropMode(!cropMode); }}><Crop />{cropMode ? "完成裁剪" : "矩形裁剪"}</button>
              {cropMode ? <><small>拖动框选保留区域，原素材不变。</small><div className="layer-fields">{numeric("裁剪 X %", selected.crop.x * 100, (x) => patchLayer({ crop: { ...selected.crop, x: x / 100, width: Math.min(selected.crop.width, 1 - x / 100) } }), 0, 99.9, 0.1)}{numeric("裁剪 Y %", selected.crop.y * 100, (y) => patchLayer({ crop: { ...selected.crop, y: y / 100, height: Math.min(selected.crop.height, 1 - y / 100) } }), 0, 99.9, 0.1)}{numeric("裁剪宽度 %", selected.crop.width * 100, (width) => patchLayer({ crop: { ...selected.crop, width: width / 100 } }), 0.1, (1 - selected.crop.x) * 100, 0.1)}{numeric("裁剪高度 %", selected.crop.height * 100, (height) => patchLayer({ crop: { ...selected.crop, height: height / 100 } }), 0.1, (1 - selected.crop.y) * 100, 0.1)}</div><button type="button" onClick={() => patchLayer({ crop: { ...fullLayerCrop } })}>恢复完整素材</button></> : null}
              {selected.kind === "video" ? <label><span>视频结束后</span><select aria-label="视频结束后" value={selected.endBehavior} onChange={(event) => patchLayer({ endBehavior: event.target.value as ComposeLayer["endBehavior"] })}><option value="hold">停留末帧</option><option value="loop">循环播放</option><option value="hide">隐藏</option></select></label> : null}
            </>}</fieldset></> : <p>选择图层以调整位置、大小和裁剪。</p>}
        </aside>
      </div><footer role={message || errors.length || missing.length ? "alert" : "status"}>{message || errors.join(" ") || (missing.length ? `素材已失效：${missing.map((layer) => layer.name).join("、")}。请在输入素材中重新选择。` : "图片与视频保持原比例；超出画布的部分不会输出。")}</footer>
    </div>
  </div>;
}

function LayerVisual({ metadataState, layer, source, scale, time, playing, audible, onError }: { metadataState?: ComposeMetadataState; layer: ComposeLayer; source?: ComposeSource; scale: number; time: number; playing: boolean; audible: boolean; onError: (message: string) => void }) {
  if (layer.kind === "solid") return <div className="layer-visual" style={{ inset: 0, background: layer.color, opacity: layer.opacity }} />;
  if (!source?.width || !source.height) return <div className="layer-missing">{metadataState?.status === "error" ? "读取失败，请在素材列表重试" : source ? "正在读取素材" : "素材已失效"}</div>;
  const geometry = composeLayerGeometry(layer, source.width, source.height);
  const style: CSSProperties = { position: "absolute", maxWidth: "none", width: source.width * geometry.width / geometry.crop.width * scale, height: source.height * geometry.height / geometry.crop.height * scale,
    left: -geometry.crop.left * geometry.width / geometry.crop.width * scale, top: -geometry.crop.top * geometry.height / geometry.crop.height * scale, pointerEvents: "none" };
  return <div className="layer-visual" style={{ left: (geometry.x - layer.x) * scale, top: (geometry.y - layer.y) * scale, width: geometry.width * scale, height: geometry.height * scale, opacity: layer.opacity }}>
    {layer.kind === "image" ? <Image src={toRemoteImagePreviewSrc(source.media.url)} alt={layer.name} width={source.width} height={source.height} unoptimized draggable={false} style={style} /> : <SynchronizedVideo source={source} time={time} playing={playing} behavior={layer.endBehavior} audible={audible} style={style} onError={onError} />}
  </div>;
}
function SynchronizedVideo({ source, time, playing, behavior, audible, style, onError }: { source: ComposeSource; time: number; playing: boolean; behavior: ComposeLayer["endBehavior"]; audible: boolean; style: CSSProperties; onError: (message: string) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const failed = useRef(false);
  const [readyUrl, setReadyUrl] = useState("");
  useEffect(() => {
    const video = ref.current;
    if (!video || !video.readyState) return;
    const duration = source.durationSeconds || video.duration;
    const target = behavior === "loop" ? time % duration : Math.min(time, Math.max(0, duration - 1 / 30));
    if (Math.abs(video.currentTime - target) > (playing ? 0.12 : 0.015)) video.currentTime = target;
    video.muted = !audible || (behavior !== "loop" && time >= duration);
    if (playing && (behavior === "loop" || time < duration) && !failed.current) {
      if (video.paused) void video.play().catch(() => { failed.current = true; onError("浏览器无法播放该视频预览，请检查素材格式。"); });
    } else video.pause();
  }, [time, playing, behavior, audible, source.durationSeconds, source.media.url, readyUrl, onError]);
  return <video ref={ref} src={source.media.url} style={style} playsInline preload="metadata" onLoadedMetadata={() => { failed.current = false; setReadyUrl(source.media.url); }} muted={!audible} onError={() => onError("视频预览载入失败，请检查素材地址或格式。")} />;
}
