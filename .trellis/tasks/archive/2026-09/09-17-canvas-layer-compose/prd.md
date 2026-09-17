# Canvas layer composition

Implement the approved independent utility.layer-compose node: exact output canvas,
24 editable solid/image/video layers (4 videos), non-destructive crop, proportional
scale, order/visibility/lock/opacity, dialog drafts and undo/redo. Inputs compose into
one PNG or MP4; video starts together, longest/custom duration, hold/loop/hide endings,
one selected audio source. Preserve existing nodes and workflow contracts.

Acceptance: real local pixel/video/audio tests; binding and serialization tests;
1440/390 browser editing; full offline baseline; commit and activate port 3001.
No remote release. See design.md and implement.md for execution details.
