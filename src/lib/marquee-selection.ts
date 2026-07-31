export type ScreenRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export function makeScreenRect(startX: number, startY: number, endX: number, endY: number): ScreenRect {
  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  const right = Math.max(startX, endX);
  const bottom = Math.max(startY, endY);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

export function screenRectsIntersect(left: Pick<ScreenRect, "left" | "top" | "right" | "bottom">, right: Pick<ScreenRect, "left" | "top" | "right" | "bottom">) {
  return left.left <= right.right && left.right >= right.left && left.top <= right.bottom && left.bottom >= right.top;
}
