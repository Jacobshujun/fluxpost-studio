# Design

## Data flow

`POST /api/simple/runs` -> validate `sourceMode: dongchedi_page` -> persist encrypted request cookie (if supplied) in the Simple Run snapshot -> durable queue worker -> fetch/parse one category page -> select up to `targetCount` article URLs -> resolve one article at a time -> existing media cache, safety, tagging, and production pipeline -> persist draft posts and per-link results.

The category page is fetched once per run. It is not paginated automatically. Article URLs must be same-domain Dongchedi article IDs. Existing direct-link and keyword modes retain their current behavior.

## Security boundaries

- Static Node HTTP parsing only; no browser automation, JavaScript execution, CAPTCHA solving, proxy rotation, or fingerprint spoofing.
- Host and redirect allowlists are checked for every request. Request body size, timeout, redirect count, and task count are bounded.
- `403`/`429`/login/challenge responses are explicit stop signals. Retry only bounded transient transport failures and honor `Retry-After` when present.
- Cookie encryption uses AES-256-GCM with a 32-byte `DONGCHEDI_COOKIE_ENCRYPTION_KEY`. The plaintext is available only inside the worker request scope and is cleared from the persisted snapshot before terminal completion.

## Contracts

- `SimpleRunInput.sourceMode` gains `dongchedi_page`; `pageUrl` is required for that mode and `targetCount` is clamped to 1-30 with default 30.
- `SimpleRun` continues to expose `linkResults`, stages, errors, and posts. Any cookie envelope is server-only and redacted before API serialization.
- Category discovery returns normalized article URLs and optional card metadata; article resolution reuses `fetchDongchediItemBySource` after the request helper is hardened.
- The run is `partial` when at least one item succeeds and later work stops or fails; it is `failed` when no usable source succeeds.
