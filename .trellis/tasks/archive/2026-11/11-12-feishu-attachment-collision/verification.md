# Verification — 2026-11-12

- Read-only Feishu search confirmed the user's number has eight attachment tokens, all named `asset.png`. Both existing local matching items had one image/downloaded image, with no manual image-edit marker. No user text or raw tokens are recorded here.
- `feishu_attachment_import_check.mjs` runs the real importer with mocked CLI/object storage and a real isolated filesystem. Eight identical names retain eight distinct contents/URLs in source order; repeated imports are stable; removed/empty attachments do not resurrect legacy files; another record with the same number is isolated; download/missing-file failures are explicit. Included in baseline.
- Feishu import, Canvas collection and content-pool Feishu regressions, TypeScript and full `.trellis/verification/check.ps1` with port 45678 pass. Baseline reaches `Baseline verification passed.` including lint, build, built-config synchronization, HTTP smoke and isolated SQLite.
- Live repair used the fixed shared importer once successfully, downloaded all eight images and verified public HEAD lengths against Feishu sizes in order: 592370, 1097870, 436846, 542235, 423402, 389053, 302735, 394903 bytes.
- First live attempt was rejected by the OSS adapter because the helper inherited `NODE_TLS_REJECT_UNAUTHORIZED=0`; no content rows changed. Removed that variable for the successful helper; TLS verification remained enabled.
- Full project snapshots were saved locally before mutation under ignored `data/feishu-attachment-repair-20261112/`. A transaction locked and rechecked the two matching entries, confirmed unchanged old image arrays and no manual image edits, then changed only `images`, `downloadedImages`, and image members of `mediaUrls`. All text/tags/ownership/other fields were asserted unchanged. Commit completed atomically.
- Post-read confirms two entries, each with eight images, eight downloaded images and eight distinct URLs. Membership rows and other content were untouched; originals/stale files were retained.
- No active Canvas/simple/image/Feishu queue leases before activation. Local activation follows clean archived HEAD via `npm run local:lan`; ignored activation log/receipt and `/api/version` are runtime evidence. No Feishu writes, generation or remote deployment.

## Root cause and prevention

Category E (implicit filename uniqueness) plus D (coverage gap): previous tests mocked already-normalized media and did not run CLI download plus enumeration with repeated names. The shared importer predated the new entry points; reusing it propagated its overwrite behavior. Record/token directories make collisions structurally impossible; per-token enumeration excludes stale files, and byte/order assertions cover the real boundary. Contract recorded in `pitfalls.md`.
