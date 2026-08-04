# Configurable content safety policy implementation

1. Add failing deterministic verification for policy normalization, local rule ordering/match modes, model thresholds/failures, permissions, persistence contracts, snapshots, and UI wiring.
2. Add public policy types and the database-backed policy domain with defaults, validation, evaluation, save/reset, and optimistic revision handling.
3. Refactor source safety to accept an explicit policy and score model output without hidden content rules.
4. Add authenticated policy API routes and audit summaries.
5. Freeze and pass policy snapshots through simple runs, crawl jobs, and link imports.
6. Add the `/config` Content Safety editor and mocked desktop/mobile browser coverage.
7. Run focused checks, TypeScript, lint, complete baseline, production build/restart, and HTTP smoke; update stable Trellis facts only where warranted.

## Rollback Points

- Keep the policy domain isolated from advanced `.env.local` configuration.
- Do not modify existing Canvas behavior or revert unrelated dirty files.
- Do not run live providers during automated verification.
