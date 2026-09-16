# Design

Keep protocol selection in toapis-image-api.ts. Match only the two documented Official model names before legacy dimension validation. Canvas/simple already calculate pixel size from their explicit ratio/tier selection; Official sends that requested pixel size without resolution. Direct exact-pixel Official requests retain their size and existing output-size verification. Ordinary model bodies remain unchanged.

Use the existing background type and validator. Add Canvas select fields and pass their values through both executors. Add background to the per-image fingerprint only when non-default, keeping legacy accepted tasks resumable. Reject transparent JPEG during Canvas preflight and provider request construction.

No database migration or configuration edits. Verification uses isolated fixtures, mocked requests, and the existing smoke environment. Port 3001 is unchanged until a verified commit is activated.
