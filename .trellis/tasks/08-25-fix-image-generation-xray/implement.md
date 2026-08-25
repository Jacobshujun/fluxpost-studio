# Implementation Plan

- [x] Add direct Undici dependency, explicit image proxy configuration, proxy dispatcher, typed network error, and free transport-health service.
- [x] Route every shared image fetch through the image dispatcher while preserving provider and ToAPIs task contracts.
- [x] Extend Canvas execution/queue state so image-network outages requeue after 30 seconds with a visible wait reason instead of producing partial failure.
- [x] Add the admin health API, startup diagnostic, configuration UI status, duplicate-origin validation, and credential-safe messages.
- [x] Add deterministic proxy/health/Canvas recovery tests and include them in the baseline.
- [x] Replace duplicate v2rayN scheduled tasks with one valid restartable logon task; start it and verify port 10808 plus a credential-free provider handshake.
- [x] Run focused checks, TypeScript, lint, build, full baseline, diff/secret review, update Trellis status/spec facts, and commit the complete fix before activating port 3001.
