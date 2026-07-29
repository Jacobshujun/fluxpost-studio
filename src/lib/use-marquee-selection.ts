"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { makeScreenRect, screenRectsIntersect, type ScreenRect } from "./marquee-selection";

type UseMarqueeSelectionOptions = {
  containerRef: RefObject<HTMLElement | null>;
  selectedIds: Set<string>;
  onSelectionChange(next: Set<string>): void;
};

type MarqueeGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  additive: boolean;
  baseline: Set<string>;
  active: boolean;
};

const dragThreshold = 4;
const selectableAttribute = "data-marquee-id";

export function useMarqueeSelection({ containerRef, selectedIds, onSelectionChange }: UseMarqueeSelectionOptions) {
  const gestureRef = useRef<MarqueeGesture | undefined>(undefined);
  const [selectionRect, setSelectionRect] = useState<ScreenRect>();

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType !== "mouse" || event.button !== 0 || event.target !== event.currentTarget) return;
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      additive: event.ctrlKey || event.metaKey,
      baseline: new Set(selectedIds),
      active: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const rect = makeScreenRect(gesture.startX, gesture.startY, event.clientX, event.clientY);
    if (!gesture.active && Math.max(rect.width, rect.height) < dragThreshold) return;
    gesture.active = true;
    event.preventDefault();
    setSelectionRect(rect);

    const next = gesture.additive ? new Set(gesture.baseline) : new Set<string>();
    containerRef.current?.querySelectorAll<HTMLElement>(`[${selectableAttribute}]`).forEach((element) => {
      const id = element.getAttribute(selectableAttribute);
      if (id && screenRectsIntersect(rect, element.getBoundingClientRect())) next.add(id);
    });
    onSelectionChange(next);
  }

  function finishGesture(event: ReactPointerEvent<HTMLElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = undefined;
    setSelectionRect(undefined);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return {
    selectionRect,
    marqueeProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finishGesture,
      onPointerCancel: finishGesture,
      onLostPointerCapture: finishGesture,
    },
  };
}
