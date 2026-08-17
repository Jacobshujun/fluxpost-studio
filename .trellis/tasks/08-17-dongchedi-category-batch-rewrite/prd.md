# Dongchedi category batch rewrite

## Goal

Add safe static Dongchedi category discovery and serial batch auto-rewrite through durable Simple Run tasks.

## Requirements

- Add a `dongchedi_page` Simple Run source mode that accepts a Dongchedi `/news/...` category URL, a keyword/project label, and an optional target count.
- Discover only same-domain article links from the submitted category page; cap discovery and processing at 30 items, with a default target count of 30 and user-selectable values from 1 to 30.
- Process article sources serially (concurrency 1) through existing Dongchedi normalization, media caching, safety filtering, tagging, text rewrite, and image reconstruction paths.
- Persist the work in the existing durable Simple Run queue so progress, per-link outcomes, pause/termination, and completed drafts survive browser refreshes.
- Keep Feishu publishing disabled for this mode; successful items become reviewable `draft` posts.
- Reject non-whitelisted hosts, invalid redirects, login/challenge pages, oversized/slow responses, and provider rate-limit responses without fabricating source content or bypassing anti-automation controls.
- Do not persist plaintext user cookies. When a cookie is supplied, store only an AES-256-GCM envelope protected by `DONGCHEDI_COOKIE_ENCRYPTION_KEY`, redact it from responses/logs, and clear it when the task reaches a terminal state.
- Preserve partial success: one source failure must not remove already-created drafts, while a challenge/rate-limit stop prevents starting later source items.

## Acceptance Criteria

- [x] `https://www.dongchedi.com/news/industry/2` is accepted by the new input path and produces at most 30 normalized article candidates from the current page only.
- [x] Default target count is 30; values outside 1-30 are rejected or normalized before queue creation.
- [x] Serial execution is observable in the run state and deterministic checks; the next article does not start before the prior article completes or fails.
- [x] Successful articles continue through existing safety/tagging/rewrite/image paths and create independent review drafts with source URLs.
- [x] A single failed article is recorded with an error and does not roll back earlier drafts; `403`, `429`, login, anti-bot, or repeated timeout stops later work with a visible reason.
- [x] Plaintext cookies are absent from persisted run JSON, API responses, execution logs, and deterministic verification output.
- [x] Offline fixtures cover category extraction, allowlist/redirect rejection, 30-item cap, 1/10/30 counts, serial ordering, partial failure, stop conditions, and cookie redaction.
- [x] `npm run lint`, `npx --no-install tsc --noEmit`, `npm run build`, and the Trellis baseline pass without live external provider calls.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
