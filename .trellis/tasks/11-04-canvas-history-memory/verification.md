# Canvas memory repair verification — 2026-11-04

## Changes
- Managed local Next child: `--max-old-space-size=8192`; independently checked
  actual V8 heap allowance without allocating 8 GiB. Other runtimes unchanged.
- History: SQL latest eligible ID per node, JSON fetched only for winners.
- Reuse: one needed node at a time, 32-row keyset pages, stop at first compatible
  result; preserve older results, authorization and existing fingerprint rules.
- No history deletion, schema migration, paid calls or remote deployment.

## Passed checks
- `canvas_history_memory_check.mjs` under `--max-old-space-size=256`: real
  SQLite and opt-in disposable loopback PostgreSQL, 180,000 historical rows,
  25 results/query under 1 MiB; ~57/48 MiB JS heap respectively. Two history
  selections took ~2.8 seconds total in each fixture. SQL result counts are
  asserted before application-side filtering.
- Ownership/admin/unowned access, workflow isolation, missing snapshot nodes,
  iteration exclusions, successful statuses, empty outputs, updated-time versus
  created-time ordering, keyset ties, old compatible result across three pages,
  early stop and real fingerprint/version/downstream-stale checks pass.
- Existing Canvas workflow checks and local diagnostics (real child flags,
  native reports, Windows detached launcher, retention and failure paths) pass.
- Full documented baseline passed: deterministic checks, lint (0 errors / 16
  existing warnings), TypeScript, build, built config synchronization, isolated
  45678 HTTP smoke and SQLite. Initial run caught a test-variable lint error;
  renamed it and reran the full baseline successfully.
- `git diff --check` passes.

Local logs (ignored): `test-artifacts/canvas-history-memory-sqlite.log`,
`canvas-history-memory-postgres.log`, `canvas-history-baseline.log`,
`canvas-history-live-readonly.log`.

## Read-only real-data comparison

Using the existing read-only diagnostic DB role, explicit READ ONLY transaction,
25-second query timeout and a separate 256-MiB Node process, the largest real
workflow returns:

| Selection | Rows | JSON bytes | Time | Process JS heap |
| --- | ---: | ---: | ---: | ---: |
| Latest attempts | 25 | 448,542 | 4074 ms | ~11 MiB |
| Latest successful outputs | 25 | 446,790 | 5821 ms | ~11 MiB |

Previous first-query SQL aggregates represented 171,092 rows / 3,743,329,776
JSON text bytes. Byte encodings differ slightly between SQL text and Node JSON
serialization; the reduction is approximately 8300x, not an exact heap ratio.
No old multi-GiB query was executed, and no authenticated API/provider task was
replayed. Database scan latency still grows with history.

## Incident/preflight

Before activation all six checked queue domains had zero live running leases
and zero recently queued jobs; no recent nonterminal simple runs were found.
Old PID 4680 subsequently was found exited at 11:18:56 Asia/Shanghai, exit 134.
Retained report `report.20261104.111855.4680.0.001.json` confirms another OOM:
4,288,938,496 heap bytes used, limit 4,496,293,888. This was still unmodified
`52d761b`, before activating this repair. Exact fatal request remains unknown.

## Local activation

Pending managed LAN activation from the verified clean commit. Preserve the
ignored candidate receipt and native diagnostic receipt as runtime identity
evidence, then verify 3001 binding, SHA, effective startup flag and HTTP health.

## Prevention review

Root-cause categories: implicit assumption that history stays small, plus a
scale-test coverage gap. Latest UI projections were bounded only after the
database driver parsed the entire join. Reuse shared that unbounded reader.
SQL winner selection and bounded traversal remove both allocation paths;
the baseline now contains a realistic large-history regression. Stable
contract: `.trellis/spec/fluxpost/canvas_history.md`. Raising heap alone would
only postpone the same growth problem. This fix does not prove that every
past OOM had this exact trigger or that unrelated OOM paths cannot exist.
