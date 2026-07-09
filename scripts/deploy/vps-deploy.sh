#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/fluxpost-studio}"
REPO_URL="${REPO_URL:-https://github.com/Jacobshujun/fluxpost-studio.git}"
BRANCH="${BRANCH:-main}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-fluxpost}"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-https://bbs.vollov1.xyz/api/config}"
LOCAL_HEALTH_URL="${LOCAL_HEALTH_URL:-http://127.0.0.1:3101/api/config}"
KEEP_RELEASES="${KEEP_RELEASES:-3}"

REPO_DIR="$APP_ROOT/repo"
RELEASES_DIR="$APP_ROOT/releases"
SHARED_DIR="$APP_ROOT/shared"
BIN_DIR="$APP_ROOT/bin"
ENV_FILE="$SHARED_DIR/env.production"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
RELEASE_DIR="$RELEASES_DIR/$TIMESTAMP"

log() {
  printf '[deploy] %s\n' "$*"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    printf '[deploy] missing command: %s\n' "$1" >&2
    exit 1
  }
}

require_cmd git
require_cmd docker
require_cmd curl

mkdir -p "$APP_ROOT" "$RELEASES_DIR" "$SHARED_DIR" "$BIN_DIR"

if [ ! -f "$ENV_FILE" ]; then
  printf '[deploy] missing %s\n' "$ENV_FILE" >&2
  printf '[deploy] create it from deploy/env.production.example and keep it out of Git.\n' >&2
  exit 1
fi

if [ ! -d "$REPO_DIR/.git" ]; then
  log "cloning $REPO_URL"
  rm -rf "$REPO_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
else
  log "fetching $BRANCH"
  git -C "$REPO_DIR" fetch origin "$BRANCH"
  git -C "$REPO_DIR" checkout "$BRANCH"
  git -C "$REPO_DIR" reset --hard "origin/$BRANCH"
fi

COMMIT="$(git -C "$REPO_DIR" rev-parse --short HEAD)"
log "creating release $TIMESTAMP from $COMMIT"
mkdir -p "$RELEASE_DIR"
git -C "$REPO_DIR" archive "$BRANCH" | tar -x -C "$RELEASE_DIR"

mkdir -p "$RELEASE_DIR/deploy"
ln -sfn "$ENV_FILE" "$RELEASE_DIR/deploy/env.production"

log "building app image"
cd "$RELEASE_DIR"
COMPOSE_PROJECT_NAME="$PROJECT_NAME" docker compose build app

log "starting services"
COMPOSE_PROJECT_NAME="$PROJECT_NAME" docker compose up -d

log "waiting for local health"
for _ in $(seq 1 30); do
  if curl -fsS "$LOCAL_HEALTH_URL" >/dev/null; then
    break
  fi
  sleep 2
done
curl -fsS "$LOCAL_HEALTH_URL" >/dev/null
curl -fsS "$PUBLIC_HEALTH_URL" >/dev/null

ln -sfn "$RELEASE_DIR" "$APP_ROOT/current"

log "service status"
COMPOSE_PROJECT_NAME="$PROJECT_NAME" docker compose ps

log "pruning old releases"
find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' \
  | sort -r \
  | tail -n +"$((KEEP_RELEASES + 1))" \
  | while read -r old_release; do
      rm -rf "$RELEASES_DIR/$old_release"
    done

log "deployed $COMMIT to $RELEASE_DIR"
