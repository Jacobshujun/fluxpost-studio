# Design

## Configuration Contract

`src/lib/config.ts` owns three new fields: `FEISHU_APP_ID` (text), `FEISHU_APP_SECRET` (secret), and `FEISHU_BRAND` (select: `feishu|lark`). They use the existing persistent advanced-config file and secret masking behavior.

## CLI Initialization

The Feishu CLI boundary owns identity readiness. Before normal CLI args run, it performs an idempotent `lark-cli config init --app-id <id> --app-secret-stdin --brand <brand>` with the secret written to stdin. It does this once per application process and credential fingerprint, which repairs missing/mismatched state and also handles a rotated secret that cannot be compared through the masked `config show` output. Initialization failures are sanitized and stop the requested operation.

An in-process promise/fingerprint prevents concurrent duplicate initialization and avoids repeated checks after success. The fingerprint includes a one-way hash of App ID, Secret, and brand so a saved credential change re-runs initialization without storing or logging plaintext.

## Failure Behavior

- Missing App ID/Secret -> explicit `FEISHU_APP_ID or FEISHU_APP_SECRET is not configured` error.
- Initialization or doctor/config failure -> sanitized CLI error; do not run the requested Base/IM command.
- A credential fingerprint already initialized in the current process -> continue directly.

## Persistence And Security

Advanced credentials remain in `fluxpost-config`; lark-cli state remains in `fluxpost-node-home`. Secret input is stdin-only, advanced API responses are masked, and activity logs retain existing token redaction.
