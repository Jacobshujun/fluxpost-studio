# Design

## Boundaries

- `src/lib/canvas/scheduler.ts` owns candidate resolution, strict capacity validation, random sampling, frozen assignment, and resampling semantics.
- `src/app/canvas/page.tsx` owns the operator-facing “条件随机” wording and pool status text.
- `.trellis/verification/canvas_scheduler_check.mjs` owns deterministic regression coverage for allocation and resampling contracts.
- Existing `CanvasScheduleCopyFilter.mode: "manual" | "tags"` remains unchanged, so stored schedules and API payloads require no migration.

## Data Flow

1. Resolve accessible entries using the existing owner-scoped copy-library query and current manual or keyword/AND-tag filter.
2. Stable-sort candidate snapshots before sampling so injected deterministic random functions can produce reproducible tests.
3. Validate `candidateCount >= contentTaskCount`; otherwise throw a batch-specific error containing both counts.
4. Shuffle a copied candidate array with the existing Fisher-Yates sampler and take exactly `contentTaskCount` snapshots.
5. Zip sampled scenes and sampled copies by index, then freeze them into `CanvasScheduleContentTask.copy`.
6. Whole-batch resampling resolves the current copy pool again and samples a new unique assignment; single-content resampling preserves the task's existing copy snapshot.

## Compatibility

- The serialized filter mode stays `tags`; only its operator label and allocation behavior change.
- Manual pools also use no-replacement random allocation because they represent an explicitly selected candidate pool.
- Schedules without `copyFilter` keep `copy` undefined and preserve the five-required-role compatibility path.
- Launch and finalization continue consuming frozen snapshots and do not query the copy library.

## Trade-offs

- Random sampling means repeated preflights may produce different assignments. This matches the requested conditional-random behavior; the resulting preview remains immutable once launched.
- Strict capacity validation can reject schedules that previously reused copy. The explicit failure is required to guarantee batch-local uniqueness.
- No attempt is made to force a different result from the immediately previous sample; randomness guarantees uniqueness within one result, not novelty across repeated samples.

## Rollback

Revert the scheduler allocation helper, UI labels, verification assertions, and Trellis rule updates. No data migration or cleanup is required.
