# Image Ordering Design

## Ownership

- `src/app/review/page.tsx`: gallery, prompts, preview, async gates.
- `src/lib/types.ts`, `src/lib/review-contract.ts`: optional ordinary
  `imagePrompts: string[]`, patch registry and changed fields.
- `src/app/api/review/route.ts`: prompt field validation/allowlist.
- `src/lib/original-batches.ts`: cover lookup and regeneration reference guards.
- Small review-local helpers/components and focused/browser tests if needed.

## Ordinary Slot Model

Ordinary moves apply one explicit source-index permutation to URLs, prompts and
preview position. URL equality is never used as identity, so repeated URLs retain
distinct prompts/preview positions. All conflicting media operations are disabled
while a request is pending, so no additional persistent slot-ID field is needed.
This replaces the initially proposed draft-local ID registry with a smaller,
deterministically tested transform. Series cards continue to use stable IDs.
Missing legacy prompt arrays initialize using existing resolver precedence on
first relevant edit. Explicit empty prompts stay empty.

Validate string elements and length against final URLs at the save boundary;
never silently pad malformed new arrays. Test older callers updating URLs without
new prompts: do not retain demonstrably misaligned prompt data. Keep source
image tasks unchanged and avoid mandatory data backfill.

## Series Model

Full cards are authoritative, not a filtered URL list. Resolve operations by card
ID, move whole card records, update indices using the existing index base, and
derive nonempty image URLs in card order. Show movable missing-card placeholders.

Confirmed policy: every card participates in the same insertion sequence,
including missing-image cards. Remove the dragged card and insert it at the
target position; intervening cards shift normally. Do not pin empty cards,
reserve their former positions, or merge against a fixed-slot sequence. Missing
cards retain identity/data and can themselves move anywhere. Prompt/candidate/QA
edits use card IDs, not filtered image indices. If an image is later added to a
missing card, it appears at that card's current position, not its original index.

Find cover by `role === "cover"`; compare stable ID to determine whether target
requires its reference. Replace BOTH first-element and `card.index > 0` assumptions
in regeneration validation/provider inputs. Keep initial generation unchanged
unless an actual reordered-card path requires a directly related fix. Preserve
roles and embedded image text.

## Drag And Async Safety

Use one insertion helper for drag/up/down. Keep temporary drag projection; only
valid drop commits local order. Escape/cancel preserves initial order. Identify
internal drag payload separately from files. Edge autoscroll targets the actual
scroll container and cleans up animation frames/listeners on all exit paths.

Derive a shared disabled condition for save/approve/upload/replace/generation.
Capture post/slot/card identity on async start and refuse stale application;
disabled buttons alone are insufficient. No retries, swallowing or polling.
