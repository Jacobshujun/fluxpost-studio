# Desktop FRP launcher

## Goal
Create a desktop one-click launcher for the existing local FluxPost candidate and the operator-renamed FRP client, using the existing FRP configuration.

## Acceptance criteria
- Desktop shortcut uses the installed FluxPost icon and a local PowerShell launcher; contains no credentials.
- Reuse a healthy versioned port-3001 application and the exact existing FRP process/configuration; no duplicate processes on repeated launches.
- When the application is absent, delegate to its existing desktop launcher and preserve the clean-tree startup guard.
- Launch the existing client hidden, verify the public version matches the local candidate, and open the public address only after success.
- Report missing files, failed startup and unreachable public entry clearly; preserve diagnostic logs locally.
- Validate configuration, PowerShell syntax, shortcut properties, actual startup and repeated launch; run the documented project baseline.
- Do not change FRP configuration, server routing, DNS, application code or account data.
