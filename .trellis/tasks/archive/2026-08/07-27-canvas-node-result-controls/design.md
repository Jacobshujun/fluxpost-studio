# Canvas Node Result And Execution Controls Design

## Contracts

- Add `utility.image-preview`, `CanvasNodeExecutionMode`, `CanvasRunMode`, successful terminal statuses for reused/bypassed/disabled work, and reuse provenance on `CanvasNodeRun`.
- Node definitions may declare one explicit bypass mapping `{ inputPort, outputPort }`. Validation never infers mappings from coincidental matching kinds.
- Run plans expose per-node actions and blockers so confirmation and execution consume the same decision.

## Planning And Execution

- `with-upstream` keeps the current target-plus-ancestors closure. It also appends directly connected preview sinks for included image producers so successful image output is captured without running other descendants.
- `isolated` accepts exactly one target. It executes the target and literal input ancestors, resolves preview nodes from their durable capture, and reuses every other ancestor from the latest compatible successful node run.
- Persist a deterministic input fingerprint on completed attempts. Compatibility covers node id/type/version/config plus resolved inputs. Preview compatibility uses node identity/version and its current incoming edge identity so it intentionally retains the last capture until replaced.
- Preflight produces actions: execute, reuse, bypass, disabled, or blocked. Missing required input blocks that node; optional missing input is omitted. Only execute actions contribute confirmation capabilities.
- Bypass copies the mapped input artifacts to the mapped output and records `bypassed`. Disabled nodes record `disabled` with no outputs. Reuse copies outputs with source provenance and records `reused`.

## Persistence And API

- Continue storing graph/run/node-run JSON in the existing canvas tables. No binary media or new state table is introduced.
- Add a database query joining canvas runs and node runs by workflow to retrieve the newest output-bearing successful attempt for each node without the recent-run limit.
- `POST /api/canvas/runs` accepts `runMode`; omission means `with-upstream`. Isolated mode validates one target before enqueue.
- Existing run history responses keep their shape and populate latest-success projections through the durable query.

## UI

- Add a Utility palette group and a compact image-preview node gallery using the existing image viewer.
- Add a node-header mode menu and inspector control. Unsupported bypass is disabled with an accessible explanation.
- Keep `运行到此节点` for current behavior and add `仅运行此节点` for isolated behavior.
- Render reused/bypassed/disabled states and provenance in nodes/run dock. Composition output shows title/media counts and an `打开评审` link.

## Compatibility And Safety

- Normalize missing execution mode to enabled when editable graphs load; immutable historical snapshots remain readable.
- Clipboard parsing validates and preserves the optional mode.
- External providers are never called by deterministic checks. Isolated preflight fails closed instead of rerunning a non-target paid or side-effecting node.
