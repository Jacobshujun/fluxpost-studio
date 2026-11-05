# Investigate Nov 4 afternoon local service exit

## Request

Investigate the local application crash reported on 2026-11-04. Distinguish
this afternoon's incident from the already recorded morning OOM failures.

## Scope and constraints

- Inspect existing bounded diagnostics, Windows events, launcher code and
  local FRP connection errors without changing runtime data or configuration.
- Preserve confirmed timestamps in Asia/Shanghai and separate evidence from
  hypotheses. Do not claim an exact cause without an exit/report/audit record.
- Do not restart the recovered listener, replay jobs, call paid providers or
  change application code as part of this investigation.

## Acceptance

- [x] Establish service interruption and subsequent recovery from local evidence.
- [x] Check fatal reports, supervisor/child state and relevant Windows events.
- [x] State the supported failure mechanism and remaining attribution limits.
- [x] Run the documented isolated baseline and local HTTP/identity checks.
- [x] Record safe derived findings and update the lightweight status entry.
