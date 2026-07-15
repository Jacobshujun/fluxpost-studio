import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
assertContains(files.deploy, /docker compose --env-file "\$ENV_FILE"/, "Compose interpolation must use the persistent production env file.");
assertContains(files.deploy, /if \[ "\$CHECK_ONLY" = "true" \][\s\S]*mode=%s[\s\S]*services=%s/, "Deploy must expose a non-mutating mode check.");
assertContains(files.deploy, /if \[ "\$PROXY_ENABLED" = "true" \][\s\S]*compose up -d[\s\S]*else[\s\S]*compose stop proxy[\s\S]*compose up -d postgres app/, "Deploy must distinguish HTTPS and private service startup.");
assertContains(files.deploy, /if \[ "\$PROXY_ENABLED" = "true" \][\s\S]*curl -fsS "\$PUBLIC_HEALTH_URL"/, "Public health must run only when proxy mode is enabled.");
assertContains(files.deploy, /install -m 0755 .*vps-deploy\.sh.*"\$BIN_DIR\/deploy\.sh"/, "Deploy must refresh its installed wrapper for future updates.");
assertContains(files.deploy, /install -m 0755 .*vps-enable-domain\.sh.*"\$BIN_DIR\/enable-domain\.sh"/, "Deploy must refresh the domain wrapper.");
assertNotContains(files.deploy, /(?:source|\.)\s+"?\$ENV_FILE/, "Deploy must not execute the application environment file as shell code.");

assertContains(files.bootstrap, /this installer supports Ubuntu 24\.04 only/, "Bootstrap must enforce the supported Ubuntu release.");
assertContains(files.bootstrap, /\[ "\$\(id -u\)" -eq 0 \]/, "Bootstrap must require root.");
assertContains(files.bootstrap, /--admin-user/, "Bootstrap must require the first administrator username.");
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

for (const [name, source] of Object.entries({ deploy: files.deploy, bootstrap: files.bootstrap, domain: files.domain })) {
  assertNotContains(source, /docker(?:\s+compose| compose)[^\n]*(?:down\s+-v|down\s+--volumes)/, `${name} script must never remove Docker volumes.`);
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
assertContains(files.docs, /docker compose down -v/, "Deployment docs must explicitly warn against deleting volumes.");
assertContains(files.docs, /up -d postgres app[\s\S]*preserves private mode/, "Rollback docs must not accidentally expose a private deployment through Caddy.");

checkBashSyntax([
  "scripts/deploy/vps-deploy.sh",
  "scripts/deploy/vps-bootstrap.sh",
  "scripts/deploy/vps-enable-domain.sh",
]);
checkDeployModes();

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
    ]);
    assertPlan(privatePlan, {
      mode: "private",
      services: "postgres app",
      app_port: "3123",
      local_health_url: "http://127.0.0.1:3123/api/config",
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

  function runPlan(lines) {
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
    const result = spawnSync(bash, ["scripts/deploy/vps-deploy.sh", "--check"], { cwd: projectRoot, env, encoding: "utf8" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Deploy --check failed: ${(result.stderr || result.stdout).trim()}`);
    return Object.fromEntries(result.stdout.trim().split(/\r?\n/).map((line) => line.split(/=(.*)/s).slice(0, 2)));
  }
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
