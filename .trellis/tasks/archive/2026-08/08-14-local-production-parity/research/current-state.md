# Current State Evidence

- Production evidence in `origin/main` records release `20260814-085108-39a35f8dd869` at full SHA `39a35f8dd869d50df9008ba708e14b92eeefc761`.
- Remote `main` is `dd9728290ace6ab24d2ff886674707b56b01ee7b`; application code after the production SHA is unchanged.
- Before this task, the historical root had 21 modified tracked files and 26 untracked files. It now has the same 21 tracked changes plus 32 untracked files because six parity-task metadata files were added; no historical application artifact was modified, removed, staged, or committed.
- The former port-3001 process started from the historical root. Its save-images endpoint returned 404 while production returned the expected unauthenticated 401.
- The production deploy wrapper already writes and validates `release.manifest`, but Compose does not expose the commit to the app runtime.
- The pre-candidate `scripts/local/restart.ps1` derived its working directory from the dirty root and started port 3001 without release identity.
