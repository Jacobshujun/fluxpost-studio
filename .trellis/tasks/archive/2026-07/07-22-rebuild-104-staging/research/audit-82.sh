#!/usr/bin/env bash
set -u

target="8ee3498e4c80bbca6b711e2eb2f3fecdd30faead"
current="$(readlink -f /opt/fluxpost-studio/current)"

printf 'current=%s\n' "$current"
printf 'repo_head=%s\n' "$(git -C /opt/fluxpost-studio/repo rev-parse HEAD)"
printf 'target_type=%s\n' "$(git -C /opt/fluxpost-studio/repo cat-file -t "$target")"

mismatch=0
count=0
while IFS= read -r -d '' record; do
  meta="${record%%$'\t'*}"
  path="${record#*$'\t'}"
  expected="${meta##* }"
  count=$((count + 1))
  if [[ ! -f "$current/$path" ]] || [[ "$(git hash-object "$current/$path")" != "$expected" ]]; then
    mismatch=$((mismatch + 1))
    printf 'release_mismatch=%s\n' "$path"
  fi
done < <(git -C /opt/fluxpost-studio/repo ls-tree -rz "$target")
printf 'tracked_files=%s mismatches=%s\n' "$count" "$mismatch"

while IFS= read -r container_id; do
  docker inspect --format \
    'container={{.Name}} id={{.Id}} image={{.Config.Image}} image_id={{.Image}} status={{.State.Status}} exit={{.State.ExitCode}} workdir={{index .Config.Labels "com.docker.compose.project.working_dir"}} config={{index .Config.Labels "com.docker.compose.project.config_files"}} service={{index .Config.Labels "com.docker.compose.service"}}' \
    "$container_id"
done < <(docker ps -aq --filter label=com.docker.compose.project=fluxpost)

docker image inspect fluxpost-app --format 'configured_image_id={{.Id}}' 2>/dev/null || true
