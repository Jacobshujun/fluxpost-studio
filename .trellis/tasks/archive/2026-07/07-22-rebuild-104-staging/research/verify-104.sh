#!/usr/bin/env bash
set -euo pipefail

app_root=/opt/fluxpost-studio
baseline_file=/tmp/fluxpost-protected-baseline.txt
target=8ee3498e4c80bbca6b711e2eb2f3fecdd30faead
current="$(readlink -f "$app_root/current")"
env_file="$app_root/shared/env.production"

fail() {
  printf '[verify] %s\n' "$*" >&2
  exit 1
}

expect_value() {
  local key="$1"
  local expected="$2"
  local value
  value="$(awk -v key="$key" 'index($0, key "=") == 1 { print substr($0, length(key) + 2) }' "$env_file")"
  [[ "$value" == "$expected" ]] || fail "$key is not the expected staging value"
  printf '%s=match\n' "$key"
}

expect_empty() {
  local key="$1"
  local value
  value="$(awk -v key="$key" 'index($0, key "=") == 1 { print substr($0, length(key) + 2) }' "$env_file")"
  [[ -z "$value" ]] || fail "$key is non-empty in staging"
  printf '%s=empty\n' "$key"
}

[[ "$current" == "$app_root/releases/"* ]] || fail "current points outside release root"
manifest="$current/release.manifest"
[[ -f "$manifest" ]] || fail "release manifest missing"
grep -qx "commit=$target" "$manifest" || fail "manifest commit mismatch"
grep -qx "image=fluxpost-app:$target" "$manifest" || fail "manifest image mismatch"
printf 'current=%s\n' "$current"
printf 'manifest=match\n'
printf 'repo_head=%s\n' "$(git -C "$app_root/repo" rev-parse HEAD)"
[[ "$(git -C "$app_root/repo" rev-parse HEAD)" == "$target" ]] || fail "repo HEAD mismatch"
docker image inspect "fluxpost-app:$target" >/dev/null || fail "immutable app image missing"

[[ "$(stat -c '%a' "$env_file")" == 600 ]] || fail "env.production is not mode 0600"
[[ "$(stat -c '%a' /root/fluxpost-staging-credentials)" == 600 ]] || fail "credentials file is not mode 0600"
[[ -s /root/fluxpost-staging-credentials ]] || fail "credentials file is empty"
printf 'secret_files=root-only\n'

expect_value FLUXPOST_PROXY_ENABLED false
expect_value FLUXPOST_APP_PORT 3101
expect_value FLUXPOST_DEPLOYMENT_ENV staging
expect_value TOS_ENABLED false
expect_value TOS_OBJECT_PREFIX fluxpost/staging
expect_value WORKSPACE_ALLOWED_USERS stagingadmin
expect_value WORKSPACE_ADMIN_USERS stagingadmin
for key in TIKHUB_API_KEY OPENAI_API_KEY OPENAI_IMAGE_API_KEY OPENAI_IMAGE_BACKUP_API_KEY FEISHU_APP_ID FEISHU_APP_SECRET FEISHU_BITABLE_APP_TOKEN FEISHU_CONTENT_IMPORT_BASE_TOKEN FEISHU_DISTRIBUTION_CHECK_BASE_TOKEN FEISHU_NOTIFY_CHAT_ID FEISHU_NOTIFY_USER_ID TOS_ACCESS_KEY_ID TOS_ACCESS_KEY_SECRET TOS_BUCKET TOS_ENDPOINT; do
  expect_empty "$key"
done

mapfile -t containers < <(docker ps -aq --filter label=com.docker.compose.project=fluxpost)
[[ "${#containers[@]}" -eq 2 ]] || fail "expected app and postgres only"
for container_id in "${containers[@]}"; do
  docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}} {{.State.Status}}' "$container_id"
done | sort
[[ "$(docker inspect --format '{{.State.Status}}' fluxpost-app)" == running ]] || fail "app is not running"
[[ "$(docker inspect --format '{{.State.Health.Status}}' fluxpost-app)" == healthy ]] || fail "app is not healthy"
[[ "$(docker inspect --format '{{.State.Health.Status}}' fluxpost-postgres)" == healthy ]] || fail "postgres is not healthy"
[[ "$(docker compose -p fluxpost --env-file "$env_file" -f "$current/compose.yaml" ps -q proxy)" == "" ]] || fail "proxy container exists in staging"

port_json="$(docker inspect --format '{{json .NetworkSettings.Ports}}' fluxpost-app)"
[[ "$port_json" == *'127.0.0.1'* && "$port_json" == *'3101'* ]] || fail "app port is not loopback 3101"
[[ "$(curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:3101/api/config)" == 200 ]] || fail "local API health failed"
[[ "$(curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:3101/)" == 200 ]] || fail "local page failed"
printf 'http=healthy\n'

docker exec fluxpost-postgres psql -U fluxpost -d fluxpost_studio -v ON_ERROR_STOP=1 -c 'BEGIN; CREATE TEMP TABLE staging_probe (value integer); INSERT INTO staging_probe VALUES (1); SELECT count(*) FROM staging_probe; ROLLBACK;' >/dev/null
printf 'postgres_rw=healthy\n'

expected_volumes="$(printf '%s\n' \
  fluxpost_fluxpost-config \
  fluxpost_fluxpost-data \
  fluxpost_fluxpost-node-home \
  fluxpost_fluxpost-postgres-data \
  fluxpost_fluxpost-public-generated \
  fluxpost_fluxpost-public-media | sort)"
actual_volumes="$(docker volume ls -q --filter label=com.docker.compose.project=fluxpost | sort)"
[[ "$actual_volumes" == "$expected_volumes" ]] || fail "staging volume set is not isolated/fresh"
printf 'volumes=isolated\n'

check_process() {
  local pid="$1"
  local exe="$2"
  kill -0 "$pid" 2>/dev/null || fail "protected PID $pid stopped"
  [[ "$(readlink -f "/proc/$pid/exe")" == "$exe" ]] || fail "protected PID $pid executable changed"
}
check_process 8552 /usr/local/frps/frps
check_process 2156647 /usr/local/x-ui/x-ui
check_process 2156673 /usr/local/x-ui/bin/xray-linux-amd64
[[ "$(awk '{print $4}' /proc/2156673/stat)" == 2156647 ]] || fail "xray parent changed"
after_file="$(mktemp)"
{
  for pid in 8552 2156647 2156673; do
    ps -p "$pid" -o pid=,ppid=,lstart=,comm=
    readlink -f "/proc/$pid/exe"
    sed -n '1p' "/proc/$pid/cgroup"
  done
  ss -lntupH | grep -E 'pid=(8552|2156647|2156673),' | sort
} > "$after_file"
cmp -s "$baseline_file" "$after_file" || fail "protected-service baseline changed"
rm -f "$after_file"
printf 'protected_services=unchanged\n'
