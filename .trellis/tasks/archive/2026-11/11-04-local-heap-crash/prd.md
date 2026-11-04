# November 4 local crash investigation

## Request
Investigate today's local application crashes, identify confirmed causes and
separate those from hypotheses about the allocating application path.

## Scope
Read retained supervisor logs/native reports, current port-3001 identity and
process metrics, relevant source, and safe read-only local database summaries.
Keep runtime reports and user data local; persist only sanitized findings.
No live provider calls, task replay, service replacement, heap-limit change,
or business-data mutation is needed for this investigation.

## Acceptance
- Correlate crash times, process IDs, version and fatal messages.
- Explain memory evidence and limits of attribution to individual code paths.
- Record current health and actionable next steps.
- Run the documented offline baseline and record its actual result.
