# Design

Install the matching upstream Linux amd64 release on 38.76.210.136 under /usr/local/lib/frp/0.71.0. Use a dedicated unprivileged frp account, root-owned restricted /etc/frp configuration, pinned TLS and independent authentication token. A separate frps.service provides startup/recovery and journald logs. Permit only remote proxy port 8008 and control port 5443 in FRP/UFW. Existing Nginx and application deployment are untouched.

Use a single TCP proxy forwarding public port 8008 to this computer's 127.0.0.1:3001. This gives a usable IP-based URL without changing old DNS. Public browser transport remains HTTP, matching the current entry; FRP client/server transport is TLS with certificate verification. No KCP, dashboard or unused virtual-host ports are needed.

Back up the existing local client config and launcher outside Git. Verify the new client configuration before replacing the active client. Update only the launcher's public URL. On failed connection, restore local config/launcher and start the prior client. Do not remove the old VPS service. Server rollback stops/disables only the new frps service and removes its two exact added UFW rules.
