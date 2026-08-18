import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const projectRoot = process.cwd();
const fullSha = "1234567890abcdef1234567890abcdef12345678";

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function loadTsModule(relativePath) {
  const sourcePath = path.join(projectRoot, relativePath);
  const output = ts.transpileModule(read(relativePath), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  });
  const cjsModule = { exports: {} };
  vm.runInNewContext(output.outputText, {
    module: cjsModule,
    exports: cjsModule.exports,
    process: { env: {} },
  }, { filename: sourcePath });
  return cjsModule.exports;
}

const release = loadTsModule("src/lib/runtime-release.ts");

assert.deepEqual(
  project(release.resolveRuntimeReleaseIdentity({ FLUXPOST_RUNTIME_MODE: "production", FLUXPOST_RELEASE_SHA: fullSha })),
  { commit: fullSha, mode: "production", versioned: true },
);
assert.deepEqual(
  project(release.resolveRuntimeReleaseIdentity({ FLUXPOST_RUNTIME_MODE: "candidate", FLUXPOST_RELEASE_SHA: fullSha })),
  { commit: fullSha, mode: "candidate", versioned: true },
);
assert.deepEqual(
  project(release.resolveRuntimeReleaseIdentity({})),
  { commit: null, mode: "development", versioned: false },
);
assert.deepEqual(
  project(release.resolveRuntimeReleaseIdentity({ FLUXPOST_RUNTIME_MODE: "development", FLUXPOST_RELEASE_SHA: fullSha })),
  { commit: fullSha, mode: "development", versioned: true },
);

for (const environment of [
  { FLUXPOST_RUNTIME_MODE: "production" },
  { FLUXPOST_RUNTIME_MODE: "candidate" },
  { FLUXPOST_RUNTIME_MODE: "preview", FLUXPOST_RELEASE_SHA: fullSha },
  { FLUXPOST_RUNTIME_MODE: "production", FLUXPOST_RELEASE_SHA: fullSha.toUpperCase() },
  { FLUXPOST_RUNTIME_MODE: "production", FLUXPOST_RELEASE_SHA: fullSha.slice(1) },
  { FLUXPOST_RUNTIME_MODE: "production", FLUXPOST_RELEASE_SHA: `${fullSha}0` },
]) {
  assert.throws(() => release.resolveRuntimeReleaseIdentity(environment), release.RuntimeReleaseIdentityError);
}

const route = read("src/app/api/version/route.ts");
assert.match(route, /resolveRuntimeReleaseIdentity/);
assert.match(route, /Cache-Control["']?\s*:\s*["'](?:private,\s*)?no-store["']/);
assert.match(route, /X-Content-Type-Options["']?\s*:\s*["']nosniff["']/);
assert.doesNotMatch(route, /getConfigStatus|process\.cwd|branch|hostname|env\.local/i);

const packageJson = JSON.parse(read("package.json"));
assert.equal(packageJson.scripts.dev, undefined);
assert.equal(packageJson.scripts["dev:lan"], undefined);
assert.match(packageJson.scripts.local, /scripts\/local\/restart\.ps1/);
assert.doesNotMatch(packageJson.scripts.local, /HostName/);
assert.match(packageJson.scripts["local:lan"], /scripts\/local\/restart\.ps1 -HostName 0\.0\.0\.0/);
assert.equal(packageJson.scripts["local:restart"], "npm run local");
assert.match(packageJson.scripts["local:parity"], /check-production-parity\.ps1/);
assert.equal(packageJson.scripts["start:lan"], "npm run local:lan");
assert.equal(existsSync(path.join(projectRoot, "scripts/local/start-dev.mjs")), false);
assert.equal(existsSync(path.join(projectRoot, "scripts/local/restart-dev.ps1")), false);

const restart = read("scripts/local/restart.ps1");
assert.match(restart, /\[string\]\$HostName\s*=\s*"127\.0\.0\.1"/);
assert.match(restart, /FLUXPOST_RUNTIME_MODE\s*=\s*"candidate"/);
assert.match(restart, /FLUXPOST_RELEASE_SHA\s*=\s*\$ReleaseSha/);
assert.match(restart, /ProjectRoot/);
assert.match(restart, /rev-parse HEAD/);
assert.match(restart, /git\.exe[\s\S]*status --porcelain/);
assertOrder(restart, "npm.cmd run build", "Stop existing server");
assertOrder(restart, "Candidate worktree became dirty during build", "Stop existing server");
assertOrder(restart, "Start-Process", "/api/version");
assert.match(restart, /http_smoke\.js[\s\S]*"candidate"[\s\S]*\$ReleaseSha/);
assert.doesNotMatch(restart, /MirrorRoot|current\.json|worktree add/);
assert.doesNotMatch(restart, /npm\.cmd ci/);
assert.doesNotMatch(restart, /FLUXPOST_DISABLE_BACKGROUND_WORKERS|FLUXPOST_DEVELOPMENT_WORKERS/);

const parity = read("scripts/local/check-production-parity.ps1");
assert.match(parity, /api\/version/);
assert.match(parity, /candidate/);
assert.match(parity, /production/);
assert.match(parity, /status --porcelain/);
assert.match(parity, /rev-parse HEAD/);
assert.match(parity, /origin\/main/);
assert.match(parity, /GitHub main SHA differs from remote production/);
assert.match(parity, /Local candidate HEAD differs from GitHub main/);
assert.doesNotMatch(parity, /MirrorRoot|current\.json|releasePath/);

const baseline = read(".trellis/verification/check.mjs");
assert.match(baseline, /\["Runtime production parity check",\s*"runtime_parity_check\.mjs"\]/);
assert.match(baseline, /FLUXPOST_RUNTIME_MODE:\s*"development"[\s\S]*FLUXPOST_RELEASE_SHA:\s*""/);
const httpSmoke = read(".trellis/verification/http_smoke.js");
assert.match(httpSmoke, /expectJson\("\/api\/version"/);
assert.match(httpSmoke, /expectedRuntimeMode[\s\S]*development/);
assert.match(httpSmoke, /version\.mode[\s\S]*expectedRuntimeMode/);
assert.match(httpSmoke, /version\.commit[\s\S]*expectedReleaseSha/);

console.log("Runtime release identity and parity contract check passed.");

function project(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertOrder(source, first, second) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert.ok(firstIndex >= 0, `Missing ordered marker: ${first}`);
  assert.ok(secondIndex > firstIndex, `${second} must appear after ${first}`);
}
