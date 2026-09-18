# Desktop FRP launcher verification

Date: 2026-09-18

- Installed desktop shortcut `FluxPost 公网启动.lnk` pointing to `%LOCALAPPDATA%/FluxPostStudio/Launch-FluxPost-Public.ps1`, with existing FluxPost icon and primary-worktree working directory. Read back shortcut properties and validated PowerShell syntax.
- Confirmed the operator-renamed `feishu.exe` reports FRP 0.71.0. Existing FRP configuration passed the client's verify command; neither config nor credentials were copied into the launcher or repository.
- Actual launcher execution with `-NoBrowser -NoPause` started the existing client hidden and reused the versioned port-3001 candidate.
- Public `/api/version` matched the local candidate full SHA; public root returned HTTP 200 using a direct request. HTTPS is not configured by this task.
- Repeated launcher execution preserved the same single FRP client PID and the existing application listener PID.
- Missing local app delegates to the installed LAN launcher without bypassing its clean-tree candidate startup guard. Cold app restart was not exercised because the candidate was already healthy.
- Browser opening remains the default interactive behavior; verification suppressed browser opening and the final keypress.
- All executables, credentials and runtime logs remain local; no remote configuration, DNS, application code, account data or provider/publishing operations changed.
- Full project baseline passed: deterministic checks, lint, TypeScript, build, isolated HTTP smoke and SQLite. Log is ignored `test-artifacts/desktop-frp-launcher-baseline.log`.
