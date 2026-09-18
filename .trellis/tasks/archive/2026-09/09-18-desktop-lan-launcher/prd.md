# Desktop LAN launcher and icon

## Request
Create a Windows desktop entry for the existing local FluxPost application, reachable on the LAN, with a coordinated custom icon.

## Acceptance
- Desktop shortcut opens the current healthy LAN candidate or invokes the existing npm run local:lan entry when needed.
- Preserve the primary-worktree and clean-tree startup guards.
- Store machine-specific launcher and multi-size icon under LOCALAPPDATA/FluxPostStudio.
- Show current LAN URLs and explicit startup errors; prevent concurrent launch attempts.
- Verify shortcut properties, icon sizes, local/LAN HTTP identity and the documented offline baseline.
- Other-device reachability requires operator confirmation.
