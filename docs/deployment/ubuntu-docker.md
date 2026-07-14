# Ubuntu Docker Deployment

FluxPost Studio production runs on the VPS from GitHub source. Windows does not need Docker.

## Daily Update Flow

Develop and verify on Windows, then push:

```powershell
npx --no-install tsc --noEmit
npm run lint
npm run build
git status --short
git add .
git commit -m "chore: update fluxpost"
git push origin main
```

Deploy on the VPS:

```bash
ssh root@104.243.21.233 -p 29891
/opt/fluxpost-studio/bin/deploy.sh
```

## Server Layout

- `/opt/fluxpost-studio/repo`: GitHub clone of `main`.
- `/opt/fluxpost-studio/releases/<timestamp>`: clean source release from `git archive`.
- `/opt/fluxpost-studio/current`: symlink to the active release.
- `/opt/fluxpost-studio/shared/env.production`: the operator-managed base environment file.
- `/opt/fluxpost-studio/bin/deploy.sh`: one-command deploy wrapper.

Do not edit application source in `current`. Change code locally, push to GitHub, then deploy.

## Runtime Services

Compose project name is fixed to `fluxpost`.

```bash
cd /opt/fluxpost-studio/current
COMPOSE_PROJECT_NAME=fluxpost docker compose ps
COMPOSE_PROJECT_NAME=fluxpost docker compose logs -f app
```

The app binds `127.0.0.1:3101`, Caddy exposes `https://bbs.vollov1.xyz`, and PostgreSQL has no public host port.

Advanced configuration saved by an admin is stored separately in the Docker named volume `fluxpost_fluxpost-config`. The app loads those persisted overrides after the base values from `shared/env.production`, so UI changes survive app-container replacement and take precedence over matching base values. Clearing a value in the UI also persists across restarts.

## Secrets

Never commit secrets. Keep operator-managed base values only in:

```text
/opt/fluxpost-studio/shared/env.production
```

The GitHub repository may contain `deploy/env.production.example`, but not `deploy/env.production`, `.env.local`, generated media, runtime data, or database files.

Do not remove the `fluxpost_fluxpost-config` volume during routine deploys or cleanup; it can contain admin-managed secrets. Values previously saved only inside a replaced app container cannot be recovered automatically and must be entered again once after this fix is deployed.

## Rollback

Deploy keeps the latest 3 releases. To roll back manually:

```bash
cd /opt/fluxpost-studio/releases
ls -1
ln -sfn /opt/fluxpost-studio/releases/<previous-release> /opt/fluxpost-studio/current
cd /opt/fluxpost-studio/current
COMPOSE_PROJECT_NAME=fluxpost docker compose up -d
```

Do not run `docker compose down -v`; it removes data volumes.
