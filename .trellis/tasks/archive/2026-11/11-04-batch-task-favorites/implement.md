# Execution

1. Add contracts, database schema/query/favorite operations and isolated fixtures.
2. Thin summary/favorite routes with access validation, retain legacy API.
3. Shared favorite controls and paged lists; favorite-first page and original center entry; copy/delete guards.
4. Focused checks then full baseline at TRELLIS_SMOKE_PORT=45678; isolated browser checks.
5. trellis-check review, record evidence and ready_for_review feature/status. Preserve existing diagnostics changes. No 3001 activation.

Rollback: unused additive table may remain, revert new UI/query mode/routes without changing task definitions/workers.

Implementation/checks complete; see verification.md. User approved commit and LAN activation on 2026-11-05. Commit feature, archive, then npm run local:lan and verify identity/health.
