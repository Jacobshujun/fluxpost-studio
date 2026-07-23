#!/usr/bin/env bash
set -euo pipefail

VERIFIER_SCRIPT_VERSION="1"
APP_ROOT="${APP_ROOT:-/opt/fluxpost-studio}"
REPO_URL="${REPO_URL:-https://github.com/Jacobshujun/fluxpost-studio.git}"
BRANCH="${BRANCH:-main}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-fluxpost}"
REPO_DIR="$APP_ROOT/repo"
CANDIDATES_DIR="$APP_ROOT/candidates"
VERIFICATIONS_DIR="$APP_ROOT/verifications"
REQUESTED_REF="${VERIFY_REF:-$BRANCH}"
CHECK_ONLY="false"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
CANDIDATE_DIR=""
MANIFEST_TEMP=""

log() {
  printf '[verify-candidate] %s\n' "$*"
}

fail() {
  printf '[verify-candidate] %s\n' "$*" >&2
  exit 1
}

usage() {
  printf 'usage: %s [--check] [--ref <branch|tag|commit>]\n' "$0"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "missing command: $1"
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

is_valid_commit() {
  [[ "$1" =~ ^[0-9a-f]{40}$ ]]
}

cleanup() {
  if [ -n "$MANIFEST_TEMP" ]; then
    case "$MANIFEST_TEMP" in
      "$VERIFICATIONS_DIR"/.manifest.*) rm -f -- "$MANIFEST_TEMP" ;;
    esac
  fi
  if [ -n "$CANDIDATE_DIR" ]; then
    case "$CANDIDATE_DIR" in
      "$CANDIDATES_DIR"/*) rm -rf -- "$CANDIDATE_DIR" ;;
    esac
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --check) CHECK_ONLY="true"; shift ;;
    --ref) [ "$#" -ge 2 ] || fail "--ref requires a value"; REQUESTED_REF="$2"; shift 2 ;;
    --help) usage; exit 0 ;;
    *) usage >&2; fail "unknown option: $1" ;;
  esac
done

is_valid_requested_ref "$REQUESTED_REF" || fail "invalid verification ref: $REQUESTED_REF"
[[ "$PROJECT_NAME" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || fail "COMPOSE_PROJECT_NAME contains unsupported characters"
case "$APP_ROOT" in
  ""|/|/opt|/usr|/var|/home) fail "APP_ROOT must be a dedicated absolute directory" ;;
  /*) ;;
  *) fail "APP_ROOT must be an absolute path" ;;
esac

if [ "$CHECK_ONLY" = "true" ]; then
  printf 'action=verify-candidate\n'
  printf 'verifier_script_version=%s\n' "$VERIFIER_SCRIPT_VERSION"
  printf 'requested_ref=%s\n' "$REQUESTED_REF"
  printf 'app_root=%s\n' "$APP_ROOT"
  printf 'docker_target=verification\n'
  printf 'reads_environment=false\n'
  printf 'mounts_runtime_volumes=false\n'
  printf 'activates_services=false\n'
  exit 0
fi

[ "$(id -u)" -eq 0 ] || fail "run candidate verification with sudo or as root"
require_cmd docker
require_cmd flock
require_cmd git
require_cmd tar

mkdir -p "$APP_ROOT" "$CANDIDATES_DIR" "$VERIFICATIONS_DIR"
exec 9>"$APP_ROOT/.operation.lock"
flock -n 9 || fail "another FluxPost deployment or verification operation is active"

if [ ! -d "$REPO_DIR/.git" ]; then
  if [ -e "$REPO_DIR" ]; then
    fail "$REPO_DIR exists but is not a Git repository"
  fi
  log "cloning $REPO_URL"
  git clone --no-checkout "$REPO_URL" "$REPO_DIR"
else
  git -C "$REPO_DIR" remote set-url origin "$REPO_URL"
fi

log "fetching $REQUESTED_REF"
git -C "$REPO_DIR" fetch --force --tags origin "$REQUESTED_REF"
COMMIT="$(git -C "$REPO_DIR" rev-parse --verify "FETCH_HEAD^{commit}")"
is_valid_commit "$COMMIT" || fail "resolved verification commit is invalid"
git -C "$REPO_DIR" checkout --detach --force "$COMMIT"

CANDIDATE_DIR="$CANDIDATES_DIR/${TIMESTAMP}-${COMMIT:0:12}"
[ ! -e "$CANDIDATE_DIR" ] || fail "candidate directory already exists: $CANDIDATE_DIR"
mkdir -p "$CANDIDATE_DIR"
trap cleanup EXIT

log "creating clean candidate archive for $COMMIT"
git -C "$REPO_DIR" archive "$COMMIT" | tar -x -C "$CANDIDATE_DIR"

VERIFICATION_IMAGE="${PROJECT_NAME}-verification:${COMMIT}"
log "running full offline verification for $COMMIT"
docker build --target verification --tag "$VERIFICATION_IMAGE" "$CANDIDATE_DIR"
IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$VERIFICATION_IMAGE")"
[ -n "$IMAGE_ID" ] || fail "verification build did not produce an image"

MANIFEST="$VERIFICATIONS_DIR/$COMMIT.manifest"
MANIFEST_TEMP="$(mktemp "$VERIFICATIONS_DIR/.manifest.XXXXXX")"
{
  printf 'format=1\n'
  printf 'result=passed\n'
  printf 'commit=%s\n' "$COMMIT"
  printf 'requested_ref=%s\n' "$REQUESTED_REF"
  printf 'image=%s\n' "$VERIFICATION_IMAGE"
  printf 'image_id=%s\n' "$IMAGE_ID"
  printf 'verified_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'verifier_script_version=%s\n' "$VERIFIER_SCRIPT_VERSION"
} > "$MANIFEST_TEMP"
chmod 0644 "$MANIFEST_TEMP"
mv -f "$MANIFEST_TEMP" "$MANIFEST"
MANIFEST_TEMP=""

log "verified commit $COMMIT"
printf 'verified_commit=%s\n' "$COMMIT"
printf 'verification_manifest=%s\n' "$MANIFEST"
