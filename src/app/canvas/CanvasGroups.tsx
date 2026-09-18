"use client";

import { ViewportPortal, useReactFlow } from "@xyflow/react";
import { useRef, type CSSProperties, type PointerEvent } from "react";
import type { CanvasGroup, CanvasPosition } from "@/lib/canvas/types";
import "./groups.css";

export function CanvasGroups({ groups, selectedId, readOnly, onSelect, onStart, onChange, onEnd, onRemove }: {
  groups: CanvasGroup[];
  selectedId?: string;
  readOnly?: boolean;
  onSelect: (id: string) => void;
  onStart: (id: string) => void;
  onChange: (group: CanvasGroup, delta?: CanvasPosition) => void;
  onEnd: () => void;
  onRemove: (id: string) => void;
}) {
  const flow = useReactFlow();
  const gesture = useRef<{ group: CanvasGroup; start: CanvasPosition; resize: boolean } | null>(null);
  function begin(event: PointerEvent<HTMLElement>, group: CanvasGroup, resize: boolean) {
    if (readOnly || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    onStart(group.id);
    onSelect(group.id);
    gesture.current = { group: structuredClone(group), start: flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }), resize };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLElement>) {
    const active = gesture.current;
    if (!active) return;
    const point = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const delta = { x: point.x - active.start.x, y: point.y - active.start.y };
    const group = active.group;
    onChange(active.resize ? { ...group, size: { width: Math.max(80, group.size.width + delta.x), height: Math.max(60, group.size.height + delta.y) } }
      : { ...group, position: { x: group.position.x + delta.x, y: group.position.y + delta.y } }, active.resize ? undefined : delta);
  }
  function end() {
    if (!gesture.current) return;
    gesture.current = null;
    onEnd();
  }
  return <ViewportPortal><div className="canvas-groups-layer">
    {groups.map((group) => <section key={group.id} data-group-id={group.id} aria-label={`分组 ${group.title}`}
      className={`canvas-group ${selectedId === group.id ? "canvas-group-selected" : ""}`}
      style={{ "--group-color": group.color, left: group.position.x, top: group.position.y, width: group.size.width, height: group.size.height } as CSSProperties}>
      <button type="button" className="canvas-group-title nodrag nopan" aria-label={`选择分组 ${group.title}`} disabled={readOnly}
        onPointerDown={(event) => begin(event, group, false)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}
        onClick={(event) => { event.stopPropagation(); onSelect(group.id); }}>{group.title || "分组"}</button>
      {selectedId === group.id && !readOnly ? <>
        <div className="canvas-group-tools nodrag nopan nowheel" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
          <input aria-label="分组名称" value={group.title} maxLength={80} onChange={(event) => onChange({ ...group, title: event.target.value })} />
          <input aria-label="分组颜色" type="color" value={group.color} onChange={(event) => onChange({ ...group, color: event.target.value })} />
          <button type="button" onClick={() => onRemove(group.id)}>解散</button>
        </div>
        <button type="button" className="canvas-group-resize nodrag nopan" aria-label="调整分组大小"
          onPointerDown={(event) => begin(event, group, true)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} />
      </> : null}
    </section>)}
  </div></ViewportPortal>;
}
