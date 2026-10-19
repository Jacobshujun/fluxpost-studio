# Implementation

1. Add atomic run/attempt/queue cancellation and persistence fencing, with SQLite and PostgreSQL contract coverage.
2. Add abortable resource acquisition and image execution termination; verify cancelled waiters, native worker timeout/abort and existing image behavior.
3. Wire run controllers, cancellation and schedule guards; verify cancellation races, preserved successes and no downstream/publish replay.
4. Run focused checks, full baseline (known runtime-import lint blocker reported separately), source lint, TypeScript, build and isolated HTTP/SQLite checks as needed.
5. Record evidence, commit, recover affected local incident safely and activate the committed candidate through npm run local:lan. Verify identity, cancellation and queue progress without submitting test provider jobs.

Rollback: retain the previous candidate slot and local scoped backup of touched runtime records. Do not restore cancelled tasks into execution automatically.
