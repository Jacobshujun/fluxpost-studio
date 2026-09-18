# Design

Optional CanvasGraph.groups contains id/title/color/position/size, no stored membership. Decode through existing boundaries including inner graphs; preserve v1 file/clipboard compatibility. Shared ViewportPortal background uses pointer-captured header movement and corner resize. Pure helpers compute measured containment/bounds and mode transitions. Keep selected group, node selection and inspector focus separate.

Main state/ref/save/history gain groups. Inner editor gains real multi-selection, scoped commands/clipboard and local graph history. Hold history during dragging and commit once. Clipboard groups are explicit selections; cloned inner groups get fresh ids. Execution projections omit groups recursively while preserving historical no-group hashes.

Reuse owner-scoped graph API/JSON storage. Reject invalid group data. Protected inner input is immovable and enabled in bulk actions. Tests intercept APIs on isolated worker-disabled smoke.
