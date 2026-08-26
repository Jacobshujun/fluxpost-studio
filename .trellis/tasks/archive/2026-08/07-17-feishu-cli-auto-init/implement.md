# Implementation Checklist

1. Add a failing deterministic verification for advanced fields, secret masking, stdin-only CLI init, missing-config failure, matching-config skip, mismatch/change reinit, and persistent volume contracts.
2. Run the focused check and confirm it fails before implementation.
3. Add normalized App ID/Secret/brand values and advanced field definitions in `src/lib/config.ts`.
4. Add testable identity readiness helpers at the Feishu CLI boundary without changing existing publish command shapes.
5. Ensure all Feishu CLI entry paths pass through readiness and preserve redaction/Windows invocation behavior.
6. Run focused checks, lint, type-check, build, and the full Trellis baseline.
7. Push the verified implementation, deploy to `82.158.226.10`, fill credentials through Advanced Configuration, and verify `doctor` plus a read-only Base operation before retrying publication.

## Execution Status

- Completed: implementation and deterministic verification; commit `81ef2d0` pushed to GitHub `main` and deployed to `82.158.226.10`.
- Completed: post-deploy app/PostgreSQL health, loopback and HTTPS `/api/config`, loopback-only port 3101, Nginx, Open WebUI identity/health, existing systemd services, release commit, and persistent volume checks.
- Pending user action: save `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, and `FEISHU_BRAND` in Advanced Configuration. The App Secret must not be transferred through chat or Trellis files.
- Pending after save: invoke a read-only Feishu path, then verify `lark-cli doctor --offline` and `lark-cli doctor` inside `fluxpost-app` before retrying publication.

## Rollback

Revert the code release while retaining both named volumes. The previous manual lark-cli config remains compatible; no schema or destructive volume migration is introduced.
