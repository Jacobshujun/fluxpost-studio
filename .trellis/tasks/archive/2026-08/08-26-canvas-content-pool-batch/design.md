# Design

## Boundaries

- `src/lib/content-pool.ts` owns filter normalization, owner-visible candidate resolution, stable ordering, cursor paging, compact row projection, and frozen snapshot creation.
- A thin read-only route exposes the selection page to authenticated Canvas UI callers.
- Canvas registry/types declare the new parameter and adapter. V2 preflight resolves source filters; `scheduler-v2.ts` injects a frozen value into the bound node.
- The Canvas page owns the shared picker presentation, normal-node single selection, and schedule-source editing. Existing theme tokens and Lucide icons remain authoritative.

## Contracts

The selection query supports `projectId`, `q`, repeated `platform`, `status`, `mediaType`, and `contentTag`, `localMedia=complete`, `sort`, `cursor`, and a bounded `limit`. Its response contains compact `items`, accessible project summaries, `total`, and `nextCursor`.

The scheduler adds these concepts without changing node config or database schema:

```ts
type CanvasScheduleContentPoolFilter = {
  mode: "manual" | "match";
  itemIds: string[];
  projectId?: string;
  query: string;
  platforms: Platform[];
  statuses: SourceUsageStatus[];
  mediaTypes: SourceMediaType[];
  contentTags: ContentTag[];
  localMediaComplete: boolean;
  sort: ContentPoolSelectionSort;
};

type CanvasScheduleContentPoolSnapshot = {
  id: string;
  projectId: string;
  projectName: string;
  platform: Platform;
  title: string;
  body: string;
  sourceUrl: string;
  imageUrls: string[];
  videoUrls: string[];
  snapshotAt: string;
};
```

`CanvasScheduleParameterType` gains `content-pool`; `CanvasScheduleParameterSource` gains a content-pool filter source; `CanvasScheduleParameterValue` gains the frozen snapshot; and `CanvasBatchBindingAdapter` gains `content-pool-input`.

## Data Flow

1. The picker sends normalized filters to the selection route and renders one cursor page at a time.
2. Normal-node selection converts the selected compact/source item into the existing flattened node config through one shared snapshot helper.
3. V2 preflight resolves a manual id list in stored order or condition matches in stable sort order, deduplicates by source id, applies fixed/each/random capacity rules, and freezes only selected values.
4. Existing V2 expansion creates one main assignment per `each` value. Every child graph receives the main parameter.
5. The adapter replaces all content-pool snapshot config fields atomically before graph validation and execution.
6. Launch validates workflow revision and preview fingerprint but does not require the mutable source record to still exist.

## UI

- Search, project, and sort remain visible. A filter disclosure contains platform, status, media type, content tags, and local-media completeness with an active-count badge.
- A bounded result viewport uses fixed thumbnail geometry and explicit load-more, avoiding result-driven inspector resizing.
- The normal node uses radio-like single selection. The scheduler manual source uses checkboxes and count-aware select-all/clear controls; condition mode keeps preview available but disables selection controls.
- Content-pool expansion labels become `固定单条`, `每条一项`, and `随机抽取`; invalid counts/errors stay adjacent to the source editor.
- Preview uses the existing Canvas overlay and stops events from reaching canvas pan/drag shortcuts.

## Compatibility and Failure Behavior

- No node-version or storage migration is required. Historical schedule sources normalize exactly as before.
- A new schedule containing the source is readable only by code that knows the new union member; old records remain unchanged.
- Manual ids that are missing or unauthorized fail as a group before preview persistence. Match mode with zero candidates fails clearly.
- Full `each` expansion above 200 fails. Random sources may match more than 200 candidates but may freeze at most 200.
- Rollback removes the route, UI, union members, resolver, and adapter; there is no runtime-data cleanup.
