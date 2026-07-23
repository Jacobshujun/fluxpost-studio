#!/usr/bin/env bash
set -euo pipefail

app_root="/opt/fluxpost-studio"
baseline_file="/tmp/fluxpost-protected-baseline.txt"

fail() {
  printf '[cleanup] %s\n' "$*" >&2
  exit 1
}

check_process() {
  local pid="$1"
  local expected_exe="$2"
  kill -0 "$pid" 2>/dev/null || fail "protected PID $pid is not running"
  local actual_exe
  actual_exe="$(readlink -f "/proc/$pid/exe")"
  [[ "$actual_exe" == "$expected_exe" ]] || fail "protected PID $pid executable changed: $actual_exe"
}

capture_protected() {
  {
    for pid in 8552 2156647 2156673; do
      ps -p "$pid" -o pid=,ppid=,lstart=,comm=
      readlink -f "/proc/$pid/exe"
      sed -n '1p' "/proc/$pid/cgroup"
    done
    ss -lntupH | grep -E 'pid=(8552|2156647|2156673),' | sort
  }
}

[[ "$(id -u)" -eq 0 ]] || fail "must run as root"
[[ "$app_root" == "/opt/fluxpost-studio" ]] || fail "unexpected application root"
[[ -d "$app_root" && ! -L "$app_root" ]] || fail "application root is not the verified directory"
[[ "$(realpath -e "$app_root")" == "$app_root" ]] || fail "application root resolves unexpectedly"
if findmnt -rn -R "$app_root" | grep -q .; then
  fail "application root contains a mount point"
fi

check_process 8552 /usr/local/frps/frps
check_process 2156647 /usr/local/x-ui/x-ui
check_process 2156673 /usr/local/x-ui/bin/xray-linux-amd64
[[ "$(awk '{print $4}' /proc/2156673/stat)" == "2156647" ]] || fail "xray parent PID changed"

capture_protected > "$baseline_file"
chmod 0600 "$baseline_file"

mapfile -t container_ids < <(docker ps -aq --filter label=com.docker.compose.project=fluxpost)
[[ "${#container_ids[@]}" -eq 3 ]] || fail "expected exactly 3 FluxPost containers, found ${#container_ids[@]}"
actual_services="$({
  for container_id in "${container_ids[@]}"; do
    docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}|{{.Name}}' "$container_id"
  done
} | sort)"
expected_services="$(printf '%s\n' \
  'fluxpost|app|/fluxpost-app' \
  'fluxpost|postgres|/fluxpost-postgres' \
  'fluxpost|proxy|/fluxpost-proxy' | sort)"
[[ "$actual_services" == "$expected_services" ]] || fail "FluxPost container set changed"

mapfile -t network_ids < <(docker network ls -q --filter label=com.docker.compose.project=fluxpost)
[[ "${#network_ids[@]}" -eq 1 ]] || fail "expected exactly 1 FluxPost network, found ${#network_ids[@]}"
network_identity="$(docker network inspect --format '{{.Name}}|{{index .Labels "com.docker.compose.project"}}|{{index .Labels "com.docker.compose.network"}}' "${network_ids[0]}")"
[[ "$network_identity" == 'fluxpost_default|fluxpost|default' ]] || fail "FluxPost network identity changed"

mapfile -t volume_names < <(docker volume ls -q --filter label=com.docker.compose.project=fluxpost)
[[ "${#volume_names[@]}" -eq 8 ]] || fail "expected exactly 8 FluxPost volumes, found ${#volume_names[@]}"
actual_volumes="$(printf '%s\n' "${volume_names[@]}" | sort)"
expected_volumes="$(printf '%s\n' \
  fluxpost_fluxpost-caddy-config \
  fluxpost_fluxpost-caddy-data \
  fluxpost_fluxpost-config \
  fluxpost_fluxpost-data \
  fluxpost_fluxpost-node-home \
  fluxpost_fluxpost-postgres-data \
  fluxpost_fluxpost-public-generated \
  fluxpost_fluxpost-public-media | sort)"
[[ "$actual_volumes" == "$expected_volumes" ]] || fail "FluxPost volume set changed"

printf '[cleanup] removing verified FluxPost containers\n'
docker rm -f "${container_ids[@]}"
printf '[cleanup] removing verified FluxPost network\n'
docker network rm "${network_ids[0]}"
printf '[cleanup] removing verified FluxPost volumes\n'
docker volume rm "${volume_names[@]}"
printf '[cleanup] removing verified application root\n'
rm -rf --one-file-system -- "$app_root"

[[ ! -e "$app_root" ]] || fail "application root still exists"
[[ -z "$(docker ps -aq --filter label=com.docker.compose.project=fluxpost)" ]] || fail "FluxPost containers remain"
[[ -z "$(docker network ls -q --filter label=com.docker.compose.project=fluxpost)" ]] || fail "FluxPost networks remain"
[[ -z "$(docker volume ls -q --filter label=com.docker.compose.project=fluxpost)" ]] || fail "FluxPost volumes remain"

check_process 8552 /usr/local/frps/frps
check_process 2156647 /usr/local/x-ui/x-ui
check_process 2156673 /usr/local/x-ui/bin/xray-linux-amd64
after_file="$(mktemp)"
capture_protected > "$after_file"
cmp -s "$baseline_file" "$after_file" || fail "protected-service baseline changed during cleanup"
rm -f "$after_file"

printf '[cleanup] verified FluxPost removal complete; protected services unchanged\n'
