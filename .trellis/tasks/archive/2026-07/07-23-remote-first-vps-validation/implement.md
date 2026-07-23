# Implementation Plan

1. Add the cross-platform Node baseline and reduce the PowerShell entry point to a compatibility wrapper.
2. Add the Docker `verification` target and the root-only candidate verification script with check mode, clean archives, manifests, cleanup, and versioned installation.
3. Extend deterministic VPS deployment verification for command signatures, isolation, invalid refs, and forbidden service/runtime mutations.
4. Update package commands, AGENTS/operator docs, and Trellis specs with the complete remote-first contract.
5. Commit and push the candidate branch without running local application, build, test, or browser validation.
6. On 104, record protected-service state, run full candidate verification, deploy the resolved SHA, and verify staging health, HTTPS, isolation, and protected-service identity.
7. Fast-forward `main` without changing the verified SHA, deploy that SHA to production 38, and verify manifest/image/release identity, application/PostgreSQL, HTTPS/Nginx, volumes, and Open WebUI.
8. Record durable verification evidence, commit/push documentation-only evidence if needed, and do not redeploy when evidence changes do not alter the already promoted application SHA.

## Rollback Points

- Stop before remote verification if GitHub, production, or staging SHA identity is ambiguous.
- Verification failure leaves both servers untouched and blocks promotion.
- Staging deployment failure restores its previous release; do not proceed to production.
- Production health failure relies on automatic restoration. Business verification failure uses `deploy.sh --rollback <release-id>` without deleting volumes.
