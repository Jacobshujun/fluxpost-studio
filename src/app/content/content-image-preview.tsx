"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";

type View = { zoom: number; x: number; y: number };
const initialView: View = { zoom: 1, x: 0, y: 0 };

// Mounted by image identity so navigation and reopening start fitted and centered.
export function ContentImagePreview({ src }: { src: string }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef(initialView);
  const pan = useRef<{ pointerId: number; x: number; y: number; start: View } | null>(null);
  const [view, setView] = useState(initialView);
  const [panning, setPanning] = useState(false);

  const update = useCallback((next: View) => {
    viewRef.current = next;
    setView(next);
  }, []);

  const zoomBy = useCallback((factor: number, x = 0, y = 0) => {
    const current = viewRef.current;
    const zoom = Math.min(5, Math.max(1, current.zoom * factor));
    if (zoom === current.zoom) return;
    const ratio = zoom / current.zoom;
    update(zoom === 1 ? initialView : { zoom, x: x - (x - current.x) * ratio, y: y - (y - current.y) * ratio });
  }, [update]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    function wheel(event: WheelEvent) {
      event.preventDefault();
      if (!event.deltaY || !stage) return;
      const bounds = stage.getBoundingClientRect();
      zoomBy(event.deltaY < 0 ? 1.2 : 1 / 1.2, event.clientX - bounds.left - bounds.width / 2, event.clientY - bounds.top - bounds.height / 2);
    }
    stage.addEventListener("wheel", wheel, { passive: false });
    return () => stage.removeEventListener("wheel", wheel);
  }, [zoomBy]);

  function finishPan(event: React.PointerEvent<HTMLDivElement>) {
    if (pan.current?.pointerId !== event.pointerId) return;
    pan.current = null;
    setPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return <>
    <div ref={stageRef} className={`content-image-viewport${view.zoom > 1 ? " is-pannable" : ""}${panning ? " is-panning" : ""}`}
      aria-label="图片缩放预览"
      onDoubleClick={() => update(initialView)}
      onMouseDown={(event) => { if (event.button === 1) event.preventDefault(); }}
      onPointerDown={(event) => {
        if (event.pointerType !== "mouse" || event.button !== 0 || viewRef.current.zoom <= 1) return;
        event.preventDefault();
        pan.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, start: viewRef.current };
        event.currentTarget.setPointerCapture(event.pointerId);
        setPanning(true);
      }}
      onPointerMove={(event) => {
        const active = pan.current;
        if (!active || active.pointerId !== event.pointerId) return;
        update({ ...viewRef.current, x: active.start.x + event.clientX - active.x, y: active.start.y + event.clientY - active.y });
      }}
      onPointerUp={finishPan} onPointerCancel={finishPan} onLostPointerCapture={finishPan}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="图片预览" referrerPolicy="no-referrer" draggable={false}
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }} />
    </div>
    <div className="content-image-zoom-tools">
      <button type="button" className="soft-button" aria-label="缩小图片" disabled={view.zoom <= 1} onClick={() => zoomBy(1 / 1.2)}><Minus size={16} /></button>
      <output aria-label="图片缩放比例">{Math.round(view.zoom * 100)}%</output>
      <button type="button" className="soft-button" aria-label="放大图片" disabled={view.zoom >= 5} onClick={() => zoomBy(1.2)}><Plus size={16} /></button>
      <button type="button" className="soft-button" onClick={() => update(initialView)}><RotateCcw size={14} />适应窗口</button>
    </div>
  </>;
}
