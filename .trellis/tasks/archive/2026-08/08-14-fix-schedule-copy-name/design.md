# Batch Schedule Copy Name Design

## Naming Contract

`duplicateCanvasSchedule()` creates one ISO timestamp and passes it to a local name helper. The helper removes only recognized trailing copy markers, formats the same timestamp in `Asia/Shanghai` as `YYYYMMDD-HHmmss`, appends one ` 副本 <timestamp>` suffix, and truncates only the base portion when needed so the final name still satisfies the existing 80-character validation through `normalizeName()`.

Recognized trailing markers are repeated `副本` tokens with optional generated timestamps. Text containing `副本` elsewhere is preserved.

## Compatibility

The route action, payload, response, schedule IDs, owner scope, V1/V2 definitions, copied batch definitions, and runtime reset behavior remain unchanged. Existing stored names are normalized only when the operator explicitly creates a new duplicate; no migration is required.

## Release And Rollback

Implement in a clean worktree based on current `origin/main`. Push a dedicated candidate branch, verify the exact remote SHA locally and through the installed VPS candidate verifier, then run read-only production preflight. Production activation uses only `/opt/fluxpost-studio/bin/deploy.sh --ref <full-sha>`. Failed activation restores the previous release; failed post-deploy checks use the manifest-aware rollback while preserving named volumes.
