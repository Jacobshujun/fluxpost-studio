# Auto-initialize Feishu CLI identity

## Goal

Allow an administrator to configure the Feishu application identity in Advanced Configuration so a fresh or replaced VPS container can initialize `lark-cli` automatically before Feishu operations.

## Requirements

- Add allow-listed advanced fields for `FEISHU_APP_ID`, secret `FEISHU_APP_SECRET`, and `FEISHU_BRAND` (`feishu` default, `lark` optional).
- Keep App Secret masked in all advanced-config reads and error/log output.
- Before a Feishu CLI operation, verify the configured CLI identity and initialize or update it when missing or different.
- Pass App Secret only through subprocess stdin via `--app-secret-stdin`; never include it in argv.
- Cache successful initialization per credential fingerprint while allowing a saved credential change to trigger reinitialization.
- Keep CLI state in the existing `/home/node` named volume and advanced values in the existing `/app/config` volume.
- When App ID or Secret is missing, return an explicit configuration error without invoking a real Feishu write.
- Default tests must mock CLI execution and must not call live Feishu services.

## Acceptance Criteria

- [x] Advanced Configuration can save App ID, App Secret, and brand; secret reads expose only configured state.
- [x] Missing identity fields prevent Feishu CLI execution with a clear error.
- [x] Missing/mismatched CLI config is initialized using stdin and bot identity.
- [x] Matching CLI config does not reinitialize on every CLI call.
- [x] A credential change invalidates the in-process initialization cache.
- [x] Existing Base publish, import, distribution, notification, Windows CLI resolution, and redaction behavior remains compatible.
- [x] Focused regression checks and the full Trellis baseline pass without live Feishu writes.

## User Journey

As a FluxPost administrator, I enter Feishu application credentials once in Advanced Configuration so that publishing works after installation or container replacement without manual `docker exec lark-cli config init` commands.

## Out Of Scope

- Creating a Feishu application or changing its scopes/Base permissions.
- Migrating existing plaintext secrets between VPS hosts.
- User OAuth identity; publishing continues to use bot identity.
