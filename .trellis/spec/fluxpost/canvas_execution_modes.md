# Universal Canvas Execution Modes

## 1. Scope / Trigger

Applies to all registered Canvas node versions, ordinary/isolated runs, batch-generated graphs and iteration roots. Trigger: changing mode controls, persistence, bypass routing, planning, execution or parameter injection.

## 2. Signatures

- `CanvasNode.executionMode?: "enabled" | "disabled" | "bypass"`; omission remains enabled.
- `getCanvasBypassRouting(node, availablePortIds) -> { routes: { inputPorts: string[]; outputPort: string }[]; error?: string }` in `registry.ts` is the shared route decision.
- `getCanvasRequiredInputPorts` retains enabled config-sensitive requirements and legacy numbered-reference alternatives; bypass requirements use the same routes.
- `buildCanvasRunPlan`, isolated `resolveCanvasRunPlan` and worker `resolveBypassOutputs` must agree on modes. No API/DB schema or workflow/clipboard version change.

## 3. Contracts

- Every node exposes all three choices in menus, inspectors and bulk shortcuts. Selecting a mode is not a promise that the graph can execute; persistence accepts the draft. No greyed-out bypass or protected-root mode exception.
- Disabled nodes neither execute nor reuse outputs. Required downstream absence blocks that branch; optional absence and independent branches retain existing semantics. Isolated disabled targets fail before enqueue.
- Explicit registry mappings remain authoritative, including ordered GPT/Wonder references and Wonder's fixed references. Never infer another route when an explicit input is missing.
- Otherwise, each declared output must match exactly one *available input port* accepting that output kind. Multiple edges to that one port merge homogeneous text/images/videos/audios in order. Ambiguous ports, missing candidates, mixed artifact kinds and incompatible actual output kinds block with a node/port error. Do not choose by edge order, node labels or config, run the node, invent defaults or discard opaque multi-values.
- Only selected iteration region outputs are routed. Outputless sinks bypass as no-ops with `{}` outputs and no external writes/downloads. Source bypass with no upstream data is a blocker, not execution of its literal/config value.
- Runtime saves bypassed or blocked receipts; routing/data-validation errors do not silently become enabled execution. Preview/status behavior is unchanged.
- Fixed iteration roots remain non-movable, non-deletable, with empty config and no incoming edges. Mode-only inspector patches are allowed; root identity/config/position patches remain forbidden. Disabled selected outputs may save but are execution errors. Injection cannot overwrite disabled/bypass steps with root outputs.
- V2 data-only source-video/content-pool/video adapters preserve mode. Enabled literal snapshots for already-completed shared/aggregate outputs and V1 finalization remain materialization, not fresh node execution.

## 4. Validation / Error Matrix

| Case | Result |
| --- | --- |
| Source bypass without upstream | Save succeeds; planning blocks with node/output identity |
| One compatible concat input | Pass through unchanged, without concatenation/cleanup/provider work |
| Two compatible concat input ports | Ambiguous route error, even if both carry the same value |
| Disabled source feeding a required input | Dependent is blocked; unrelated runnable branches remain allowed |
| Wrong/mixed actual artifacts | Blocked receipt; no cross-kind output or silent dropping |
| Outputless save/display node bypass | Bypassed receipt, empty outputs, no filesystem/publish operation |
| Disabled/bypassed iteration root | Draft persists; unavailable selected/required outputs stop execution before billable work |
| Invalid node/version/edge/cycle/ownership | Existing structural/security rejection remains |

## 5. Good / Base / Bad Cases

- Good: one upstream text at concat `text_a` bypasses unchanged into `text`; two connected text inputs cause an explicit ambiguity error.
- Base: existing Gemini/GPT explicit text routes and GPT/Wonder numbered image ordering retain their original behavior and media limits.
- Bad: silently enabling a bound input, substituting source config when bypass lacks upstream data, or advertising outputs not produced by its route.

## 6. Required Tests

Baseline `canvas_workflows_check.mjs` exercises all registry definitions, draft/export round trips, bulk commands, inferred/explicit routes, typed merging/non-mutation, ordinary/isolated plans, worker receipts and root patch boundaries. Iteration contract checks cover root/selected-output persistence versus execution. Scheduler checks cover all three data-only adapters. Existing Gemini/image/Wonder and iteration runtime checks retain explicit behavior.

`canvas_execution_modes_browser_check.py` and `canvas_groups_browser_check.py` cover menu/inspector controls, root modes, keyboard/undo, group operations, persistence/reload and visible planning errors in three themes at 1440/390. Use intercepted APIs and a worker-disabled loopback `BROWSER_BASE_URL`, never 3001. Provider/production acceptance is not part of these tests.

## 7. Wrong / Correct

Wrong: hide unsupported actions, reset to enabled when injecting parameters, or call the executor when bypass cannot resolve.

Correct: save the chosen mode, resolve through the shared routing helper, and block with explicit node/port diagnostics if forwarding is impossible. Preserve structural root protections independently of execution modes.
