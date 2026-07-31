#!/usr/bin/env bash
set -euo pipefail

mode="${1:---check}"
app_root="/opt/fluxpost-studio"
credential_file="/root/fluxpost-staging-credentials"

fail() {
  printf '[retire-104] ERROR: %s\n' "$*" >&2
  exit 1
}

[[ "$mode" == "--check" || "$mode" == "--execute" ]] || fail "usage: retire-104.sh [--check|--execute]"
[[ "$(id -u)" -eq 0 ]] || fail "must run as root"
for command_name in docker readlink realpath ss stat; do
  command -v "$command_name" >/dev/null 2>&1 || fail "missing command: $command_name"
done

find_single_pid_by_exe() {
  local expected_exe="$1"
  local matches=()
  local proc_path actual_exe
  for proc_path in /proc/[0-9]*; do
    actual_exe="$(readlink -f "$proc_path/exe" 2>/dev/null || true)"
    if [[ "$actual_exe" == "$expected_exe" ]]; then
      matches+=("${proc_path##*/}")
    fi
  done
  [[ "${#matches[@]}" -eq 1 ]] || fail "expected one process for $expected_exe, found ${#matches[@]}"
  printf '%s\n' "${matches[0]}"
}

frps_pid="$(find_single_pid_by_exe /usr/local/frps/frps)"
xui_pid="$(find_single_pid_by_exe /usr/local/x-ui/x-ui)"
xray_pid="$(find_single_pid_by_exe /usr/local/x-ui/bin/xray-linux-amd64)"
[[ "$(awk '{print $4}' "/proc/$xray_pid/stat")" == "$xui_pid" ]] || fail "xray is not a child of x-ui"

capture_protected() {
  local pid
  for pid in "$frps_pid" "$xui_pid" "$xray_pid"; do
    kill -0 "$pid" 2>/dev/null || fail "protected PID $pid stopped"
    ps -p "$pid" -o pid=,ppid=,lstart=,comm=
    readlink -f "/proc/$pid/exe"
    sed -n '1p' "/proc/$pid/cgroup"
  done
  ss -lntupH | grep -E "pid=($frps_pid|$xui_pid|$xray_pid)," | sort
}

capture_non_fluxpost_containers() {
  local container_id project
  while IFS= read -r container_id; do
    [[ -n "$container_id" ]] || continue
    project="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$container_id")"
    if [[ "$project" != "fluxpost" ]]; then
      docker inspect --format 'id={{.Id}} name={{.Name}} image={{.Image}} status={{.State.Status}}' "$container_id"
    fi
  done < <(docker ps -aq --no-trunc)
}

baseline_protected="$(mktemp)"
baseline_containers="$(mktemp)"
baseline_listeners="$(mktemp)"
after_file=""
trap 'rm -f "$baseline_protected" "$baseline_containers" "$baseline_listeners" ${after_file:+"$after_file"}' EXIT
capture_protected > "$baseline_protected"
capture_non_fluxpost_containers | sort > "$baseline_containers"
ss -lntupH | grep -v 'docker-proxy' | sort > "$baseline_listeners"
chmod 0600 "$baseline_protected" "$baseline_containers" "$baseline_listeners"

[[ -d "$app_root" && ! -L "$app_root" ]] || fail "application root is not the expected directory"
[[ "$(realpath -e "$app_root")" == "$app_root" ]] || fail "application root resolves unexpectedly"
if findmnt -rn -R "$app_root" | grep -q .; then
  fail "application root contains a mount point"
fi
if [[ -e "$credential_file" || -L "$credential_file" ]]; then
  [[ -f "$credential_file" && ! -L "$credential_file" ]] || fail "staging credential path is not a regular file"
  [[ "$(realpath -e "$credential_file")" == "$credential_file" ]] || fail "staging credential path resolves unexpectedly"
  [[ "$(stat -c '%a' "$credential_file")" == "600" ]] || fail "staging credential file mode is not 0600"
fi

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

mapfile -t image_refs < <(docker image ls --format '{{.Repository}}:{{.Tag}}' | awk 'index($0, "fluxpost-app:") == 1' | sort -u)
[[ "${#image_refs[@]}" -gt 0 ]] || fail "no FluxPost application image tags found"
for container_id in $(docker ps -aq --no-trunc); do
  project="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$container_id")"
  [[ "$project" == "fluxpost" ]] && continue
  container_image_id="$(docker inspect --format '{{.Image}}' "$container_id")"
  for image_ref in "${image_refs[@]}"; do
    image_id="$(docker image inspect --format '{{.Id}}' "$image_ref")"
    [[ "$container_image_id" != "$image_id" ]] || fail "$image_ref is used by unrelated container $container_id"
  done
done

printf '[retire-104] verified containers=3 network=1 volumes=8 image_tags=%s app_root=present credential=%s\n' \
  "${#image_refs[@]}" "$([[ -e "$credential_file" ]] && printf present || printf absent)"
printf '[retire-104] protected frps=%s x-ui=%s xray=%s\n' "$frps_pid" "$xui_pid" "$xray_pid"
printf '[retire-104] non_fluxpost_containers=%s\n' "$(wc -l < "$baseline_containers")"

if [[ "$mode" == "--check" ]]; then
  printf '[retire-104] check complete; no changes made\n'
  exit 0
fi

printf '[retire-104] removing verified FluxPost containers\n'
docker rm -f "${container_ids[@]}"
printf '[retire-104] removing verified FluxPost network\n'
docker network rm "${network_ids[0]}"
printf '[retire-104] removing verified FluxPost volumes\n'
docker volume rm "${volume_names[@]}"
printf '[retire-104] removing verified FluxPost application image tags\n'
docker image rm "${image_refs[@]}"
printf '[retire-104] removing verified application root and staging credential\n'
rm -rf --one-file-system -- "$app_root"
rm -f -- "$credential_file" /tmp/fluxpost-protected-baseline.txt

[[ ! -e "$app_root" && ! -L "$app_root" ]] || fail "application root remains"
[[ ! -e "$credential_file" && ! -L "$credential_file" ]] || fail "staging credential remains"
[[ -z "$(docker ps -aq --filter label=com.docker.compose.project=fluxpost)" ]] || fail "FluxPost containers remain"
[[ -z "$(docker network ls -q --filter label=com.docker.compose.project=fluxpost)" ]] || fail "FluxPost network remains"
[[ -z "$(docker volume ls -q --filter label=com.docker.compose.project=fluxpost)" ]] || fail "FluxPost volumes remain"
[[ -z "$(docker image ls --format '{{.Repository}}:{{.Tag}}' | awk 'index($0, "fluxpost-app:") == 1')" ]] || fail "FluxPost application image tags remain"
[[ -z "$(ss -lntH | awk '$4 ~ /:(80|443|3101)$/')" ]] || fail "retired FluxPost HTTP listener remains"

after_file="$(mktemp)"
capture_protected > "$after_file"
cmp -s "$baseline_protected" "$after_file" || fail "protected-service baseline changed"
capture_non_fluxpost_containers | sort > "$after_file"
cmp -s "$baseline_containers" "$after_file" || fail "unrelated container baseline changed"
ss -lntupH | grep -v 'docker-proxy' | sort > "$after_file"
cmp -s "$baseline_listeners" "$after_file" || fail "unrelated listener baseline changed"

printf '[retire-104] retirement complete; protected services and unrelated resources unchanged\n'
