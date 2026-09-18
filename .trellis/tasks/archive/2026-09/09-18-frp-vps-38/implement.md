# Implementation

1. Capture read-only process/container/listener and production identity baselines; check paths and ports are unused.
2. Download and verify the official matching release. Create isolated account, TLS/configuration and service; validate FRP and systemd before enable/start.
3. Add only the two required UFW TCP rules, verify service health and preserved production services.
4. Back up local files, install the public TLS certificate, validate new client config, stop only the exact existing client and activate via the desktop launcher.
5. Verify public/local identity, existing production identity, repeat launch and FRP service restart/reconnection. Run baseline without live provider calls.
6. Record evidence and update current status; archive and commit only non-secret Trellis documents.
