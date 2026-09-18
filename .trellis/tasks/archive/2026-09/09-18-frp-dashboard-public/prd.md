# FRP public HTTPS dashboard

## Goal
Make the existing FRP management dashboard directly accessible from the internet, without a local SSH tunnel.

## Acceptance criteria
- Public HTTPS address https://flux.lightmoment.net:6443/ uses the existing valid hostname certificate.
- Existing FRP dashboard account remains required; no secret is copied into repository or printed.
- Keep the dashboard backend on 127.0.0.1:6443 and expose a dedicated Nginx listener on the VPS public IPv4 at port 6443.
- Add only the required TCP firewall rule; preserve existing production site, containers, FRP connections and SSH tunnel compatibility.
- Validate Nginx configuration before graceful reload, certificate verification, unauthenticated rejection, authenticated UI/API, proxy inventory, and unchanged service identities.
- Save local rollback state and non-secret Trellis evidence; run baseline and commit documentation.
