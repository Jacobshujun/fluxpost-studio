#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/fluxpost-studio}"
REPO_URL="${REPO_URL:-https://github.com/Jacobshujun/fluxpost-studio.git}"
BRANCH="${BRANCH:-main}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-fluxpost}"
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

fail() {
  printf '[deploy] %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "missing command: $1"
}

read_env_value() {
  local key="$1"
  awk -v key="$key" '
    index($0, key "=") == 1 { value = substr($0, length(key) + 2) }
    END { sub(/\r$/, "", value); print value }
  ' "$ENV_FILE"
}

normalize_bool() {
  case "${1,,}" in
    true|1|yes|on) printf 'true\n' ;;
    false|0|no|off) printf 'false\n' ;;
    *) fail "FLUXPOST_PROXY_ENABLED must be true or false" ;;
  esac
}

is_valid_hostname() {
  local value="$1"
  [ "${#value}" -le 253 ] &&
    [[ "$value" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]
}

CHECK_ONLY="false"
if [ "${1:-}" = "--check" ]; then
  CHECK_ONLY="true"
  shift
fi
[ "$#" -eq 0 ] || fail "usage: $0 [--check]"

case "$APP_ROOT" in
  ""|/|/opt|/usr|/var|/home) fail "APP_ROOT must be a dedicated absolute directory" ;;
  /*) ;;
  *) fail "APP_ROOT must be an absolute path" ;;
esac

require_cmd awk

mkdir -p "$APP_ROOT" "$RELEASES_DIR" "$SHARED_DIR" "$BIN_DIR"

if [ ! -f "$ENV_FILE" ]; then
  fail "missing $ENV_FILE; create it from deploy/env.production.example and keep it out of Git"
fi

PROXY_VALUE="${FLUXPOST_PROXY_ENABLED:-$(read_env_value FLUXPOST_PROXY_ENABLED)}"
PROXY_ENABLED="$(normalize_bool "${PROXY_VALUE:-true}")"
PUBLIC_HOST="${FLUXPOST_PUBLIC_HOST:-$(read_env_value FLUXPOST_PUBLIC_HOST)}"
PUBLIC_HOST="${PUBLIC_HOST:-bbs.vollov1.xyz}"
PUBLIC_HOST="${PUBLIC_HOST,,}"
APP_PORT="${FLUXPOST_APP_PORT:-$(read_env_value FLUXPOST_APP_PORT)}"
APP_PORT="${APP_PORT:-3101}"

[[ "$APP_PORT" =~ ^[0-9]+$ ]] || fail "FLUXPOST_APP_PORT must be a number"
if [ "$APP_PORT" -lt 1024 ] || [ "$APP_PORT" -gt 65535 ]; then
  fail "FLUXPOST_APP_PORT must be between 1024 and 65535"
fi
if [ "$PROXY_ENABLED" = "true" ] && ! is_valid_hostname "$PUBLIC_HOST"; then
  fail "FLUXPOST_PUBLIC_HOST must be a DNS hostname when HTTPS proxy is enabled"
fi

LOCAL_HEALTH_URL="${LOCAL_HEALTH_URL:-http://127.0.0.1:$APP_PORT/api/config}"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-https://$PUBLIC_HOST/api/config}"

if [ "$CHECK_ONLY" = "true" ]; then
  printf 'mode=%s\n' "$([ "$PROXY_ENABLED" = "true" ] && printf https || printf private)"
  printf 'services=%s\n' "$([ "$PROXY_ENABLED" = "true" ] && printf 'postgres app proxy' || printf 'postgres app')"
  printf 'app_port=%s\n' "$APP_PORT"
  printf 'public_host=%s\n' "$PUBLIC_HOST"
  printf 'local_health_url=%s\n' "$LOCAL_HEALTH_URL"
  if [ "$PROXY_ENABLED" = "true" ]; then
    printf 'public_health_url=%s\n' "$PUBLIC_HEALTH_URL"
  fi
  exit 0
fi

require_cmd git
require_cmd docker
require_cmd curl
require_cmd tar

compose() {
  COMPOSE_PROJECT_NAME="$PROJECT_NAME" docker compose --env-file "$ENV_FILE" "$@"
}

if [ ! -d "$REPO_DIR/.git" ]; then
  log "cloning $REPO_URL"
  if [ -e "$REPO_DIR" ]; then
    fail "$REPO_DIR exists but is not a Git repository"
  fi
  git clone --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
else
  log "fetching $BRANCH"
  git -C "$REPO_DIR" fetch origin "$BRANCH"
  git -C "$REPO_DIR" checkout "$BRANCH"
  git -C "$REPO_DIR" reset --hard "origin/$BRANCH"
fi

install -m 0755 "$REPO_DIR/scripts/deploy/vps-deploy.sh" "$BIN_DIR/deploy.sh"
install -m 0755 "$REPO_DIR/scripts/deploy/vps-enable-domain.sh" "$BIN_DIR/enable-domain.sh"

COMMIT="$(git -C "$REPO_DIR" rev-parse --short HEAD)"
log "creating release $TIMESTAMP from $COMMIT"
mkdir -p "$RELEASE_DIR"
git -C "$REPO_DIR" archive "$BRANCH" | tar -x -C "$RELEASE_DIR"

mkdir -p "$RELEASE_DIR/deploy"
ln -sfn "$ENV_FILE" "$RELEASE_DIR/deploy/env.production"

log "building app image"
cd "$RELEASE_DIR"
compose build app

if [ "$PROXY_ENABLED" = "true" ]; then
  log "starting app, PostgreSQL, and HTTPS proxy for $PUBLIC_HOST"
  compose up -d
else
  log "starting private app and PostgreSQL only"
  PROXY_CONTAINER_ID="$(compose ps -q proxy)"
  if [ -n "$PROXY_CONTAINER_ID" ]; then
    compose stop proxy
  fi
  compose up -d postgres app
fi

log "waiting for local health at $LOCAL_HEALTH_URL"
for _ in $(seq 1 45); do
  if curl -fsS "$LOCAL_HEALTH_URL" >/dev/null; then
    break
  fi
  sleep 2
done
curl -fsS "$LOCAL_HEALTH_URL" >/dev/null

if [ "$PROXY_ENABLED" = "true" ]; then
  log "checking public health at $PUBLIC_HEALTH_URL"
  curl -fsS "$PUBLIC_HEALTH_URL" >/dev/null
fi

ln -sfn "$RELEASE_DIR" "$APP_ROOT/current"

log "service status"
compose ps

log "pruning old releases"
find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' \
  | sort -r \
  | tail -n +"$((KEEP_RELEASES + 1))" \
  | while read -r old_release; do
      rm -rf "$RELEASES_DIR/$old_release"
    done

log "deployed $COMMIT to $RELEASE_DIR"
if [ "$PROXY_ENABLED" = "false" ]; then
  log "private access: ssh -L $APP_PORT:127.0.0.1:$APP_PORT <user>@<vps>"
fi
