# Component Guidelines

## Page Modules

FluxPost currently keeps page-local UI components in the same page file. Examples:

- `src/app/review/page.tsx` defines `Metric`, `FieldLabel`, `PostThumb`, `StatusBadge`, and `PublishStatusCard` below the main `ReviewPage`.
- `src/app/distribution-check/page.tsx` keeps audit controls and result rendering in the route page module.
- `src/app/page.tsx` owns the main workspace modules and should preserve the existing top-level workspace flow.

Use this pattern for UI that is route-specific. Extract a shared component only when it is used across pages or would remove meaningful duplication.

## Props

- Prefer explicit TypeScript prop objects inline for small local components, as in `Metric({ label, value }: { label: string; value: string | number })`.
- Use shared domain types from `src/lib/types.ts` for generated posts, source items, runs, and publish states.
- Keep callback props narrow and command-like; avoid passing broad mutable page state into helpers.

## Controls And Icons

- Use `lucide-react` icons for visible actions when an icon exists. Existing examples include refresh, publish, preview, approve, delete, and search actions in `src/app/review/page.tsx`.
- Buttons should expose concrete commands such as save, approve, publish, refresh, select, or delete.
- Keep operational controls compact and scan-friendly; this app is a workbench, not a marketing site.

## Styling

- Use existing classes and CSS variables from `src/app/globals.css`, such as `field`, `soft-button`, `primary-button`, `status-badge`, `ops-panel`, and page-specific review/distribution classes.
- Keep card radii and control geometry consistent with the existing operational UI.
- Do not create nested cards or decorative page sections for tool surfaces.

## Accessibility And Feedback

- Preserve semantic controls: real `button`, `input`, `textarea`, `select`, and checkbox elements.
- Long-running actions should show busy states, disabled controls, or progress text. Existing examples include `busy` in `src/app/review/page.tsx` and job progress polling in distribution/simple-run flows.
- User-visible failures should surface as messages from API responses, not silent console-only errors.

When a list selection owns an editable draft, update the selected id and draft in the same click/load command. Do not defer draft synchronization through `setTimeout`: a fast user can type before the timer fires and lose their input.

```tsx
selectedIdRef.current = entry.id;
setSelectedId(entry.id);
setDraft(draftFromEntry(entry));
```

Keep batch selected ids independent from the editable item id. `Ctrl`/`Cmd` click toggles one item, `Shift` click selects an ordered range, and `Ctrl`/`Cmd` + `Shift` unions that range. For cursor-paginated lists, select-all must consume every `nextCursor` before committing. Visible and keyboard select-all share one command; global shortcuts ignore editable targets and dialogs, and `Delete` only opens confirmation. Deterministic checks cover range union, cursor consumption, and the editable-target guard.

Cursor-consuming commands must also validate the latest query identity and latest selection mode immediately before committing. A request generation captured when the command starts is insufficient because React has a render-to-effect window: a slow select-all response can otherwise commit an old filter object after the user switches modes. Keep the current query and filter in refs, invalidate the generation during effect cleanup, and build the final update from the live manual filter only. Browser checks should hold a later cursor response, change the query or mode, release the old response, and assert that neither visible results nor selected ids roll back.

For viewport-height split workspaces, constrain the root and each intervening flex/grid child with an explicit height or `min-height: 0`. Put `overflow: auto` only on the intended list/editor panes; otherwise a Grid child keeps `min-height: auto`, expands the document, and scrolls fixed tools away. Browser checks should send a wheel event and assert pane `scrollTop` changes while `window.scrollY` and sibling pane coordinates do not.

## Exclusive Wheel Zoom In Scrollable Previews

When an `overflow: auto` preview owns wheel zoom, a React `onWheel` handler is not sufficient to guarantee exclusive gesture ownership. Delegated wheel listeners can be passive, so the zoom state may update before the same wheel performs delayed native scrolling. Use a native non-passive listener with cleanup, and cancel middle-button default behavior to prevent Chromium auto-scroll.

```tsx
useEffect(() => {
  const stage = stageRef.current;
  if (!stage) return;
  const handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    updateZoom((current) => current + (event.deltaY < 0 ? zoomStep : -zoomStep));
  };
  stage.addEventListener("wheel", handleWheel, { passive: false });
  return () => stage.removeEventListener("wheel", handleWheel);
}, [updateZoom]);

<div ref={stageRef} onMouseDown={(event) => {
  if (event.button === 1) event.preventDefault();
}} />
```

Browser checks must place scroll offsets away from their bounds, send a real wheel event, wait for default scrolling to settle, and assert that zoom changes while `scrollLeft`/`scrollTop` stay fixed. They must also press and move the middle button and assert that native auto-scroll does not start.

For drag-to-pan, capture the primary mouse pointer only after overflow. Map origin deltas to initial `scrollLeft`/`scrollTop`; release, cancel, and lost-capture clear state. Never capture touch.

```tsx
if (event.pointerType === "mouse" && event.button === 0 && zoom > 1)
  stage.setPointerCapture(event.pointerId);
```

Browser checks cover no-overflow, captured out-of-stage drag, release, wheel, and middle mouse.

## Interactive Controls Inside React Flow Nodes

Desktop canvas panes use `panOnDrag={isMobile}` plus `selectionOnDrag={!isMobile}`: the idle desktop pane uses the arrow cursor, Space temporarily enables hand-cursor panning, and touch panning remains available on mobile.

Controls rendered inside a React Flow node must isolate canvas gestures without changing node selection during `pointerdown`. A selection update can redraw a scaled mobile node before the browser delivers `click`, leaving the editor unfocused or stale. Keep inspector selection in route state, then focus and select from the completed click sequence.

```tsx
<textarea
  className="nodrag nopan nowheel"
  onPointerDown={(event) => event.stopPropagation()}
  onClick={(event) => {
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    selectNode(nodeId);
  }}
/>
```

Canvas-level empty-selection notifications must not clear this route-owned inspector state; use an explicit pane click or close command to clear it. This keeps native text editing, mobile focus, node highlighting, and the inspector synchronized without persisting UI callbacks in graph data.

Long-text editors inside React Flow nodes must keep a component-local draft while focused, update that draft before writing through to graph state, and accept external values only while unfocused. A textarea controlled directly by graph state can receive its value back through the React Flow store after the native input event and move the caret to the end.

```tsx
const editorRef = useRef<HTMLTextAreaElement>(null);
const [draft, setDraft] = useState(value);

useEffect(() => {
  if (document.activeElement !== editorRef.current) setDraft(value);
}, [value]);

<textarea
  ref={editorRef}
  value={draft}
  onChange={(event) => {
    setDraft(event.target.value);
    updateGraph(event.target.value);
  }}
/>
```

## Avoid

- Do not introduce a UI component library without a strong local need.
- Do not add visible instructional copy that explains keyboard shortcuts or implementation details.
- Do not let text overflow fixed buttons or compact panels; use truncation or layout changes that preserve readability.
