# Qwen Image Verification

Date: 2026-10-26. Scope: local implementation, not activation/deployment or live provider acceptance.

## Implemented

- Independent `model.qwen-image`, fixed `qwen-image-3.0-pro`, native DashScope synchronous endpoint.
- Local prompt appended after upstream text. Zero references selects T2I; 1-3 ordered references select I2I. Repeated images preserve their positions.
- Image inputs: public/local/runtime-directory/data images, up to 10MiB, 1-8000px dimensions and <=10:1 aspect. JPEG/PNG/WebP/GIF/TIFF are metadata-validated; BMP is header-validated and passed unchanged because Sharp does not decode BMP.
- Native count 1-6, optional `width*height` size with documented area/aspect constraints, prompt extension checkbox. No GPT parameter conversion, multipart/mask, async polling or automatic paid retry.
- Result PNGs are downloaded without Bearer auth, checked, and persisted through the existing runtime storage helper. Exact requested sizes are checked without resizing. Signed provider URLs are not persisted as final output.
- Node and inspector provide endpoint/password controls. Keys are AES-256-GCM encrypted in namespaced `app_meta` records; encryption key is generated atomically in `data/canvas-secrets/qwen-master.key`. Database stores its fingerprint to reject missing/mismatched key files. Back up this runtime file with the database; never commit it.
- On Windows the key file inherits runtime-directory ACLs; operators must restrict local account access. Encryption protects graph/DB exports, not a compromised application host.
- Credential identity is workflow owner/workflow/node/iteration-region. Graph/export/clipboard/run JSON never carries plaintext/ciphertext. Imports/copies require their own keys. Current and frozen endpoints must match; key rotation is read at execution time.
- PostgreSQL/SQLite use existing metadata read/write/CAS adapters. No schema migration or Advanced Configuration changes.

## Passing Evidence

- `node .trellis/verification/qwen_image_contract_check.mjs`: native body, T2I/I2I ordering, false extension, URL allowlist, sizes/counts, malformed/empty/provider responses.
- `node .trellis/verification/qwen_image_runtime_check.mjs`: real AES-GCM and Sharp with isolated mocked database/network/storage; concurrent initialization, lost-key detection, replacement/removal, owner/endpoint/iteration access, registered executor, native request/auth, limits, cancellation, no auth on download and safe errors/storage failures.
- `node .trellis/verification/qwen_image_persistence_check.mjs`: real isolated SQLite metadata/workflow/run storage, encrypted-key use, duplicate/import/export/clipboard secrecy, iteration graph and V2 collection schedule expansion. No real user data writes.
- Existing Canvas workflow, image-model and copy-library regression checks pass. Executor provider imports are lazy to avoid initializing provider dependencies in literal-only consumers and isolated checks.
- Changed TS/TSX and new JS tests lint with zero errors; four existing Canvas page warnings remain. `npx --no-install tsc --noEmit` passes.
- `npm run build` passes with existing broad-file-tracing warnings.
- `python .trellis/verification/qwen_image_browser_check.py`: three themes x 1440/390, intercepted APIs, palette/ports/prompt/save/reload/key replacement state/clear and overflow; no external requests. Screenshots in ignored `test-artifacts/canvas-qwen-*.png`.
- Final CSS refinement rerun passes all six cases; inspected the 390px screenshot to confirm visible input borders, wrapped buttons and status text.
- Isolated worker-disabled port 45678 HTTP smoke, built config API/worker synchronization and documented SQLite check pass. Port 3001 was not changed.

## Baseline And Limits

- Full `check.ps1` second run passes every preceding deterministic check, including Qwen, then stops at the pre-existing 17 lint errors in ignored `data/feishu-copy-import/**/*.cjs` scripts. Do not weaken the lint gate or edit user runtime scripts to conceal this.
- Remaining baseline stages (types/build/built config/HTTP/SQLite) were run separately and pass. Baseline is not reported as green.
- No real Qwen provider calls, paid acceptance, production writes, git commit/push or candidate activation. Actual provider quality, regional account permissions and dedicated multi-user PostgreSQL/real V2 executions remain operator gates.
- This worktree already contains OSS migration changes; preserve them. No sibling worktree, clean-guard bypass or port-3001 replacement.

## Follow-Up

The verified task changes are committed as `0b775c7694d681e6c3bbb20b5c30a8c7d5c766c4`, separately from unrelated OSS work. A clean-worktree local activation and exact-SHA production release are separate steps. Enter the real workspace endpoint and key in the node after activation, then intentionally run one T2I and one I2I for paid acceptance.
