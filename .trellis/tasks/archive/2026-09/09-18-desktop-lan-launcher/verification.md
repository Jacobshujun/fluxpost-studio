# Desktop LAN launcher verification

Date: 2026-09-18

- Installed desktop shortcut `FluxPost 局域网版.lnk` with PowerShell target, primary-worktree working directory, and custom ICO reference. Read back Windows Shell shortcut properties successfully.
- Local installation: `%LOCALAPPDATA%/FluxPostStudio/Launch-FluxPost.ps1`, SVG source, PNG preview, multi-resolution ICO, and Lucide license. Machine-specific assets stay outside Git.
- Icon: dark navy rounded tile, teal Lucide Send symbol and three connected LAN dots; preview visually inspected.
- Launcher execution with `-NoBrowser -NoPause` succeeded, preserved the running LAN candidate and displayed current adapter addresses. UTF-8 BOM preserves Chinese output in Windows PowerShell.
- The startup branch delegates to the existing `npm run local:lan` without bypassing primary-worktree or clean-tree guards. A cold restart was not needed or exercised; existing application remained running.
- Loopback and LAN-IP `/api/version` both returned candidate mode, versioned=true and commit `2f2344a3fc1cdac5b114b918f428474af14ff62f`.
- Existing Windows firewall rule permits inbound TCP 3001 from LocalSubnet on all profiles. No firewall edits were needed.
- Documented full baseline passed: lint, TypeScript, build, deterministic checks, isolated HTTP smoke on 45678 and SQLite. Local log: `test-artifacts/desktop-launcher-baseline.log` (ignored).
- Other-device reachability remains pending confirmation; tested LAN-IP access originated on this computer.
- No remote release or provider/publishing acceptance performed.
