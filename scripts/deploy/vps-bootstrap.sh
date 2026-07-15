#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/opt/fluxpost-studio"
REPO_URL="https://github.com/Jacobshujun/fluxpost-studio.git"
BRANCH="main"
APP_PORT="3101"
ADMIN_USER=""
PUBLIC_HOST=""
NEW_ENV_CREATED="false"
SETUP_KEY=""

log() {
  printf '[bootstrap] %s\n' "$*"
}

fail() {
  printf '[bootstrap] %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: sudo bash vps-bootstrap.sh --admin-user <username> [options]

Options:
  --admin-user <username>  Required first administrator username.
  --domain <hostname>      Optional HTTPS hostname. Omit until DNS is ready.
  --app-port <port>        Loopback host port (default: 3101).
  --repo-url <url>         Git repository URL.
  --branch <name>          Git branch (default: main).
  --app-root <path>        Install root (default: /opt/fluxpost-studio).
  --help                   Show this help.
EOF
}

is_valid_hostname() {
  local value="$1"
  [ "${#value}" -le 253 ] &&
    [[ "$value" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]
}

set_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"
  if grep -q "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --admin-user) [ "$#" -ge 2 ] || fail "--admin-user requires a value"; ADMIN_USER="$2"; shift 2 ;;
    --domain) [ "$#" -ge 2 ] || fail "--domain requires a value"; PUBLIC_HOST="${2,,}"; shift 2 ;;
    --app-port) [ "$#" -ge 2 ] || fail "--app-port requires a value"; APP_PORT="$2"; shift 2 ;;
    --repo-url) [ "$#" -ge 2 ] || fail "--repo-url requires a value"; REPO_URL="$2"; shift 2 ;;
    --branch) [ "$#" -ge 2 ] || fail "--branch requires a value"; BRANCH="$2"; shift 2 ;;
    --app-root) [ "$#" -ge 2 ] || fail "--app-root requires a value"; APP_ROOT="$2"; shift 2 ;;
    --help) usage; exit 0 ;;
    *) fail "unknown option: $1" ;;
  esac
done

[ "$(id -u)" -eq 0 ] || fail "run this installer with sudo or as root"
[[ "$ADMIN_USER" =~ ^[a-z0-9._@-]{2,48}$ ]] || fail "--admin-user must be 2-48 lowercase letters, numbers, dot, underscore, at, or hyphen"
[[ "$APP_PORT" =~ ^[0-9]+$ ]] || fail "--app-port must be a number"
if [ "$APP_PORT" -lt 1024 ] || [ "$APP_PORT" -gt 65535 ]; then
  fail "--app-port must be between 1024 and 65535"
fi
if [ -n "$PUBLIC_HOST" ] && ! is_valid_hostname "$PUBLIC_HOST"; then
  fail "--domain must be a DNS hostname without scheme, path, or port"
fi
case "$APP_ROOT" in
  ""|/|/opt|/usr|/var|/home) fail "--app-root must be a dedicated absolute directory" ;;
  /*) ;;
  *) fail "--app-root must be an absolute path" ;;
esac

if [ ! -r /etc/os-release ]; then
  fail "cannot identify the operating system"
fi
. /etc/os-release
if [ "${ID:-}" != "ubuntu" ] || [ "${VERSION_ID:-}" != "24.04" ]; then
  fail "this installer supports Ubuntu 24.04 only"
fi

MEMORY_KB="$(awk '/^MemTotal:/ { print $2 }' /proc/meminfo)"
if [ "${MEMORY_KB:-0}" -lt 1500000 ]; then
  fail "at least 2 GB RAM is recommended; provision a larger VPS before installing"
fi

export DEBIAN_FRONTEND=noninteractive
log "installing base packages"
apt-get update
apt-get install -y ca-certificates curl git openssl gpg

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  log "installing Docker Engine and Compose plugin"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' \
    "$(dpkg --print-architecture)" "$VERSION_CODENAME" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

REPO_DIR="$APP_ROOT/repo"
SHARED_DIR="$APP_ROOT/shared"
BIN_DIR="$APP_ROOT/bin"
ENV_FILE="$SHARED_DIR/env.production"
mkdir -p "$APP_ROOT" "$SHARED_DIR" "$BIN_DIR"

if [ -d "$REPO_DIR/.git" ]; then
  log "refreshing repository"
  git -C "$REPO_DIR" fetch origin "$BRANCH"
  git -C "$REPO_DIR" checkout "$BRANCH"
  git -C "$REPO_DIR" reset --hard "origin/$BRANCH"
elif [ -e "$REPO_DIR" ]; then
  fail "$REPO_DIR exists but is not a Git repository"
else
  log "cloning $REPO_URL"
  git clone --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
fi

install -m 0755 "$REPO_DIR/scripts/deploy/vps-deploy.sh" "$BIN_DIR/deploy.sh"
install -m 0755 "$REPO_DIR/scripts/deploy/vps-enable-domain.sh" "$BIN_DIR/enable-domain.sh"

if [ ! -f "$ENV_FILE" ]; then
  log "creating persistent production configuration"
  umask 077
  TEMP_ENV="$(mktemp "$SHARED_DIR/.env.production.XXXXXX")"
  cp "$REPO_DIR/deploy/env.production.example" "$TEMP_ENV"
  POSTGRES_PASSWORD="$(openssl rand -hex 32)"
  SETUP_KEY="$(openssl rand -hex 24)"
  set_env_value "$TEMP_ENV" FLUXPOST_PROXY_ENABLED "$([ -n "$PUBLIC_HOST" ] && printf true || printf false)"
  set_env_value "$TEMP_ENV" FLUXPOST_PUBLIC_HOST "$PUBLIC_HOST"
  set_env_value "$TEMP_ENV" FLUXPOST_APP_PORT "$APP_PORT"
  set_env_value "$TEMP_ENV" POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
  set_env_value "$TEMP_ENV" DATABASE_URL "postgres://fluxpost:${POSTGRES_PASSWORD}@postgres:5432/fluxpost_studio"
  set_env_value "$TEMP_ENV" WORKSPACE_ALLOWED_USERS "$ADMIN_USER"
  set_env_value "$TEMP_ENV" WORKSPACE_ADMIN_USERS "$ADMIN_USER"
  set_env_value "$TEMP_ENV" WORKSPACE_ACCESS_PASSWORD "$SETUP_KEY"
  chmod 0600 "$TEMP_ENV"
  mv "$TEMP_ENV" "$ENV_FILE"
  NEW_ENV_CREATED="true"
else
  log "keeping existing $ENV_FILE and all current secrets"
fi

APP_ROOT="$APP_ROOT" REPO_URL="$REPO_URL" BRANCH="$BRANCH" "$BIN_DIR/deploy.sh"

printf '\nFluxPost Studio installation completed.\n'
printf 'Private app endpoint: http://127.0.0.1:%s\n' "$APP_PORT"
printf 'Windows tunnel: ssh -L %s:127.0.0.1:%s root@<VPS_IP> -p <SSH_PORT>\n' "$APP_PORT" "$APP_PORT"
printf 'Then open: http://127.0.0.1:%s\n' "$APP_PORT"
printf 'Administrator username: %s\n' "$ADMIN_USER"
if [ "$NEW_ENV_CREATED" = "true" ]; then
  printf 'First-admin setup key (shown once): %s\n' "$SETUP_KEY"
else
  printf 'Existing administrator and setup secrets were preserved.\n'
fi
if [ -z "$PUBLIC_HOST" ]; then
  printf 'After DNS is ready: sudo %s/enable-domain.sh app.example.com\n' "$BIN_DIR"
else
  printf 'HTTPS endpoint: https://%s\n' "$PUBLIC_HOST"
fi
