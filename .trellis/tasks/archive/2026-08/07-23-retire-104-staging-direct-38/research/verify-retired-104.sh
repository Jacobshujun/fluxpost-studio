#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf '[verify-retired-104] ERROR: %s\n' "$*" >&2
  exit 1
}

[[ ! -e /opt/fluxpost-studio && ! -L /opt/fluxpost-studio ]] || fail "application root remains"
[[ ! -e /root/fluxpost-staging-credentials && ! -L /root/fluxpost-staging-credentials ]] || fail "staging credential remains"
[[ -z "$(docker ps -aq --filter label=com.docker.compose.project=fluxpost)" ]] || fail "FluxPost containers remain"
[[ -z "$(docker network ls -q --filter label=com.docker.compose.project=fluxpost)" ]] || fail "FluxPost network remains"
[[ -z "$(docker volume ls -q --filter label=com.docker.compose.project=fluxpost)" ]] || fail "FluxPost volumes remain"
[[ -z "$(docker image ls --format '{{.Repository}}:{{.Tag}}' | awk 'index($0, "fluxpost-app:") == 1')" ]] || fail "FluxPost application image tags remain"
[[ -z "$(ss -lntH | awk '$4 ~ /:(80|443|3101)$/')" ]] || fail "retired FluxPost HTTP listener remains"

[[ "$(readlink -f /proc/8552/exe)" == /usr/local/frps/frps ]] || fail "frps identity changed"
[[ "$(readlink -f /proc/2156647/exe)" == /usr/local/x-ui/x-ui ]] || fail "x-ui identity changed"
[[ "$(readlink -f /proc/2156673/exe)" == /usr/local/x-ui/bin/xray-linux-amd64 ]] || fail "xray identity changed"
[[ "$(awk '{print $4}' /proc/2156673/stat)" == 2156647 ]] || fail "xray parent changed"
for pid in 8552 2156647 2156673; do
  kill -0 "$pid" 2>/dev/null || fail "protected PID $pid stopped"
done

printf '[verify-retired-104] fluxpost_absent=yes\n'
printf '[verify-retired-104] protected_services=unchanged\n'
printf '[verify-retired-104] remaining_containers=%s\n' "$(docker ps -aq | wc -l)"
df -h / | tail -n 1
