# Investigate missing Canvas batch schedule history

## Scope

Diagnose the operator-reported empty workflow batch history using read-only local database evidence and the committed application's list path. Preserve runtime records; this task is analysis only.

## Acceptance

- Establish whether matching schedule rows still exist.
- Identify the list behavior responsible for the empty result, with source references.
- Evaluate an existing alternative history entry and explain the required repair.
- Run the documented deterministic baseline and record its result.

## Boundaries

No runtime mutation, provider calls, credential/session extraction, application restart, or application code changes. Persist only aggregate diagnostics and code findings; no runtime payloads or account identifiers.
