# Canvas selection, groups and shortcuts

## Goal

Implement the user-approved plan on both main and iteration canvases (2026-09-18).

## Requirements

- Shift-click additive/toggle selection and multi-drag; retain Alt marquee and pane panning.
- Ctrl/Cmd+G creates a spatial group; Ctrl/Cmd+B toggles bypass/enabled; Ctrl/Cmd+M toggles disabled/enabled per selected node.
- Colored named resizable frames, fully contained node membership, header drag, dissolve without deleting members. Protected inner input remains fixed/enabled. Unsupported bypass reports a notice.
- Commands act only on the active canvas outside text fields and covering dialogs.
- Groups survive save/load, workflow duplicate, export/import and inner graphs. Group copy includes members/internal edges; partial-node copy has no frame; pasted ids are fresh.
- Undo/redo includes group/mode commands, once per gesture, and inner history stays local. Group metadata is excluded from execution fingerprints.

## Acceptance Criteria

- [x] Deterministic and intercepted browser checks cover both canvases, selection, spatial groups, modes, clipboard, persistence, undo, modal/input guards, three themes and mobile.
- [x] Full offline baseline passes.
- [x] Commit clean primary worktree, activate port 3001 and verify version/page without external calls.

## Notes

- Default blue frame named 分组; single-node groups allowed. Flat spatial groups may overlap. No folding or execution subworkflows. Mobile retains current restrictions. No remote deployment.
