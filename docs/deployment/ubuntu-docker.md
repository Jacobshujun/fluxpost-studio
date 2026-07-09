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
- `/opt/fluxpost-studio/shared/env.production`: the only production env file.
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

## Secrets

Never commit secrets. Keep real values only in:

```text
/opt/fluxpost-studio/shared/env.production
```

The GitHub repository may contain `deploy/env.production.example`, but not `deploy/env.production`, `.env.local`, generated media, runtime data, or database files.

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
