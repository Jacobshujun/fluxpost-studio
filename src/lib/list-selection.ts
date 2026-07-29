const editableTargetSelector = "input, textarea, select, [contenteditable='true']";

export function selectIdRange(
  orderedIds: readonly string[],
  selectedIds: ReadonlySet<string>,
  anchorId: string | undefined,
  targetId: string,
  additive: boolean,
) {
  const targetIndex = orderedIds.indexOf(targetId);
  if (targetIndex < 0) return new Set(selectedIds);

  const anchorIndex = anchorId ? orderedIds.indexOf(anchorId) : -1;
  const startIndex = anchorIndex >= 0 ? Math.min(anchorIndex, targetIndex) : targetIndex;
  const endIndex = anchorIndex >= 0 ? Math.max(anchorIndex, targetIndex) : targetIndex;
  const rangeIds = orderedIds.slice(startIndex, endIndex + 1);
  return new Set(additive ? [...selectedIds, ...rangeIds] : rangeIds);
}

export function isEditableSelectionTarget(target: EventTarget | null) {
  if (!target) return false;
  const closest = (target as Partial<Pick<Element, "closest">>).closest;
  return typeof closest === "function" && Boolean(closest.call(target, editableTargetSelector));
}
