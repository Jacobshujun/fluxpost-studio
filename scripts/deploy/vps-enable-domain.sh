#!/usr/bin/env bash
set -euo pipefail

DOMAIN_SCRIPT_VERSION="2"
APP_ROOT="${APP_ROOT:-/opt/fluxpost-studio}"
ENV_FILE="$APP_ROOT/shared/env.production"
DEPLOY_SCRIPT="$APP_ROOT/bin/deploy.sh"

fail() {
  printf '[domain] %s\n' "$*" >&2
  exit 1
}

usage() {
  printf 'Usage: sudo %s <hostname>\n' "$0"
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
  local temp
  temp="$(mktemp "${file}.XXXXXX")"
  awk -v key="$key" -v value="$value" '
    BEGIN { updated = 0 }
    index($0, key "=") == 1 { print key "=" value; updated = 1; next }
    { print }
    END { if (!updated) print key "=" value }
  ' "$file" > "$temp"
  chmod 0600 "$temp"
  mv "$temp" "$file"
}

[ "$(id -u)" -eq 0 ] || fail "run this command with sudo or as root"
[ "$#" -eq 1 ] || { usage; exit 1; }
DOMAIN="${1,,}"
is_valid_hostname "$DOMAIN" || fail "hostname must not contain a scheme, path, port, underscore, or invalid DNS label"
[ -f "$ENV_FILE" ] || fail "missing $ENV_FILE; run the VPS bootstrap first"
[ -x "$DEPLOY_SCRIPT" ] || fail "missing $DEPLOY_SCRIPT; run the VPS bootstrap first"
command -v getent >/dev/null 2>&1 || fail "missing getent command"
getent ahosts "$DOMAIN" >/dev/null || fail "$DOMAIN does not resolve yet; add its DNS A/AAAA record and retry"

DEPLOY_ARGS=()
if [ -n "${DEPLOY_REF:-}" ]; then
  DEPLOY_ARGS=(--ref "$DEPLOY_REF")
elif [ -L "$APP_ROOT/current" ]; then
  CURRENT_RELEASE="$(readlink -f "$APP_ROOT/current")"
  case "$CURRENT_RELEASE" in
    "$APP_ROOT/releases/"*) ;;
    *) fail "current release points outside $APP_ROOT/releases" ;;
  esac
  CURRENT_MANIFEST="$CURRENT_RELEASE/release.manifest"
  if [ -f "$CURRENT_MANIFEST" ]; then
    CURRENT_COMMIT="$(awk -F= '$1 == "commit" { print $2; exit }' "$CURRENT_MANIFEST")"
    [[ "$CURRENT_COMMIT" =~ ^[0-9a-f]{40}$ ]] || fail "current release manifest has an invalid commit"
    DEPLOY_ARGS=(--ref "$CURRENT_COMMIT")
    printf '[domain] pinning deployment to current commit %s\n' "$CURRENT_COMMIT"
  fi
fi

set_env_value "$ENV_FILE" FLUXPOST_PUBLIC_HOST "$DOMAIN"
set_env_value "$ENV_FILE" FLUXPOST_PROXY_ENABLED true

printf '[domain] enabling HTTPS for %s\n' "$DOMAIN"
APP_ROOT="$APP_ROOT" "$DEPLOY_SCRIPT" "${DEPLOY_ARGS[@]}"
printf '[domain] ready: https://%s\n' "$DOMAIN"
