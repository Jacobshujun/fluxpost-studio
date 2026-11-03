# Investigate two local service exits on 2026-11-03

## Scope

Read-only investigation of the two afternoon local service failures reported by
the user. Preserve evidence and distinguish observed exit facts from hypotheses.
Do not restart the active candidate, change application/configuration, replay
provider calls, or mutate runtime data.

## Acceptance

- Identify retained start/exit evidence and the active process/version.
- Check Windows crash/resource events and local database activity without
  exposing credentials or user content.
- State the limits of the diagnosis and the next evidence needed.
- Record results and run the repository baseline.
