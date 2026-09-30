# Implementation and verification

1. Extend shared config validation, registry, metadata type and server filesystem saver; wire executor and retry metadata preservation as required.
2. Render folder/status/count/error feedback in existing Canvas result components.
3. Add isolated real-filesystem and executor tests and workflow/batch round-trip assertions; add intercepted browser test for desktop/mobile across themes.
4. Run focused checks and existing full baseline. Use worker-disabled isolated smoke server for browser checks. Record any unchanged failures without modifying user data.
5. Update concise Trellis feature/status/contracts and task verification, finish/archive task, commit, then activate via npm run local (or LAN variant to preserve current binding). No remote push/deploy.
