# Canvas Manual List Newlines

## Problem

Scalar list inputs parse, trim and remove blank lines on every keystroke, then
replace the textarea with the normalized list. Enter at the end disappears.

## Scope

Preserve the scalar textarea's raw editing draft independently of its parsed
schedule values. Keep existing parsing and preview/save behavior. Reset the
draft when parameter identity, type, mode or externally supplied values change.

## Acceptance

- End, start and middle Enter, consecutive blank lines, spaces and Chinese text survive editing.
- Preview receives normalized nonempty list entries without extra blank tasks.
- Fixed/manual mode switches show the correct values.
- Mocked desktop/mobile browser checks and full offline baseline pass.

## Verification

Extend the existing content-collection browser fixture, which already edits a
manual scalar parameter and verifies saved values during preflight. Run against
the worker-disabled smoke build. Do not launch real schedules or providers.
