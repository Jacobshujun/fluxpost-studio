#!/usr/bin/env bash
set -u

section() {
  printf '\n=== %s ===\n' "$1"
}

section identity
date --iso-8601=seconds
hostname
uname -a
id

section platform
if command -v docker >/dev/null 2>&1; then
  docker version --format 'client={{.Client.Version}} server={{.Server.Version}}'
  docker compose version
else
  printf 'docker=missing\n'
fi
df -h / /opt 2>/dev/null || true

section protected-processes
for process_name in x-ui frps; do
  printf '%s:\n' "$process_name"
  pids="$(pgrep -x "$process_name" 2>/dev/null || true)"
  if [[ -z "$pids" ]]; then
    printf '  absent\n'
    continue
  fi
  while IFS= read -r pid; do
    ps -p "$pid" -o pid=,ppid=,lstart=,etimes=,comm=
    readlink -f "/proc/$pid/exe" 2>/dev/null || true
    sed -n '1p' "/proc/$pid/cgroup" 2>/dev/null || true
  done <<< "$pids"
done

printf 'xray-children:\n'
ps -eo pid=,ppid=,lstart=,etimes=,comm= | awk '$6 ~ /^xray/ { print }'

section protected-systemd
for unit in x-ui.service xray.service frps.service frp.service; do
  printf '%s:\n' "$unit"
  systemctl show "$unit" \
    --property=LoadState,ActiveState,SubState,MainPID,ExecMainStartTimestamp,FragmentPath \
    --no-pager 2>/dev/null || true
done

section listeners
ss -lntupH 2>/dev/null || ss -lntH

section containers
if command -v docker >/dev/null 2>&1; then
  while IFS= read -r container_id; do
    docker inspect --format \
      'id={{.Id}} name={{.Name}} image={{.Config.Image}} image_id={{.Image}} status={{.State.Status}} project={{index .Config.Labels "com.docker.compose.project"}} service={{index .Config.Labels "com.docker.compose.service"}} workdir={{index .Config.Labels "com.docker.compose.project.working_dir"}} config_files={{index .Config.Labels "com.docker.compose.project.config_files"}} ports={{json .NetworkSettings.Ports}}' \
      "$container_id"
  done < <(docker ps -aq --no-trunc)
  docker ps -a --no-trunc --format 'id={{.ID}} name={{.Names}} status={{.Status}}'
fi

section networks
if command -v docker >/dev/null 2>&1; then
  while IFS= read -r network_id; do
    docker network inspect --format \
      'id={{.Id}} name={{.Name}} driver={{.Driver}} project={{index .Labels "com.docker.compose.project"}} network={{index .Labels "com.docker.compose.network"}} containers={{json .Containers}}' \
      "$network_id"
  done < <(docker network ls -q --no-trunc)
fi

section volumes
if command -v docker >/dev/null 2>&1; then
  while IFS= read -r volume_name; do
    docker volume inspect --format \
      'name={{.Name}} driver={{.Driver}} project={{index .Labels "com.docker.compose.project"}} volume={{index .Labels "com.docker.compose.volume"}} mountpoint={{.Mountpoint}}' \
      "$volume_name"
  done < <(docker volume ls -q)
fi

section fluxpost-root
if [[ -e /opt/fluxpost-studio || -L /opt/fluxpost-studio ]]; then
  stat -c 'path=%n type=%F owner=%U:%G mode=%a inode=%i' /opt/fluxpost-studio
  find /opt/fluxpost-studio -maxdepth 3 -printf '%y %p -> %l\n' 2>/dev/null | sort
else
  printf '/opt/fluxpost-studio=absent\n'
fi
