"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Rect = { left: number; top: number; width: number; height: number };
const directions = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;
type Direction = typeof directions[number];
const names: Record<Direction, string> = { n: "上边", ne: "右上角", e: "右边", se: "右下角", s: "下边", sw: "左下角", w: "左边", nw: "左上角" };
const margin = 14;

export function ResizablePreviewPanel({ className, initialWidth, children }: { className: string; initialWidth: number; children: ReactNode }) {
  const [rect, setRect] = useState<Rect | null>(null);
  const drag = useRef<{ pointerId: number; direction: Direction; x: number; y: number; rect: Rect } | null>(null);

  useEffect(() => {
    const fitWindow = () => {
      drag.current = null;
      const width = Math.max(1, window.innerWidth - margin * 2);
      const height = Math.max(1, window.innerHeight - margin * 2);
      setRect((current) => {
        if (window.innerWidth < 640) return { left: margin, top: margin, width, height };
        if (!current) {
          const w = Math.min(initialWidth, width), h = Math.min(900, height);
          return { left: (window.innerWidth - w) / 2, top: (window.innerHeight - h) / 2, width: w, height: h };
        }
        const w = Math.min(width, Math.max(360, current.width)), h = Math.min(height, Math.max(320, current.height));
        return { width: w, height: h, left: Math.max(margin, Math.min(current.left, window.innerWidth - margin - w)), top: Math.max(margin, Math.min(current.top, window.innerHeight - margin - h)) };
      });
    };
    fitWindow();
    window.addEventListener("resize", fitWindow);
    return () => window.removeEventListener("resize", fitWindow);
  }, [initialWidth]);

  function finish(event: React.PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return <div className={`${className} resizable-preview-panel`} style={rect ?? { visibility: "hidden" }}>
    {children}
    {directions.map((direction) => <div key={direction} className={`preview-resize-handle preview-resize-${direction}`} aria-label={`调整预览窗口${names[direction]}`} data-resize={direction}
      onPointerDown={(event) => {
        if (!rect || event.pointerType !== "mouse" || event.button !== 0) return;
        event.preventDefault(); event.stopPropagation();
        drag.current = { pointerId: event.pointerId, direction, x: event.clientX, y: event.clientY, rect };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const active = drag.current;
        if (!active || active.pointerId !== event.pointerId) return;
        const r = active.rect, dx = event.clientX - active.x, dy = event.clientY - active.y;
        const minWidth = Math.min(360, window.innerWidth - margin * 2), minHeight = Math.min(320, window.innerHeight - margin * 2);
        let left = r.left, right = r.left + r.width, top = r.top, bottom = r.top + r.height;
        if (active.direction.includes("w")) left = Math.max(margin, Math.min(right - minWidth, r.left + dx));
        if (active.direction.includes("e")) right = Math.min(window.innerWidth - margin, Math.max(left + minWidth, right + dx));
        if (active.direction.includes("n")) top = Math.max(margin, Math.min(bottom - minHeight, r.top + dy));
        if (active.direction.includes("s")) bottom = Math.min(window.innerHeight - margin, Math.max(top + minHeight, bottom + dy));
        setRect({ left, top, width: right - left, height: bottom - top });
      }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} />)}
  </div>;
}
