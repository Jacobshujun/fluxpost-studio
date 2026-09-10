# Iteration editor interaction repair

- Refresh React Flow handle geometry when region output identities change, including text-only to image-only without a size change.
- Inner Delete/Backspace must never delete the selected outer region or its edges; retain the fixed iteration entry and editable-field behavior.
- Scope: src/app/canvas/page.tsx and existing iteration browser/contract verification. No scheduler/provider behavior changes, user data edits, commit, activation or push.
- Verify real pointer connections, keyboard deletion of connected inner nodes, protected entry and text editing, save/reload, desktop/mobile, then the full isolated offline baseline.
