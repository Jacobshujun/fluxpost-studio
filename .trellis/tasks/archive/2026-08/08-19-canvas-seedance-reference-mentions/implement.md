# Seedance reference mentions implementation

## 1. Shared contract

- [x] Add a browser/server-safe Seedance reference helper for marker parsing, config binding normalization, static upstream discovery, canonical image ordering, Prompt serialization, and validation.
- [x] Keep the contract within flat `CanvasNodeConfig` strings/string arrays and preserve `model.seedance@1` compatibility.
- [x] Add focused deterministic unit coverage for good, base, and invalid/deleted/reordered cases.

## 2. Node and execution behavior

- [x] Add new-node defaults for local Prompt, direct references, and mention binding arrays; make the Prompt port conditionally optional with explicit graph/runtime validation.
- [x] Resolve local-versus-upstream Prompt, direct/static/dynamic image ordering, and structured mentions before the first Ark submission.
- [x] Persist final Prompt and named ordered images as resolved node-run inputs.
- [x] Preserve resolved inputs and perform GET-only recovery for an existing Ark task ID.
- [x] Extend mocked Ark request assertions for “图片N” serialization and exact content order.

## 3. TOS-backed direct upload

- [x] Add a `seedance-reference` Canvas media upload mode.
- [x] Reject before file persistence unless TOS is enabled and fully configured.
- [x] Enforce Seedance-compatible image formats/limits and require the persisted result to be a public HTTP(S) URL.
- [x] Preserve existing upload modes and add offline route/source contract coverage.

## 4. Inspector experience

- [x] Compute deterministic fixed Seedance references from direct config and connected static input/library nodes.
- [x] Add the node-local Prompt composer with `@` menu, thumbnail choices, structured mention chips, invalid-chip state, keyboard selection, paste/plain-text handling, and stable serialization.
- [x] Add direct upload, preview, reorder, and remove controls with the combined nine-image limit.
- [x] Keep the upstream Prompt port and surface source conflicts before run.
- [x] Verify desktop/mobile layout and interaction without horizontal overflow.

## 5. Quality and closeout

- [x] Run Canvas workflow/media checks, TypeScript, lint, build, and the complete offline baseline from `.trellis/spec/fluxpost/verification.md`.
- [x] Update stable Canvas architecture/spec facts and lightweight status only when evidence is complete.
- [x] Review diffs for secrets/runtime data, run `git diff --check`, commit through Phase 3.4, archive the task, record the journal, and restart the clean port-3001 candidate.

## Rollback Points

- After step 1: helper/tests can be removed without persisted data changes.
- After step 2: old graphs remain readable; reverting executor/default changes restores upstream-only behavior.
- After step 3: the new upload mode is isolated and can be removed without affecting existing media modes.
- After step 4: config remains flat and optional, so removing the dedicated UI does not require data migration.
