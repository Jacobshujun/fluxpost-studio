"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";

type Size = { width: number; height: number };
type View = { scale: number | null; x: number; y: number };
const fitted: View = { scale: null, x: 0, y: 0 };
const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

// Callers key this component by image identity: image changes reset the view,
// while the surrounding resizable panel keeps its rectangle.
export function ImagePreview({ src, onNaturalSize }: { src: string; onNaturalSize?: (size: Size) => void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View>(fitted);
  const pan = useRef<{ pointerId: number; x: number; y: number; start: View } | null>(null);
  const [view, setView] = useState<View>(fitted);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [natural, setNatural] = useState<Size | null>(null);
  const [failed, setFailed] = useState(false);
  const [panning, setPanning] = useState(false);
  const fit = natural && size.width && size.height ? Math.min(1, size.width / natural.width, size.height / natural.height) : 1;
  const minimum = Math.min(.1, fit);
  const ready = Boolean(natural && size.width && size.height && !failed);

  const constrain = useCallback((next: View) => {
    const scale = next.scale === null ? fit : Math.min(5, Math.max(minimum, next.scale));
    return {
      scale,
      x: next.scale === null ? 0 : clamp(next.x, Math.max(0, ((natural?.width ?? 0) * scale - size.width) / 2)),
      y: next.scale === null ? 0 : clamp(next.y, Math.max(0, ((natural?.height ?? 0) * scale - size.height) / 2)),
    };
  }, [fit, minimum, natural, size]);
  const visible = constrain(view);
  const pannable = ready && Boolean(natural && (natural.width * visible.scale > size.width + .5 || natural.height * visible.scale > size.height + .5));

  const update = useCallback((next: View) => {
    viewRef.current = next;
    setView(next);
  }, []);
  const zoomTo = useCallback((value: number, x = 0, y = 0) => {
    const current = constrain(viewRef.current);
    const scale = Math.min(5, Math.max(minimum, value));
    if (scale === current.scale) return;
    const ratio = scale / current.scale;
    update(constrain({ scale, x: x - (x - current.x) * ratio, y: y - (y - current.y) * ratio }));
  }, [constrain, minimum, update]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    function wheel(event: WheelEvent) {
      event.preventDefault();
      if (!ready || !event.deltaY || !stage) return;
      const bounds = stage.getBoundingClientRect();
      zoomTo(constrain(viewRef.current).scale * (event.deltaY < 0 ? 1.2 : 1 / 1.2), event.clientX - bounds.left - bounds.width / 2, event.clientY - bounds.top - bounds.height / 2);
    }
    stage.addEventListener("wheel", wheel, { passive: false });
    return () => stage.removeEventListener("wheel", wheel);
  }, [constrain, ready, zoomTo]);

  function finishPan(event: React.PointerEvent<HTMLDivElement>) {
    if (pan.current?.pointerId !== event.pointerId) return;
    pan.current = null;
    setPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return <div className="image-preview">
    <div ref={stageRef} className={`image-preview-viewport${pannable ? " is-pannable" : ""}${panning ? " is-panning" : ""}`}
      aria-label="图片缩放预览" data-mode={view.scale === null ? "fit" : "manual"}
      onDoubleClick={() => update(fitted)}
      onMouseDown={(event) => { if (event.button === 1) event.preventDefault(); }}
      onPointerDown={(event) => {
        if (event.pointerType !== "mouse" || event.button !== 0 || !pannable) return;
        event.preventDefault();
        pan.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, start: constrain(viewRef.current) };
        event.currentTarget.setPointerCapture(event.pointerId);
        setPanning(true);
      }}
      onPointerMove={(event) => {
        const active = pan.current;
        if (!active || active.pointerId !== event.pointerId) return;
        update(constrain({ ...active.start, x: active.start.x + event.clientX - active.x, y: active.start.y + event.clientY - active.y }));
      }}
      onPointerUp={finishPan} onPointerCancel={finishPan} onLostPointerCapture={finishPan}>
      {!natural && !failed ? <span role="status">图片加载中…</span> : null}
      {failed ? <span role="alert">图片加载失败</span> : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="图片预览" referrerPolicy="no-referrer" draggable={false}
        onLoad={(event) => {
          const dimensions = { width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight };
          setNatural(dimensions);
          onNaturalSize?.(dimensions);
        }}
        onError={() => setFailed(true)}
        style={{ visibility: ready ? "visible" : "hidden", width: (natural?.width ?? 0) * visible.scale, height: (natural?.height ?? 0) * visible.scale, transform: `translate(-50%, -50%) translate(${visible.x}px, ${visible.y}px)` }} />
    </div>
    <div className="image-preview-tools">
      <button type="button" className="soft-button" aria-label="缩小图片" disabled={!ready || visible.scale <= minimum} onClick={() => zoomTo(visible.scale / 1.2)}><Minus size={16} /></button>
      <output aria-label="图片缩放比例">{ready ? `${Number((visible.scale * 100).toFixed(1))}%` : "—"}</output>
      <button type="button" className="soft-button" aria-label="放大图片" disabled={!ready || visible.scale >= 5} onClick={() => zoomTo(visible.scale * 1.2)}><Plus size={16} /></button>
      <button type="button" className="soft-button" disabled={!ready} onClick={() => update({ scale: 1, x: 0, y: 0 })}>原图 100%</button>
      <button type="button" className="soft-button" disabled={!ready} onClick={() => update(fitted)}><RotateCcw size={14} />适应窗口</button>
    </div>
  </div>;
}
