# Aggregate retry and authorized operator recovery — November 16

## Confirmed cause

The 16:57:58 V2 batch has ten groups. Group 4's child image results completed, but its aggregate run's GPT image node failed with HTTP 400 invalid_prompt. Composition still produced a three-image post from other successful branches. Therefore the run/group/batch were partial. Previous UI retry conditions inspected child/shared failures only, so no retry button appeared for this aggregate-only failure. The prior iteration diagnostic task explicitly excluded aggregate runs; this repair closes that gap.

## Implemented

- Terminal aggregate reconciliation derives safe retryability and the failed node label independently of child states. Both batch-create and Canvas runtime views show a group-stage retry control; bulk retry includes it.
- `retry-main` records a revision-fenced pending intent. Admission revalidates terminal run, exact schedule/main/aggregate context, owner, unpublished post and a graph plan without external writes. It preserves run/post/child identity and calls the existing failure-node/descendant retry engine. Duplicate pending, active, mismatched, published and publishing cases are rejected.
- Existing composition reuses the prior post artifact; successful inputs and child tasks are not regenerated. No model prompt, success policy or provider routing was edited.

## Authorized runtime repair

The user explicitly requested repairing the named failed task. Only group 4 was targeted through the native schedule/domain recovery functions, with the stored owner account; no browser session or credentials were created.

One unchanged-input generation retry (image attempt 2) returned a PNG, but the helper inherited the tool host's `NODE_TLS_REJECT_UNAUTHORIZED=0`. OSS correctly rejected upload; bytes were retained in its pending-media directory. This was an operator-helper environment mistake, not a change to app storage configuration. The managed app launcher already removes that variable.

Recovery removed the inherited variable, backed up the retained file and affected runtime records under ignored `data/repair-backups/2026-11-16-aggregate-retry/`, verified PNG dimensions 1536×2048, uploaded that exact file through `persistRuntimeMedia`, read it back and compared SHA-256. Only then was the generated output recorded through standard node persistence; native retry resumed composition only. There was no additional generation request for storage recovery.

Final read-only verification: all ten groups and batch are completed; group 4 keeps its original post ID, title/body and three preexisting images in order, with the recovered image at position 1 (four images total). The other nine groups are byte-identical to their prior schedule records. Image history has attempts 1 and 2 only; attempt 2 has the verified recovered output. The post remains unpublished; no Feishu operation occurred. Actual operator content, URLs, credentials, image files and raw records remain ignored local data.

## Verification

- Focused scheduler, iteration diagnostics and TypeScript pass.
- Scheduler fixtures cover aggregate-only failure with completed children, independent failed-node label/retryability, durable retry intent before dispatch, original run/post/children preservation, bulk inclusion and duplicate/running/wrong-context/published/external-write rejection.
- Full baseline passes with exit code 0: isolated contracts/runtime fixtures, lint (0 errors / 15 existing warnings), TypeScript, production build and HTTP smoke. Context budgets remain within 45/70 KB. Build emits existing filesystem-tracing warnings.
- Browser runner exits 0. New `batch_aggregate_retry_browser_check.py` passes 12 scoped/bulk scenarios across three themes at desktop/mobile, exercising both result views with completed children and checking exact request scope, pending feedback and preserved draft/children. The runner additionally passes six 50-group iteration scenarios and six guided-create scenarios plus lossless input roundtrip. All browser API/media requests are intercepted on worker-disabled 45678; no paid calls are part of verification.
- Trellis-check review covered storage/service/API/UI propagation, immutable identities, preserved child output, no unrelated refactoring, failure-only native retry, unpublished/external-write guards and explicit operation feedback. `git diff --check` passes. Stable contract updated in `batch_iteration.md`.

Local activation requires a verified clean commit and a fresh active-work check. Remote production and GitHub push are not part of this task.
