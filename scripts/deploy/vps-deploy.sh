#!/usr/bin/env bash
set -euo pipefail

DEPLOY_SCRIPT_VERSION="3"
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
REQUESTED_REF="${DEPLOY_REF:-$BRANCH}"
CHECK_ONLY="false"
ROLLBACK_RELEASE=""

log() {
  printf '[deploy] %s\n' "$*"
}

fail() {
  printf '[deploy] %s\n' "$*" >&2
  exit 1
}

usage() {
  printf 'usage: %s [--check] [--ref <branch|tag|commit>] [--rollback <release-id>]\n' "$0"
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

read_manifest_value() {
  local manifest="$1"
  local key="$2"
  awk -v key="$key" '
    index($0, key "=") == 1 { value = substr($0, length(key) + 2) }
    END { sub(/\r$/, "", value); print value }
  ' "$manifest"
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

is_valid_requested_ref() {
  local value="$1"
  [ -n "$value" ] &&
    [ "${#value}" -le 256 ] &&
    [[ "$value" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ ]] &&
    [[ "$value" != *..* ]] &&
    [[ "$value" != *//* ]] &&
    [[ "$value" != */ ]] &&
    [[ "$value" != *.lock ]]
}

is_valid_release_id() {
  [[ "$1" =~ ^[0-9]{8}-[0-9]{6}-[0-9a-f]{12}$ ]]
}

is_valid_commit() {
  [[ "$1" =~ ^[0-9a-f]{40}$ ]]
}

is_valid_image_tag() {
  [[ "$1" =~ ^[a-z0-9][a-z0-9._/-]*:[A-Za-z0-9_.-]+$ ]]
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --check) CHECK_ONLY="true"; shift ;;
    --ref) [ "$#" -ge 2 ] || fail "--ref requires a value"; REQUESTED_REF="$2"; shift 2 ;;
    --rollback) [ "$#" -ge 2 ] || fail "--rollback requires a release id"; ROLLBACK_RELEASE="$2"; shift 2 ;;
    --help) usage; exit 0 ;;
    *) usage >&2; fail "unknown option: $1" ;;
  esac
done

is_valid_requested_ref "$REQUESTED_REF" || fail "invalid deployment ref: $REQUESTED_REF"
if [ -n "$ROLLBACK_RELEASE" ] && ! is_valid_release_id "$ROLLBACK_RELEASE"; then
  fail "invalid release id: $ROLLBACK_RELEASE"
fi
[[ "$PROJECT_NAME" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || fail "COMPOSE_PROJECT_NAME contains unsupported characters"
[[ "$KEEP_RELEASES" =~ ^[1-9][0-9]*$ ]] || fail "KEEP_RELEASES must be a positive integer"

case "$APP_ROOT" in
  ""|/|/opt|/usr|/var|/home) fail "APP_ROOT must be a dedicated absolute directory" ;;
  /*) ;;
  *) fail "APP_ROOT must be an absolute path" ;;
esac

require_cmd awk

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
  printf 'action=%s\n' "$([ -n "$ROLLBACK_RELEASE" ] && printf rollback || printf deploy)"
  printf 'deploy_script_version=%s\n' "$DEPLOY_SCRIPT_VERSION"
  printf 'requested_ref=%s\n' "$REQUESTED_REF"
  if [ -n "$ROLLBACK_RELEASE" ]; then
    printf 'rollback_release=%s\n' "$ROLLBACK_RELEASE"
  fi
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
require_cmd flock
require_cmd tar

mkdir -p "$APP_ROOT" "$RELEASES_DIR" "$SHARED_DIR" "$BIN_DIR"
exec 9>"$APP_ROOT/.operation.lock"
flock -n 9 || fail "another FluxPost deployment or verification operation is active"

COMPOSE_APP_IMAGE="${PROJECT_NAME}-app:latest"

compose() {
  COMPOSE_PROJECT_NAME="$PROJECT_NAME" docker compose --env-file "$ENV_FILE" "$@"
}

current_release_path() {
  local current_path=""
  if [ -L "$APP_ROOT/current" ]; then
    current_path="$(readlink -f "$APP_ROOT/current")"
    case "$current_path" in
      "$RELEASES_DIR"/*) [ -d "$current_path" ] && printf '%s\n' "$current_path" ;;
    esac
  fi
}

capture_current_image() {
  local container_id image_id rescue_image
  container_id="$(docker ps -q \
    --filter "label=com.docker.compose.project=$PROJECT_NAME" \
    --filter "label=com.docker.compose.service=app" | head -n 1)"
  [ -n "$container_id" ] || return 0
  image_id="$(docker inspect --format '{{.Image}}' "$container_id")"
  [ -n "$image_id" ] || return 0
  rescue_image="${PROJECT_NAME}-app:rescue-${TIMESTAMP}"
  docker image tag "$image_id" "$rescue_image"
  printf '%s\n' "$rescue_image"
}

wait_for_health() {
  local attempt
  log "waiting for local health at $LOCAL_HEALTH_URL"
  for attempt in $(seq 1 45); do
    if curl -fsS "$LOCAL_HEALTH_URL" >/dev/null; then
      if [ "$PROXY_ENABLED" = "false" ]; then
        return 0
      fi
      log "checking public health at $PUBLIC_HEALTH_URL"
      if curl -fsS "$PUBLIC_HEALTH_URL" >/dev/null; then
        return 0
      fi
    fi
    sleep 2
  done
  return 1
}

activate_release() {
  local release_dir="$1"
  local immutable_image="$2"
  [ -f "$release_dir/compose.yaml" ] || return 1
  is_valid_image_tag "$immutable_image" || return 1
  docker image inspect "$immutable_image" >/dev/null 2>&1 || return 1

  docker image tag "$immutable_image" "$COMPOSE_APP_IMAGE"
  cd "$release_dir"
  compose up -d postgres
  if [ "$PROXY_ENABLED" = "true" ]; then
    log "starting app, PostgreSQL, and HTTPS proxy for $PUBLIC_HOST"
    compose up -d --no-build --force-recreate app
    compose up -d --no-build proxy
  else
    log "starting private app and PostgreSQL only"
    local proxy_container_id
    proxy_container_id="$(compose ps -q proxy)"
    if [ -n "$proxy_container_id" ]; then
      compose stop proxy
    fi
    compose up -d --no-build --force-recreate app
  fi
  wait_for_health
}

rollback_release() {
  local release_dir="$1"
  local immutable_image="$2"
  log "restoring previous release $release_dir"
  if ! activate_release "$release_dir" "$immutable_image"; then
    return 1
  fi
  ln -sfn "$release_dir" "$APP_ROOT/current"
}

manual_rollback() {
  local release_dir="$RELEASES_DIR/$ROLLBACK_RELEASE"
  local manifest="$release_dir/release.manifest"
  local commit immutable_image built_image_id
  [ -d "$release_dir" ] || fail "rollback release does not exist: $ROLLBACK_RELEASE"
  [ -f "$manifest" ] || fail "rollback release has no release.manifest: $ROLLBACK_RELEASE"
  commit="$(read_manifest_value "$manifest" commit)"
  immutable_image="$(read_manifest_value "$manifest" image)"
  is_valid_commit "$commit" || fail "rollback manifest has an invalid commit"
  is_valid_image_tag "$immutable_image" || fail "rollback manifest has an invalid image"

  if ! docker image inspect "$immutable_image" >/dev/null 2>&1; then
    log "rebuilding missing rollback image $immutable_image"
    cd "$release_dir"
    compose build app
    built_image_id="$(docker image inspect --format '{{.Id}}' "$COMPOSE_APP_IMAGE")"
    [ -n "$built_image_id" ] || fail "rollback build did not produce an app image"
    docker image tag "$built_image_id" "$immutable_image"
  fi

  local previous_release previous_image
  previous_release="$(current_release_path)"
  previous_image="$(capture_current_image)"
  if ! activate_release "$release_dir" "$immutable_image"; then
    if [ -n "$previous_release" ] && [ -n "$previous_image" ]; then
      rollback_release "$previous_release" "$previous_image" || true
    fi
    fail "rollback activation failed; attempted to restore the previously running release"
  fi
  ln -sfn "$release_dir" "$APP_ROOT/current"
  compose ps
  log "rolled back to $ROLLBACK_RELEASE ($commit)"
}

if [ -n "$ROLLBACK_RELEASE" ]; then
  manual_rollback
  exit 0
fi

PREVIOUS_RELEASE="$(current_release_path)"
PREVIOUS_IMAGE="$(capture_current_image)"

if [ ! -d "$REPO_DIR/.git" ]; then
  log "cloning $REPO_URL"
  if [ -e "$REPO_DIR" ]; then
    fail "$REPO_DIR exists but is not a Git repository"
  fi
  git clone --no-checkout "$REPO_URL" "$REPO_DIR"
else
  git -C "$REPO_DIR" remote set-url origin "$REPO_URL"
fi

log "fetching $REQUESTED_REF"
git -C "$REPO_DIR" fetch --force --tags origin "$REQUESTED_REF"
COMMIT="$(git -C "$REPO_DIR" rev-parse --verify "FETCH_HEAD^{commit}")"
is_valid_commit "$COMMIT" || fail "resolved deployment commit is invalid"
git -C "$REPO_DIR" checkout --detach --force "$COMMIT"

RELEASE_ID="${TIMESTAMP}-${COMMIT:0:12}"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_ID"
IMMUTABLE_IMAGE="${PROJECT_NAME}-app:${COMMIT}"
[ ! -e "$RELEASE_DIR" ] || fail "release already exists: $RELEASE_ID"

log "creating release $RELEASE_ID from $COMMIT"
mkdir -p "$RELEASE_DIR"
git -C "$REPO_DIR" archive "$COMMIT" | tar -x -C "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR/deploy"
ln -sfn "$ENV_FILE" "$RELEASE_DIR/deploy/env.production"

log "building app image $IMMUTABLE_IMAGE"
cd "$RELEASE_DIR"
if ! compose build app; then
  rm -rf "$RELEASE_DIR"
  fail "app image build failed; the running release was not changed"
fi
BUILT_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$COMPOSE_APP_IMAGE")"
[ -n "$BUILT_IMAGE_ID" ] || fail "app build did not produce an image"
docker image tag "$BUILT_IMAGE_ID" "$IMMUTABLE_IMAGE"

{
  printf 'format=1\n'
  printf 'release=%s\n' "$RELEASE_ID"
  printf 'commit=%s\n' "$COMMIT"
  printf 'image=%s\n' "$IMMUTABLE_IMAGE"
  printf 'created_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$RELEASE_DIR/release.manifest"
chmod 0644 "$RELEASE_DIR/release.manifest"

if ! activate_release "$RELEASE_DIR" "$IMMUTABLE_IMAGE"; then
  if [ -n "$PREVIOUS_RELEASE" ] && [ -n "$PREVIOUS_IMAGE" ]; then
    if ! rollback_release "$PREVIOUS_RELEASE" "$PREVIOUS_IMAGE"; then
      fail "new release failed health checks and automatic rollback also failed"
    fi
  else
    cd "$RELEASE_DIR"
    compose stop app postgres proxy >/dev/null 2>&1 || true
  fi
  fail "new release failed health checks; the previous release was restored"
fi

ln -sfn "$RELEASE_DIR" "$APP_ROOT/current"

candidate_version="$(awk -F'"' '/^DEPLOY_SCRIPT_VERSION="[0-9]+"$/ { print $2; exit }' "$REPO_DIR/scripts/deploy/vps-deploy.sh")"
if [[ "$candidate_version" =~ ^[0-9]+$ ]] && [ "$candidate_version" -ge "$DEPLOY_SCRIPT_VERSION" ]; then
  install -m 0755 "$REPO_DIR/scripts/deploy/vps-deploy.sh" "$BIN_DIR/deploy.sh"
else
  log "keeping deploy wrapper version $DEPLOY_SCRIPT_VERSION for older target commit"
fi
install -m 0755 "$REPO_DIR/scripts/deploy/vps-enable-domain.sh" "$BIN_DIR/enable-domain.sh"

installed_verifier_version="$(awk -F'"' '/^VERIFIER_SCRIPT_VERSION="[0-9]+"$/ { print $2; exit }' "$BIN_DIR/verify-candidate.sh" 2>/dev/null || true)"
candidate_verifier_version="$(awk -F'"' '/^VERIFIER_SCRIPT_VERSION="[0-9]+"$/ { print $2; exit }' "$REPO_DIR/scripts/deploy/vps-verify-candidate.sh" 2>/dev/null || true)"
if [[ "$candidate_verifier_version" =~ ^[0-9]+$ ]] && \
  { [[ ! "$installed_verifier_version" =~ ^[0-9]+$ ]] || [ "$candidate_verifier_version" -ge "$installed_verifier_version" ]; }; then
  install -m 0755 "$REPO_DIR/scripts/deploy/vps-verify-candidate.sh" "$BIN_DIR/verify-candidate.sh"
elif [[ "$installed_verifier_version" =~ ^[0-9]+$ ]]; then
  log "keeping candidate verifier version $installed_verifier_version for older target commit"
else
  log "candidate verifier is unavailable in target commit"
fi

log "service status"
compose ps

log "pruning old release directories"
find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' \
  | sort -r \
  | tail -n +"$((KEEP_RELEASES + 1))" \
  | while read -r old_release; do
      [ -n "$old_release" ] || continue
      rm -rf "$RELEASES_DIR/$old_release"
    done

log "deployed $COMMIT to $RELEASE_DIR"
if [ "$PROXY_ENABLED" = "false" ]; then
  log "private access: ssh -L $APP_PORT:127.0.0.1:$APP_PORT <user>@<vps>"
fi
