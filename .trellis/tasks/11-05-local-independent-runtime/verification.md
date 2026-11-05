# Independent runtime verification — 2026-11-05

## Implementation

- Native Windows launch: no console, explicit breakaway when inside a Job,
  suspended creation and no-Job verification before execution. Inherit only
  NUL/stderr handles, preserve environment/cwd and quote argv directly.
- A harmless independent-process probe runs before the existing listener is
  stopped. Denied breakaway fails explicitly; no dependent-start fallback.
- Candidate and rollback use the same helper. Standard clean-tree, slot,
  identity, health and smoke gates are retained.
- Managed local Next heap ceiling is 24 GiB, explicitly requested by user;
  builds/remote runtime are unaffected and no 24-GiB allocation is performed.

## Tests

- Windows fixture invokes the actual candidate launcher with stubbed HTTP/
  smoke and a real diagnostic supervisor plus harmless child. Closing an
  owned kill-on-close Job kills the fixture launcher but leaves the child and
  supervisor alive; after releasing the child, exit=0 and completion output
  are persisted with the correct SHA and slot.
- A restrictive Job rejects preflight; no fallback. Independent parent with
  no Job also passes preflight. Empty/spaced/Unicode/embedded-quote/trailing-
  backslash/shell-metacharacter arguments, inherited environment, cwd and
  stderr pass; temporary probe log is removed.
- Existing log/report retention, uncaught/native report privacy, exit-134,
  runtime I/O failure and launcher-shell exit tests remain. A real V8 heap
  statistics probe confirms >=24 GiB allowance without allocating it.
- Runtime parity contract check passes, including the preflight-before-stop
  ordering and candidate/rollback identity gates.
- Full baseline passes: deterministic checks, 0 lint errors / 16 existing
  warnings, TypeScript, production build, isolated 45678 HTTP smoke and
  SQLite. PowerShell parser and `git diff --check` pass. Focused output is ignored at
  `test-artifacts/local-independent-focused.log`; baseline output at
  `test-artifacts/local-independent-baseline-20261105.log`.

## Prevention review

Root categories: implicit assumption and test-coverage gap. A hidden window
and survival of an immediate shell exit were mistaken for independence from
the editor's containing Job. Existing logging cannot record a child exit if
the supervisor is killed at the same time. Explicit verified breakaway
prevents this termination path; a real Job-closure regression now covers it.
The November 5 historical attribution remains qualified in the investigation
record: this proves/fixes the mechanism, not an unrecorded original exit time.
Both activation and rollback were checked for the same lifetime dependency.

The initial full run caught the context-size gate; the lightweight status
was condensed without changing its limits. A later run caught normal
PowerShell module-initialization progress in the no-Job fixture's stderr;
the fixture now suppresses progress only, preserving errors and exit checks.

## Activation

Pending verified commit and managed LAN startup. No real provider task was
submitted by tests, no database/user data was changed, and no remote deploy
was performed.
