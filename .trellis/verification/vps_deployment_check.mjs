import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const yaml = require("js-yaml");

const projectRoot = process.cwd();
const files = {
  compose: read("compose.yaml"),
  envExample: read("deploy/env.production.example"),
  deploy: read("scripts/deploy/vps-deploy.sh"),
  bootstrap: read("scripts/deploy/vps-bootstrap.sh"),
  domain: read("scripts/deploy/vps-enable-domain.sh"),
  verifier: read("scripts/deploy/vps-verify-candidate.sh"),
  dockerfile: read("Dockerfile"),
  docs: read("docs/deployment/ubuntu-docker.md"),
};
const composeDocument = yaml.load(files.compose);

if (!composeDocument || typeof composeDocument !== "object") throw new Error("compose.yaml must parse as YAML.");
const services = composeDocument.services || {};
const appPorts = services.app?.ports || [];
const proxyCommand = services.proxy?.command || [];
if (appPorts[0] !== "127.0.0.1:${FLUXPOST_APP_PORT:-3101}:3000") {
  throw new Error(`Parsed app port must stay loopback-only, got ${String(appPorts[0])}.`);
}
if (!Array.isArray(proxyCommand) || proxyCommand.join(" ") !== "caddy reverse-proxy --from ${FLUXPOST_PUBLIC_HOST:-bbs.vollov1.xyz} --to app:3000") {
  throw new Error("Parsed Caddy command must use the configurable public hostname.");
}
if (services.proxy?.ports?.join(",") !== "80:80,443:443") {
  throw new Error("Parsed Caddy service must expose only ports 80 and 443.");
}

assertContains(files.compose, /127\.0\.0\.1:\$\{FLUXPOST_APP_PORT:-3101\}:3000/, "App port must remain loopback-only and configurable.");
assertNotContains(files.compose, /0\.0\.0\.0:\$\{FLUXPOST_APP_PORT/, "Configurable app port must never bind publicly.");
assertContains(files.compose, /\$\{FLUXPOST_PUBLIC_HOST:-bbs\.vollov1\.xyz\}/, "Caddy host must be configurable with the existing production default.");
assertContains(files.compose, /"80:80"[\s\S]*"443:443"/, "Caddy must keep HTTP/HTTPS ports for domain mode.");

for (const volume of [
  "fluxpost-postgres-data",
  "fluxpost-config",
  "fluxpost-data",
  "fluxpost-public-media",
  "fluxpost-public-generated",
  "fluxpost-node-home",
  "fluxpost-caddy-data",
  "fluxpost-caddy-config",
]) {
  assertContains(files.compose, new RegExp(`\\n\\s{2}${volume}:`), `Compose must preserve named volume ${volume}.`);
}

assertContains(files.deploy, /PROXY_ENABLED="\$\(normalize_bool "\$\{PROXY_VALUE:-true\}"\)"/, "Existing installations must default HTTPS proxy mode on.");
assertContains(files.deploy, /PUBLIC_HOST="\$\{PUBLIC_HOST:-bbs\.vollov1\.xyz\}"/, "Existing installations must retain the current public host default.");
assertContains(files.deploy, /APP_PORT="\$\{APP_PORT:-3101\}"/, "Existing installations must retain app port 3101.");
assertContains(files.deploy, /DEPLOY_SCRIPT_VERSION="3"/, "Deploy must expose the remote-first wrapper contract.");
assertContains(files.deploy, /--ref\)\s*\[ "\$#" -ge 2 \][\s\S]*REQUESTED_REF="\$2"/, "Deploy must accept an explicit Git ref.");
assertContains(files.deploy, /git -C "\$REPO_DIR" rev-parse --verify "FETCH_HEAD\^\{commit\}"/, "Deploy must resolve the fetched ref to a full commit.");
assertContains(files.deploy, /git -C "\$REPO_DIR" archive "\$COMMIT"/, "Release archives must use the resolved commit, not a moving branch.");
assertContains(files.deploy, /IMMUTABLE_IMAGE=.*\$\{COMMIT\}/, "Deploy must tag each app image with its full commit.");
assertContains(files.deploy, /docker image inspect --format '\{\{\.Id\}\}' "\$COMPOSE_APP_IMAGE"/, "Deploy must resolve the freshly built canonical image instead of the current container image.");
assertContains(files.deploy, /release\.manifest/, "Deploy must persist a non-secret release manifest.");
assertContains(files.deploy, /--rollback\)\s*\[ "\$#" -ge 2 \][\s\S]*ROLLBACK_RELEASE="\$2"/, "Deploy must accept an explicit release rollback.");
assertContains(files.deploy, /if ! activate_release[\s\S]*rollback_release/, "A failed activation must restore the previous release.");
assertContains(files.deploy, /else[\s\S]*compose stop app postgres proxy[\s\S]*new release failed health checks/, "A first-release health failure must stop the incomplete services without deleting volumes.");
assertContains(files.deploy, /docker image tag "\$immutable_image" "\$COMPOSE_APP_IMAGE"/, "Activation must retag the recorded immutable image for legacy Compose releases.");
assertContains(files.deploy, /docker compose --env-file "\$ENV_FILE"/, "Compose interpolation must use the persistent production env file.");
assertContains(files.deploy, /if \[ "\$CHECK_ONLY" = "true" \][\s\S]*mode=%s[\s\S]*services=%s/, "Deploy must expose a non-mutating mode check.");
assertContains(files.deploy, /if \[ "\$PROXY_ENABLED" = "true" \][\s\S]*compose up -d --no-build proxy[\s\S]*else[\s\S]*compose stop proxy[\s\S]*compose up -d --no-build --force-recreate app/, "Deploy must distinguish HTTPS and private service startup.");
assertContains(files.deploy, /if \[ "\$PROXY_ENABLED" = "false" \][\s\S]*return 0[\s\S]*curl -fsS "\$PUBLIC_HEALTH_URL"/, "Public health must run only when proxy mode is enabled.");
assertContains(files.deploy, /install -m 0755 .*vps-deploy\.sh.*"\$BIN_DIR\/deploy\.sh"/, "Deploy must refresh its installed wrapper for future updates.");
assertContains(files.deploy, /install -m 0755 .*vps-enable-domain\.sh.*"\$BIN_DIR\/enable-domain\.sh"/, "Deploy must refresh the domain wrapper.");
assertContains(files.deploy, /install -m 0755 .*vps-verify-candidate\.sh.*"\$BIN_DIR\/verify-candidate\.sh"/, "Deploy must install the versioned candidate verifier.");
assertContains(files.deploy, /flock -n 9 \|\| fail "another FluxPost deployment or verification operation is active"/, "Deploy and verification must share an exclusive operation lock.");
assertNotContains(files.deploy, /(?:source|\.)\s+"?\$ENV_FILE/, "Deploy must not execute the application environment file as shell code.");

assertContains(files.bootstrap, /APP_ONLY.*!= "true"[\s\S]*this installer supports Ubuntu 24\.04 only/, "Full bootstrap must enforce the supported Ubuntu release while app-only mode reuses an existing Linux host.");
assertContains(files.bootstrap, /\[ "\$\(id -u\)" -eq 0 \]/, "Bootstrap must require root.");
assertContains(files.bootstrap, /--admin-user/, "Bootstrap must require the first administrator username.");
assertContains(files.bootstrap, /--ref\)\s*\[ "\$#" -ge 2 \][\s\S]*REQUESTED_REF="\$2"/, "Bootstrap must accept an explicit Git ref.");
assertContains(files.bootstrap, /--app-only\)\s*APP_ONLY="true"/, "Bootstrap must provide a host-preserving app-only mode.");
assertContains(files.bootstrap, /if \[ "\$APP_ONLY" = "true" \][\s\S]*require_cmd docker[\s\S]*else[\s\S]*apt-get update/, "App-only bootstrap must verify existing tools instead of installing packages.");
assertContains(files.bootstrap, /LOCAL_DEPLOY_SCRIPT=.*vps-deploy\.sh/, "Bootstrap must support an adjacent versioned deploy wrapper for older target commits.");
assertContains(files.bootstrap, /LOCAL_VERIFY_SCRIPT=.*vps-verify-candidate\.sh/, "Bootstrap must support an adjacent candidate verifier.");
assertContains(files.bootstrap, /install -m 0755 .*verify-candidate\.sh/, "Bootstrap must install the candidate verifier.");
assertContains(files.bootstrap, /--credentials-file\)\s*\[ "\$#" -ge 2 \][\s\S]*CREDENTIALS_FILE="\$2"/, "Bootstrap must support root-only credential output without logging the setup key.");
assertContains(files.bootstrap, /chmod 0600 "\$CREDENTIALS_FILE"/, "Bootstrap credential files must be root-only.");
assertContains(files.bootstrap, /https:\/\/download\.docker\.com\/linux\/ubuntu/, "Bootstrap must install Docker from the official Ubuntu repository.");
assertContains(files.bootstrap, /openssl rand -hex 32/, "Bootstrap must generate a strong PostgreSQL password.");
assertContains(files.bootstrap, /openssl rand -hex 24/, "Bootstrap must generate a strong first-admin setup key.");
assertContains(files.bootstrap, /chmod 0600 "\$TEMP_ENV"/, "New production configuration must be mode 0600 before activation.");
assertContains(files.bootstrap, /FLUXPOST_PROXY_ENABLED "\$\(\[ -n "\$PUBLIC_HOST" \]/, "Bootstrap must keep proxy off when no domain is supplied.");
assertContains(files.bootstrap, /WORKSPACE_ALLOWED_USERS "\$ADMIN_USER"[\s\S]*WORKSPACE_ADMIN_USERS "\$ADMIN_USER"/, "Bootstrap must seed the requested whitelist administrator.");
assertContains(files.bootstrap, /keeping existing .* and all current secrets/, "Bootstrap reruns must preserve existing production configuration.");
assertContains(files.bootstrap, /"\$BIN_DIR\/deploy\.sh"/, "Bootstrap must finish through the standard deploy wrapper.");

assertContains(files.domain, /hostname must not contain a scheme, path, port, underscore, or invalid DNS label/, "Domain command must validate the hostname boundary.");
assertContains(files.domain, /getent ahosts "\$DOMAIN"/, "Domain command must require working DNS resolution.");
assertContains(files.domain, /set_env_value "\$ENV_FILE" FLUXPOST_PUBLIC_HOST "\$DOMAIN"/, "Domain command must persist the public host.");
assertContains(files.domain, /set_env_value "\$ENV_FILE" FLUXPOST_PROXY_ENABLED true/, "Domain command must enable proxy mode.");
assertContains(files.domain, /APP_ROOT="\$APP_ROOT" "\$DEPLOY_SCRIPT"/, "Domain command must reuse the standard deploy path.");

assertContains(files.verifier, /VERIFIER_SCRIPT_VERSION="1"/, "Candidate verification must expose a versioned wrapper contract.");
assertContains(files.verifier, /--ref\)\s*\[ "\$#" -ge 2 \][\s\S]*REQUESTED_REF="\$2"/, "Candidate verification must accept an explicit Git ref.");
assertContains(files.verifier, /docker build --target verification --tag "\$VERIFICATION_IMAGE" "\$CANDIDATE_DIR"/, "Candidate verification must run the isolated Docker verification target.");
assertContains(files.verifier, /git -C "\$REPO_DIR" archive "\$COMMIT" \| tar -x -C "\$CANDIDATE_DIR"/, "Candidate verification must use a clean commit archive.");
assertContains(files.verifier, /result=passed[\s\S]*commit=%s[\s\S]*image_id=%s/, "A successful verification manifest must bind its commit and image.");
assertContains(files.verifier, /flock -n 9 \|\| fail "another FluxPost deployment or verification operation is active"/, "Candidate verification must share the deployment operation lock.");
assertNotContains(files.verifier, /env\.production|ENV_FILE|docker compose|compose up|\/current|fluxpost-(?:postgres|config|data|public|node|caddy)/, "Candidate verification must not read deployment config, mount runtime state, or activate services.");
assertContains(files.dockerfile, /FROM deps AS verification[\s\S]*RUN node \.trellis\/verification\/check\.mjs/, "Docker must expose the cross-platform offline verification target.");

for (const [name, source] of Object.entries({ deploy: files.deploy, bootstrap: files.bootstrap, domain: files.domain, verifier: files.verifier })) {
  assertNotContains(source, /docker(?:\s+compose| compose)[^\n]*(?:down\s+-v|down\s+--volumes)/, `${name} script must never remove Docker volumes.`);
  assertNotContains(source, /docker\s+(?:system|volume|image|container)\s+prune/, `${name} script must never run a global Docker prune.`);
  assertNotContains(source, /systemctl\s+(?:restart|stop)\s+docker/, `${name} script must not interrupt unrelated Docker workloads.`);
  assertNotContains(source, /\b(?:ufw|iptables|nft|firewall-cmd)\b/, `${name} script must not modify firewall rules.`);
  assertNotContains(source, /sshd_config|systemctl\s+(?:restart|reload)\s+ssh/, `${name} script must not modify SSH.`);
}

for (const value of ["change-this-long-random-password", "change-this-first-admin-setup-key"]) {
  assertNotContains(files.bootstrap, new RegExp(value), "Bootstrap must not install example placeholder secrets.");
}

assertContains(files.docs, /vps-bootstrap\.sh[\s\S]*--admin-user/, "Deployment docs must show the bootstrap entry command.");
assertContains(files.docs, /apt-get install -y curl[\s\S]*raw\.githubusercontent\.com[\s\S]*vps-bootstrap\.sh/, "One-paste install must work even when a minimal Ubuntu image lacks curl.");
assertContains(files.docs, /ssh -L 3101:127\.0\.0\.1:3101/, "Deployment docs must explain the Windows SSH tunnel.");
assertContains(files.docs, /enable-domain\.sh/, "Deployment docs must explain later HTTPS enablement.");
assertContains(files.docs, /verify-candidate\.sh --ref CANDIDATE_REF[\s\S]*deploy\.sh --ref FULL_40_CHARACTER_COMMIT/, "Deployment docs must require candidate verification before staging activation.");
assertContains(files.docs, /104\.243\.21\.233[\s\S]*38\.76\.210\.136/, "Deployment docs must identify staging before production promotion.");
assertContains(files.docs, /docker compose down -v/, "Deployment docs must explicitly warn against deleting volumes.");
assertContains(files.docs, /up -d postgres app[\s\S]*preserves private mode/, "Rollback docs must not accidentally expose a private deployment through Caddy.");

checkBashSyntax([
  "scripts/deploy/vps-deploy.sh",
  "scripts/deploy/vps-bootstrap.sh",
  "scripts/deploy/vps-enable-domain.sh",
  "scripts/deploy/vps-verify-candidate.sh",
]);
checkDeployModes();
checkPinnedReleaseAndAutomaticRollback();
checkCandidateVerification();

console.log("Ubuntu VPS deployment contract check passed.");

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assertContains(value, pattern, message) {
  if (!pattern.test(value)) throw new Error(message);
}

function assertNotContains(value, pattern, message) {
  if (pattern.test(value)) throw new Error(message);
}

function checkBashSyntax(relativePaths) {
  const bash = findBash();
  if (!bash) throw new Error("Bash is required for deployment script syntax verification.");
  const result = spawnSync(bash, ["-n", ...relativePaths], { cwd: projectRoot, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Bash syntax verification failed: ${(result.stderr || result.stdout).trim()}`);
  }
}

function checkDeployModes() {
  const bash = findBash();
  if (!bash) throw new Error("Bash is required for deployment mode verification.");
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "fluxpost-deploy-check-"));
  const sharedDir = path.join(tempRoot, "shared");
  mkdirSync(sharedDir, { recursive: true });
  try {
    const privatePlan = runPlan([
      "FLUXPOST_PROXY_ENABLED=false",
      "FLUXPOST_PUBLIC_HOST=",
      "FLUXPOST_APP_PORT=3123",
    ], ["--check", "--ref", "0123456789abcdef0123456789abcdef01234567"]);
    assertPlan(privatePlan, {
      mode: "private",
      services: "postgres app",
      app_port: "3123",
      local_health_url: "http://127.0.0.1:3123/api/config",
      requested_ref: "0123456789abcdef0123456789abcdef01234567",
    });
    if ("public_health_url" in privatePlan) throw new Error("Private deploy plan must not expose a public health target.");

    const httpsPlan = runPlan([
      "FLUXPOST_PROXY_ENABLED=true",
      "FLUXPOST_PUBLIC_HOST=flux.example.com",
      "FLUXPOST_APP_PORT=3101",
    ]);
    assertPlan(httpsPlan, {
      mode: "https",
      services: "postgres app proxy",
      public_host: "flux.example.com",
      public_health_url: "https://flux.example.com/api/config",
    });

    const legacyPlan = runPlan(["POSTGRES_DB=fluxpost_studio"]);
    assertPlan(legacyPlan, {
      mode: "https",
      services: "postgres app proxy",
      app_port: "3101",
      public_host: "bbs.vollov1.xyz",
      public_health_url: "https://bbs.vollov1.xyz/api/config",
    });
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }

  function runPlan(lines, args = ["--check"]) {
    writeFileSync(path.join(sharedDir, "env.production"), `${lines.join("\n")}\n`, { mode: 0o600 });
    const appRoot = process.platform === "win32" ? toGitBashPath(tempRoot) : tempRoot;
    const env = {
      ...process.env,
      APP_ROOT: appRoot,
      FLUXPOST_PROXY_ENABLED: "",
      FLUXPOST_PUBLIC_HOST: "",
      FLUXPOST_APP_PORT: "",
      LOCAL_HEALTH_URL: "",
      PUBLIC_HEALTH_URL: "",
    };
    const result = spawnSync(bash, ["scripts/deploy/vps-deploy.sh", ...args], { cwd: projectRoot, env, encoding: "utf8" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Deploy --check failed: ${(result.stderr || result.stdout).trim()}`);
    return Object.fromEntries(result.stdout.trim().split(/\r?\n/).map((line) => line.split(/=(.*)/s).slice(0, 2)));
  }
}

function checkPinnedReleaseAndAutomaticRollback() {
  const bash = findBash();
  if (!bash) throw new Error("Bash is required for deployment execution verification.");
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "fluxpost-deploy-execution-"));
  const appRoot = path.join(tempRoot, "app");
  const sharedDir = path.join(appRoot, "shared");
  const fakeBin = path.join(tempRoot, "fake-bin");
  const fakeState = path.join(tempRoot, "fake-state");
  const sourceRepo = createFixtureRepository(path.join(tempRoot, "source-repo"));
  mkdirSync(sharedDir, { recursive: true });
  mkdirSync(fakeBin, { recursive: true });
  mkdirSync(fakeState, { recursive: true });

  writeFileSync(path.join(sharedDir, "env.production"), [
    "FLUXPOST_PROXY_ENABLED=false",
    "FLUXPOST_PUBLIC_HOST=",
    "FLUXPOST_APP_PORT=3124",
    "POSTGRES_DB=fluxpost_studio",
  ].join("\n") + "\n", { mode: 0o600 });

  writeExecutable(path.join(fakeBin, "docker"), `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$FAKE_DOCKER_STATE/docker.log"
if [ "\${1:-}" = ps ]; then
  [ -f "$FAKE_DOCKER_STATE/running" ] && printf 'fake-app-container\\n'
  exit 0
fi
if [ "\${1:-}" = inspect ]; then
  cat "$FAKE_DOCKER_STATE/current-image"
  exit 0
fi
if [ "\${1:-}" = image ] && [ "\${2:-}" = inspect ]; then
  if [ "\${3:-}" = --format ]; then
    printf 'sha256:fake-built-image\\n'
  fi
  exit 0
fi
if [ "\${1:-}" = image ] && [ "\${2:-}" = tag ]; then
  if [[ "\${4:-}" == *:latest ]]; then
    printf '%s\\n' "\${3:-}" > "$FAKE_DOCKER_STATE/current-image"
  fi
  exit 0
fi
if [ "\${1:-}" = compose ]; then
  case " $* " in
    *" images -q app "*) printf 'sha256:fake-built-image\\n' ;;
    *" up "*" app "*) touch "$FAKE_DOCKER_STATE/running" ;;
  esac
  exit 0
fi
exit 0
`);
  writeExecutable(path.join(fakeBin, "curl"), `#!/usr/bin/env bash
set -euo pipefail
current="$(cat "$FAKE_DOCKER_STATE/current-image" 2>/dev/null || true)"
if [ -n "\${FAKE_FAIL_COMMIT:-}" ] && [[ "$current" == *"$FAKE_FAIL_COMMIT"* ]]; then
  exit 22
fi
exit 0
`);
  writeExecutable(path.join(fakeBin, "sleep"), "#!/usr/bin/env bash\nexit 0\n");

  const runner = path.join(tempRoot, "run-deploy.sh");
  writeExecutable(runner, `#!/usr/bin/env bash
set -euo pipefail
export PATH="$FAKE_BIN:$PATH"
exec "$DEPLOY_SCRIPT" "$@"
`);

  const head = gitOutput(["rev-parse", "HEAD"], sourceRepo);
  const parent = gitOutput(["rev-parse", "HEAD^"], sourceRepo);
  const baseEnv = {
    ...process.env,
    APP_ROOT: toGitBashPath(appRoot),
    REPO_URL: toGitBashPath(sourceRepo),
    COMPOSE_PROJECT_NAME: "fluxpost",
    FAKE_BIN: toGitBashPath(fakeBin),
    FAKE_DOCKER_STATE: toGitBashPath(fakeState),
    DEPLOY_SCRIPT: toGitBashPath(path.join(projectRoot, "scripts/deploy/vps-deploy.sh")),
  };

  try {
    const first = spawnSync(bash, [toGitBashPath(runner), "--ref", head], { cwd: projectRoot, env: baseEnv, encoding: "utf8" });
    if (first.error) throw first.error;
    if (first.status !== 0) throw new Error(`Pinned deploy execution failed: ${(first.stderr || first.stdout).trim()}`);

    const releasesDir = path.join(appRoot, "releases");
    const firstRelease = readdirSync(releasesDir).find((name) => name.endsWith(head.slice(0, 12)));
    if (!firstRelease) throw new Error("Pinned deploy did not create a commit-addressed release.");
    const manifest = readFileSync(path.join(releasesDir, firstRelease, "release.manifest"), "utf8");
    if (!manifest.includes(`commit=${head}\n`) || !manifest.includes(`image=fluxpost-app:${head}\n`)) {
      throw new Error("Pinned deploy release manifest does not bind the commit and immutable image.");
    }

    // Git Bash on Windows cannot reliably expose its emulated symlink to Node;
    // the full activation/rollback path is exercised on the Linux staging host.
    if (process.platform === "win32") return;

    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1100);
    const second = spawnSync(bash, [toGitBashPath(runner), "--ref", parent], {
      cwd: projectRoot,
      env: { ...baseEnv, FAKE_FAIL_COMMIT: parent },
      encoding: "utf8",
    });
    if (second.status === 0) throw new Error("A release with failing health unexpectedly succeeded.");
    const currentResult = spawnSync(bash, ["-c", 'readlink -f "$1"', "_", toGitBashPath(path.join(appRoot, "current"))], { encoding: "utf8" });
    if (currentResult.status !== 0) throw new Error(`Cannot resolve current release: ${currentResult.stderr.trim()}`);
    const currentTarget = path.posix.basename(currentResult.stdout.trim());
    if (currentTarget !== firstRelease) {
      throw new Error(`Failed activation changed current from ${firstRelease} to ${currentTarget}.`);
    }
    const dockerLog = readFileSync(path.join(fakeState, "docker.log"), "utf8");
    if (!dockerLog.includes(`image tag fluxpost-app:${head} fluxpost-app:latest`) || !dockerLog.includes("rescue-")) {
      throw new Error("Automatic rollback did not reactivate the previous immutable image.");
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function checkCandidateVerification() {
  const bash = findBash();
  if (!bash) throw new Error("Bash is required for candidate verification checks.");
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "fluxpost-candidate-check-"));
  const appRoot = path.join(tempRoot, "app");
  const fakeBin = path.join(tempRoot, "fake-bin");
  const fakeState = path.join(tempRoot, "fake-state");
  const sourceRepo = createFixtureRepository(path.join(tempRoot, "source-repo"));
  mkdirSync(fakeBin, { recursive: true });
  mkdirSync(fakeState, { recursive: true });

  writeExecutable(path.join(fakeBin, "id"), `#!/usr/bin/env bash
if [ "\${1:-}" = "-u" ]; then
  printf '0\\n'
  exit 0
fi
exec /usr/bin/id "$@"
`);
  writeExecutable(path.join(fakeBin, "docker"), `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$FAKE_DOCKER_STATE/docker.log"
if [ "\${1:-}" = build ]; then
  [ "\${FAKE_VERIFY_FAIL:-false}" != true ] || exit 42
  exit 0
fi
if [ "\${1:-}" = image ] && [ "\${2:-}" = inspect ]; then
  printf 'sha256:verified-candidate-image\\n'
  exit 0
fi
exit 1
`);
  const runner = path.join(tempRoot, "run-verifier.sh");
  writeExecutable(runner, `#!/usr/bin/env bash
set -euo pipefail
export PATH="$FAKE_BIN:$PATH"
exec "$VERIFIER_SCRIPT" "$@"
`);

  const head = gitOutput(["rev-parse", "HEAD"], sourceRepo);
  const baseEnv = {
    ...process.env,
    APP_ROOT: toGitBashPath(appRoot),
    REPO_URL: toGitBashPath(sourceRepo),
    COMPOSE_PROJECT_NAME: "fluxpost",
    FAKE_BIN: toGitBashPath(fakeBin),
    FAKE_DOCKER_STATE: toGitBashPath(fakeState),
    VERIFIER_SCRIPT: toGitBashPath(path.join(projectRoot, "scripts/deploy/vps-verify-candidate.sh")),
  };
  const verifier = toGitBashPath(runner);

  try {
    const plan = spawnSync(bash, [verifier, "--check", "--ref", head], { cwd: projectRoot, env: baseEnv, encoding: "utf8" });
    if (plan.error) throw plan.error;
    if (plan.status !== 0 || !plan.stdout.includes("activates_services=false")) {
      throw new Error(`Candidate verification check mode failed: ${(plan.stderr || plan.stdout).trim()}`);
    }
    const invalid = spawnSync(bash, [verifier, "--check", "--ref", "../invalid"], { cwd: projectRoot, env: baseEnv, encoding: "utf8" });
    if (invalid.status === 0) throw new Error("Candidate verifier accepted an unsafe Git ref.");

    const failed = spawnSync(bash, [verifier, "--ref", head], {
      cwd: projectRoot,
      env: { ...baseEnv, FAKE_VERIFY_FAIL: "true" },
      encoding: "utf8",
    });
    if (failed.status === 0) throw new Error("Candidate verification unexpectedly passed after Docker failure.");
    if (existsSync(path.join(appRoot, "verifications", `${head}.manifest`))) {
      throw new Error("Failed candidate verification wrote a passing manifest.");
    }
    if (existsSync(path.join(appRoot, "current"))) {
      throw new Error("Candidate verification changed the active release.");
    }

    const passed = spawnSync(bash, [verifier, "--ref", head], { cwd: projectRoot, env: baseEnv, encoding: "utf8" });
    if (passed.error) throw passed.error;
    if (passed.status !== 0) throw new Error(`Candidate verification execution failed: ${(passed.stderr || passed.stdout).trim()}`);
    const manifest = readFileSync(path.join(appRoot, "verifications", `${head}.manifest`), "utf8");
    if (!manifest.includes("result=passed\n") || !manifest.includes(`commit=${head}\n`) || !manifest.includes("image_id=sha256:verified-candidate-image\n")) {
      throw new Error("Candidate verification manifest does not bind the successful commit and image.");
    }
    const dockerLog = readFileSync(path.join(fakeState, "docker.log"), "utf8");
    if (!dockerLog.includes("build --target verification") || dockerLog.includes(" compose ")) {
      throw new Error("Candidate verification did not stay inside the isolated Docker target.");
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function createFixtureRepository(repoRoot) {
  mkdirSync(path.join(repoRoot, "scripts", "deploy"), { recursive: true });
  writeFileSync(path.join(repoRoot, "compose.yaml"), files.compose, "utf8");
  writeFileSync(path.join(repoRoot, "scripts", "deploy", "vps-deploy.sh"), files.deploy, "utf8");
  writeFileSync(path.join(repoRoot, "scripts", "deploy", "vps-enable-domain.sh"), files.domain, "utf8");
  writeFileSync(path.join(repoRoot, "scripts", "deploy", "vps-verify-candidate.sh"), files.verifier, "utf8");
  gitOutput(["init", "-b", "main"], repoRoot);
  gitOutput(["config", "user.name", "FluxPost Verification"], repoRoot);
  gitOutput(["config", "user.email", "verification@example.invalid"], repoRoot);
  gitOutput(["add", "."], repoRoot);
  gitOutput(["commit", "-m", "fixture parent"], repoRoot);
  writeFileSync(path.join(repoRoot, "fixture-version.txt"), "2\n", "utf8");
  gitOutput(["add", "fixture-version.txt"], repoRoot);
  gitOutput(["commit", "-m", "fixture head"], repoRoot);
  return repoRoot;
}

function writeExecutable(filePath, contents) {
  writeFileSync(filePath, contents.replaceAll("\r\n", "\n"), "utf8");
  chmodSync(filePath, 0o755);
}

function gitOutput(args, cwd = projectRoot) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

function assertPlan(actual, expected) {
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) throw new Error(`Deploy plan ${key} expected ${value}, got ${String(actual[key])}.`);
  }
}

function findBash() {
  const candidates = process.platform === "win32"
    ? ["C:\\Program Files\\Git\\bin\\bash.exe", "C:\\Program Files\\Git\\usr\\bin\\bash.exe"]
    : ["/bin/bash", "/usr/bin/bash"];
  return candidates.find((candidate) => existsSync(candidate));
}

function toGitBashPath(value) {
  return value.replace(/^([A-Za-z]):\\/, (_match, drive) => `/${drive.toLowerCase()}/`).replaceAll("\\", "/");
}
