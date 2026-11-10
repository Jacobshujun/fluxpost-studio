# Canvas Switch Any

Confirmed 2026-11-10. Contract for `utility.switch-any@1`.

- Registry declares `value0` through `value600` (the current whole-graph edge budget plus a spare), each single-connection `any`, and one optional `text` input `index`. Visible values end one slot after the highest connected value, bounded by the graph budget. Middle holes remain; trailing empty slots collapse. IDs never renumber. The UI, graph decoder/validator and clipboard share the registry definitions.
- `config.index` defaults to numeric zero. Manual controls support unfinished string drafts. The strict shared parser accepts trimmed decimal digits representing an integer from zero through the graph edge budget; empty, signs, decimals, exponent notation and nonfinite numbers fail. Connected index overrides the saved manual draft, disables the controls and restores that draft on disconnect. No new numeric artifact/node exists.
- `outputs.value` is a deep clone of exactly one selected artifact, retaining all media/batch/provider metadata. Missing selection or index results fail explicitly. `collectInputs` preserves an empty `index` entry for a connected source with no output so it cannot silently use the manual setting.
- All upstream dependencies retain normal Canvas scheduling. Bypass performs the same selection without merging; disabled emits no output. Isolated runs keep existing fingerprint/edge-identity reuse rules.
- `any` is a port declaration, never an artifact kind. Its output can connect to concrete or visual inputs. Actual artifact kinds are checked before downstream execute/reuse/bypass and at the executor entrypoint; a mismatch blocks before model/publish calls. Concrete-to-concrete and visual compatibility rules remain unchanged.
- Iteration internals accept Switch Any. An any output can be selected as the region's text/images output; existing aggregation validates the actual result against that selected type.
- No API route or database migration. Config, edges, node modes and results use existing persistence/portable-workflow contracts. The old prompt switch is unchanged.

Verification: `node .trellis/verification/canvas_switch_any_check.mjs` (baseline), and `python .trellis/verification/canvas_switch_any_browser_check.py` against a worker-disabled loopback `BROWSER_BASE_URL` other than 3001. Browser tests intercept API/media traffic, cover three themes at 1440/390, real value/index drag, >20 slots, index restore, undo/redo, quick-add and saved round trips. Screenshots/logs belong in ignored `test-artifacts/canvas-switch-any/`.
