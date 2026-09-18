# FRP relay on VPS 38

## Goal
Deploy upstream FRP to the operator-specified VPS and connect the existing local FluxPost desktop launcher through it.

## Acceptance criteria
- FRP 0.71.0 comes from the official GitHub release with verified SHA-256.
- A dedicated systemd service starts automatically and exposes only control TCP 5443 and application TCP 8008; dashboard and other proxy ports remain disabled.
- Existing production HTTP/HTTPS, SSH, containers and application release identity remain unchanged.
- Local client uses a fresh deployment-specific token and pinned encrypted FRP transport; secrets stay outside Git and transcripts.
- Desktop public launcher opens the new IP-based entry, preserves duplicate-launch checks and has local rollback copies.
- Public version equals the local candidate; existing production version remains unchanged. Verify systemd restart and repeat desktop launch.
- Run the project baseline and retain non-secret deployment evidence in Trellis.
