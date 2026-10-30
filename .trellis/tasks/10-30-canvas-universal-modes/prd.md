# Allow execution modes on every Canvas node

## Goal

Allow operators to choose enabled, disabled or bypass on every Canvas node, with explicit execution errors when the chosen mode cannot provide required data.

## Requirements

- Menus, inspectors, group/keyboard mode commands and iteration roots expose all three modes. Iteration roots remain fixed and non-deletable, but mode changes are allowed.
- Disabled nodes do not execute and produce no outputs. Missing required downstream data is reported as blocked/error; optional inputs and independent branches retain their existing semantics.
- Bypass never executes the node's own function. Preserve existing explicit registry mappings and ordered GPT/Wonder references. Otherwise forward only when each output has exactly one connected compatible input port; ambiguous, missing or incompatible data must produce a node/port-specific error, not a guessed mapping or an execution fallback.
- Outputless passive sinks can bypass as no-ops without publishing, saving or displaying a result. Source nodes can select bypass, but execution reports that no upstream value can be forwarded.
- All choices persist, duplicate/export/import and undo/redo, including currently unexecutable drafts. Structural graph/ownership/security checks remain unchanged.
- Iteration validation/runtime and V2 parameter bindings honor selected modes; parameter injection must not silently re-enable inputs. Internal materialization of already-produced shared/aggregate results is not a fresh execution and keeps its existing enabled literal snapshots.
- Scope is execution-mode behavior only. No unrelated model, media, layout, database schema, production or provider acceptance changes.
- User approved planning/implementation plus automatic commits and LAN activation on 2026-10-30; no remote push/deployment or paid calls.

## Acceptance Criteria

- [x] Every registered node/version and fixed iteration root accepts both flags in editing/persistence; UI and shortcuts do not skip nodes.
- [x] Deterministic checks cover single-port pass-through, multiple matching-port rejection, sources, outputless sinks, typed data, numbered references, disabled required dependencies, explicit mapping regressions and non-mutation.
- [x] Ordinary/isolated/iteration planning and runtime do not invoke disabled/bypassed executors, providers or external writes; errors identify node/port and survive status reporting.
- [x] Iteration root/output draft choices save; unavailable selected outputs block execution. V2 input parameter adapters preserve execution modes.
- [x] Mocked browser checks cover menus/inspectors/shortcuts/save/reload/undo and iteration roots in three themes at desktop/mobile dimensions; existing viewport/status regressions pass.
- [x] Run focused checks, baseline, source lint, types, build and isolated HTTP checks; report unchanged blockers without weakening gates.
- [x] Commit verified code, archive evidence, activate final clean HEAD on LAN 3001 and verify exact identity, binding and HTTP smoke.

