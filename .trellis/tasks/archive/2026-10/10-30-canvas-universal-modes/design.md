# Universal Canvas Modes Design

## Boundaries And Data Flow

Existing `CanvasNode.executionMode` and immutable graph snapshots remain the only stored mode. UI commands update the same field, serialization validates the enum/graph structure, planning propagates available outputs, and workers execute the frozen step action. No migration/API shape change.

## Routing Contract

Add one registry routing helper shared by required-input analysis, planning and runtime. Existing explicit mappings are authoritative. Ordered GPT v2 reference ports and Wonder direct/numbered references retain their current ordering, limits and merge functions. Without an explicit mapping, each declared output (only selected outputs for an iteration region) must find exactly one compatible *available input port*. Multiple edges to that port still use existing homogeneous artifact merging. Multiple candidate ports are ambiguous and block, rather than selecting by edge order/config/label. Runtime verifies actual artifact kinds, never fabricates values or drops incompatible records. An outputless sink returns an empty output record without executing its side effect.

Persistence accepts unexecutable choices. Graph structure and enabled-node config remain validated as before. Execution planning emits a descriptive blocker for missing/ambiguous inferred routes and advertises only routed outputs for bypass. Required downstream inputs must see available upstream outputs; optional absence and independent branches retain existing behavior. Isolated planning and runtime use the same routing contract and save blocked receipts on missing/invalid artifacts.

## Iteration And Schedulers

Remove the root-mode prohibition, not its identity/config/position/deletion constraints. Selected disabled iteration outputs are execution errors, not invalid drafts. Inner planners must observe disabled roots before adding billable capabilities; runtime already applies disabled/bypass steps before the injected-root executor. Expose a common inner-state inspector selector and all node menus.

V2 source-video/content-pool/video parameter adapters only bind data and preserve the selected mode. Existing enabled literal snapshots that represent completed shared/aggregate results and V1 finalization are kept: these are internal materialization, not re-execution of an operator-disabled node.

## Compatibility And Rollout

No auto-routing for ambiguous ports, implicit provider execution, defaults, retries or error swallowing. Existing explicit bypass graphs and ordered media tests must pass unchanged in behavior. Whole-canvas layout and prior viewport/status repairs remain untouched. Offline tests precede an authorized clean-tree `npm run local:lan`; the launcher retains rollback-safe slots. No live providers, production data or remote release.
