#!/usr/bin/env bash
set -euo pipefail

app_root=/opt/fluxpost-studio

fail() {
  printf '[verify-38] ERROR: %s\n' "$*" >&2
  exit 1
}

current="$(readlink -f "$app_root/current")"
[[ "$current" == "$app_root/releases/"* ]] || fail "current release points outside release root"
manifest="$current/release.manifest"
[[ -f "$manifest" ]] || fail "release manifest is missing"
commit="$(awk -F= '$1 == "commit" { print $2 }' "$manifest")"
image="$(awk -F= '$1 == "image" { print $2 }' "$manifest")"
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || fail "manifest commit is invalid"
[[ "$image" == "fluxpost-app:$commit" ]] || fail "manifest image does not match commit"
[[ "$(git -C "$app_root/repo" rev-parse HEAD)" == "$commit" ]] || fail "repository HEAD does not match manifest"
docker image inspect "$image" >/dev/null || fail "manifest image is missing"

mapfile -t fluxpost_containers < <(docker ps -q --filter label=com.docker.compose.project=fluxpost)
[[ "${#fluxpost_containers[@]}" -eq 2 ]] || fail "expected app and postgres containers"
[[ "$(docker inspect --format '{{.State.Status}}' fluxpost-app)" == running ]] || fail "app is not running"
[[ "$(docker inspect --format '{{.State.Health.Status}}' fluxpost-app)" == healthy ]] || fail "app is not healthy"
[[ "$(docker inspect --format '{{.State.Status}}' fluxpost-postgres)" == running ]] || fail "PostgreSQL is not running"
[[ "$(docker inspect --format '{{.State.Health.Status}}' fluxpost-postgres)" == healthy ]] || fail "PostgreSQL is not healthy"
app_ports="$(docker inspect --format '{{json .NetworkSettings.Ports}}' fluxpost-app)"
[[ "$app_ports" == *'127.0.0.1'* && "$app_ports" == *'3101'* ]] || fail "app is not bound to loopback port 3101"

[[ "$(curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:3101/api/config)" == 200 ]] || fail "loopback API health failed"
[[ "$(curl -fsS -o /dev/null -w '%{http_code}' http://127.0.0.1:3101/)" == 200 ]] || fail "loopback page health failed"
systemctl is-active --quiet nginx || fail "Nginx is not active"
nginx -t >/dev/null 2>&1 || fail "Nginx configuration is invalid"
[[ -n "$(ss -lntpH | awk '$4 ~ /:(80|443)$/ && $0 ~ /nginx/')" ]] || fail "Nginx public listeners are missing"
[[ "$(curl -fsS -o /dev/null -w '%{http_code}' --resolve flux.lightmoment.net:443:127.0.0.1 https://flux.lightmoment.net/api/config)" == 200 ]] || fail "Nginx HTTPS API health failed"

mapfile -t webui_containers < <(docker ps -q --filter name='^/open-webui$')
[[ "${#webui_containers[@]}" -eq 1 ]] || fail "Open WebUI container is missing"
webui_status="$(docker inspect --format '{{.State.Status}}' "${webui_containers[0]}")"
[[ "$webui_status" == running ]] || fail "Open WebUI is not running"
webui_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}not-configured{{end}}' "${webui_containers[0]}")"
[[ "$webui_health" == healthy || "$webui_health" == not-configured ]] || fail "Open WebUI health is $webui_health"

printf '[verify-38] release=%s commit=%s\n' "${current##*/}" "$commit"
printf '[verify-38] fluxpost_app=healthy postgres=healthy loopback_http=200 nginx_https=200\n'
printf '[verify-38] nginx=active open_webui=%s/%s\n' "$webui_status" "$webui_health"
