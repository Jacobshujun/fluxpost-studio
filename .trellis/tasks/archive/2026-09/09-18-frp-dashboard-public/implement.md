# Implementation and recovery

Use the existing flux.lightmoment.net certificate and a new isolated /etc/nginx/sites-available/frp-dashboard definition linked into sites-enabled. Bind specifically to 38.76.210.136:6443 so it coexists with frps bound to 127.0.0.1:6443. Proxy only to that loopback dashboard with original Host, real IP and forwarded scheme; retain upstream Basic authentication. Use certificate renewal's existing Nginx reload integration. Do not change the certificate, original site, FRP config or any DNS.

Before edits, verify certificate hostname/expiry and capture existing containers, Nginx/FRP identity, firewall and configuration checksums. Validate new configuration, reload gracefully and open only TCP 6443. Test HTTPS from the local PC using normal certificate validation, valid/invalid/no credentials, static UI, API and running proxy status. Compare protected state after changes. Update local credential metadata URL without printing or changing the password.

Rollback removes only the newly-created Nginx symlink/config and newly-added UFW 6443 rule, then validates and gracefully reloads Nginx. Loopback dashboard and existing tunnel remain usable. Do not stop production containers or restart FRP.
