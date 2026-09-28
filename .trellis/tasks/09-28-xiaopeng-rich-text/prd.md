# Xiaopeng rich-text source collection

## Request
Fix the confirmed missing body and inline images in Xiaopeng BBS one-click collection.

## Acceptance
- Resolve React Flight referenced text with complete UTF-8 content and correct escapes.
- Extract rich-text body, mentions, and inline images in source order; merge unique attachment images.
- Preserve existing plain-text imports and reject unresolved/truncated/malformed rich text explicitly.
- Add deterministic regressions and run documented baseline plus remaining checks if the known unrelated lint blocker persists.
- Verify the reported public page read-only; do not call models or rewrite runtime records during verification.

## Scope
Source normalizer, existing verification script, and Trellis evidence. Candidate activation requires verified committed code; existing saved drafts require a subsequent rerun.
