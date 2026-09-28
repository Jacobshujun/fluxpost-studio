# Verification

- Added regressions failed on the old parser before the implementation change.
- `node .trellis/verification/xiaopeng_bbs_import_check.mjs`: passed plain text, valid JSON script escaping, split chunks, Chinese/emoji UTF-8 record lengths, adjacent records, inline JSON rich text, topic mentions, paragraphs, image order/deduplication, seven-image incident shape, and missing/truncated/malformed input failures.
- `node .trellis/verification/link_import_check.mjs` and `node .trellis/verification/simple_link_run_check.mjs`: passed.
- Read-only public-page verification with media-cache/network dependencies stubbed reproduced the repaired result: 334 body characters, two paragraphs, seven unique images. No user content or media is retained in Trellis.
- Documented baseline ran all domain contracts successfully and stopped at unchanged lint failures: 17 no-require-imports errors in six ignored local data scripts. This is not a full baseline pass.
- `npm run lint -- --ignore-pattern 'data/**'`: zero errors, 17 existing warnings. No lint configuration or local data scripts were changed.
- `npx --no-install tsc --noEmit`, `npm run build`, `node .trellis/verification/advanced_config_build_check.mjs`, and `node .trellis/verification/db_check.mjs`: passed.
- Worker-disabled loopback smoke on port 45678 passed using `.trellis/verification/http_smoke.js`; the isolated server was stopped after verification.
- Pre-activation database inspection found no unexpired running queue leases. Old queue status rows exist, but their timestamps/leases do not indicate active work. Existing port 3001 binding is LAN (`0.0.0.0`). Candidate delivery uses the clean-HEAD `npm run local:lan` wrapper and full-SHA `/api/version` verification.
- Existing saved source/draft rows are not automatically repaired; a fresh import/generation is required. No paid model call, Feishu write, runtime-row edit, or remote deployment was performed by these checks.
