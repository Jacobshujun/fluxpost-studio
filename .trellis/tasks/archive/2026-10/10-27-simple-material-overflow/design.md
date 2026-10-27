# Design

## Boundaries

The library is a browsing resource, not implicit model context. Ordinary tasks
must submit no generic library selection from the current UI, which has no
explicit generic picker. Keep the API's explicit asset resolution/ownership
contract for intentional callers; never replace selections by first-N slicing.
Viral selected IDs remain a separate channel with existing limits and pairing.

## Data flow

- src/app/page.tsx: remove automatic all-library task IDs and misleading input
  counts. Stop loading assets when the named root is absent; show a clear
  explanation rather than silently querying the entire library.
- src/lib/openai.ts and src/lib/original-creation.ts: exclude material inventories
  from text prompts. Preserve source text, instructions, selected image-task
  descriptions and returned draft metadata. This also protects old snapshots
  without changing stored inputs or requiring a database migration.
- Trace src/app/api/simple/runs/route.ts and src/lib/simple-runs.ts to verify
  normal, original, viral and resume paths. Change these only when needed to
  enforce the specified contract; do not break explicit external API selections.

## Regression protection

Use isolated provider stubs capturing actual outgoing prompts. Compare empty,
small and 24,197-URL inputs for rewriting and original mode; assert no URL marker
leaks, invariant prompt size and unchanged user/source text. Preserve selected
image references and draft metadata separately. Include old snapshot-shaped
inputs, API authorization and missing-root browser checks. Baseline source
assertions must enforce no automatic selection instead of the former behavior.

## Limits and rollout

Do not invent a universal token count from a provider's character-length error.
This repair removes the unbounded, unintended data channel rather than truncating
user content. General model-specific request budgets are outside this repair.
No live retries, paid calls or task-state writes. Verify before a separate commit
and clean-candidate LAN activation; keep current candidate untouched meanwhile.
