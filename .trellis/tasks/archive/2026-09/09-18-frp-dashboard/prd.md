# FRP dashboard access

## Goal
Provide the operator with a working FRP management address and login credentials for the newly deployed relay.

## Acceptance criteria
- Enable password-protected frps dashboard on VPS loopback 127.0.0.1:6443 only; no new public firewall rule.
- Provide a local SSH tunnel on 127.0.0.1:16443 and the management URL.
- Generate independent dashboard credentials in a restricted local file; never commit or print passwords.
- Validate configuration before activation; authenticated dashboard works and unauthenticated requests are rejected.
- Existing public relay and production identity remain healthy; run project baseline.

## Delivery constraint
Automatic approval review rejected desktop dashboard launcher creation with only `blocked by policy`. No desktop launcher or credential shortcut was installed. The requested address/login are delivered through the active SSH tunnel and a direct local link to the existing protected credentials file.
