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
const nextConfig = read("next.config.ts");
const gitignore = read(".gitignore");
const eslintConfig = read("eslint.config.mjs");
assert.match(nextConfig, /FLUXPOST_NEXT_DIST_DIR/);
assert.match(nextConfig, /\.next-local-a/);
assert.match(nextConfig, /\.next-local-b/);
assert.match(nextConfig, /distDir:\s*requestedDistDir/);
assert.match(nextConfig, /must select a managed local build slot/);
const tsconfig = JSON.parse(read("tsconfig.json"));
for (const slot of [".next-local-a", ".next-local-b"]) {
  assert.ok(tsconfig.include.includes(`${slot}/types/**/*.ts`));
  assert.ok(tsconfig.include.includes(`${slot}/dev/types/**/*.ts`));
}
assert.match(gitignore, /\/\.next-local-a\//);
assert.match(gitignore, /\/\.next-local-b\//);
assert.match(gitignore, /\/\.fluxpost-local-candidate\.json/);
assert.match(gitignore, /\/\.fluxpost-local-candidate\.json\.tmp/);
assert.match(eslintConfig, /\.next-local-a\/\*\*/);
assert.match(eslintConfig, /\.next-local-b\/\*\*/);
assert.match(restart, /\[string\]\$HostName\s*=\s*"127\.0\.0\.1"/);
assert.match(restart, /FLUXPOST_RUNTIME_MODE\s*=\s*"candidate"/);
assert.match(restart, /FLUXPOST_RELEASE_SHA\s*=\s*\$ReleaseSha/);
assert.match(restart, /ProjectRoot/);
assert.match(restart, /rev-parse --path-format=absolute --git-common-dir/);
assert.match(restart, /Local candidate must run from the primary Git worktree/);
assert.match(restart, /rev-parse HEAD/);
assert.match(restart, /git\.exe[\s\S]*status --porcelain/);
assert.match(restart, /\.fluxpost-local-candidate\.json/);
assert.match(restart, /\.next-local-a/);
assert.match(restart, /\.next-local-b/);
assert.match(restart, /\.fluxpost-commit/);
assert.match(restart, /candidateBuildSha -eq \$candidateSha/);
assert.match(restart, /current primary-worktree \.next candidate as first-activation rollback/);
assert.match(restart, /Remove-Item Env:FLUXPOST_NEXT_DIST_DIR/);
assert.match(restart, /FLUXPOST_NEXT_DIST_DIR\s*=\s*\$targetSlot/);
assert.match(restart, /Start-CandidateServer/);
assert.match(restart, /Restore previous local candidate/);
assert.match(restart, /previous application was restored/);
assert.match(restart, /Move-Item[\s\S]*-Force/);
assert.match(restart, /listenerStopped/);
assertOrder(restart, "npm.cmd run build", "Replace existing server");
assertOrder(restart, "Candidate worktree became dirty during build", "Replace existing server");
assert.match(restart, /Start-Process[\s\S]*\$versionUrl\s*=\s*"http:\/\/127\.0\.0\.1:\$Port\/api\/version"/);
assert.match(restart, /http_smoke\.js[\s\S]*"candidate"[\s\S]*\$Commit/);
assert.doesNotMatch(restart, /MirrorRoot|current\.json|worktree add/);
assert.doesNotMatch(restart, /npm\.cmd ci/);
assert.doesNotMatch(restart, /FLUXPOST_DISABLE_BACKGROUND_WORKERS|FLUXPOST_DEVELOPMENT_WORKERS/);
assert.doesNotMatch(restart, /SkipBuild/);

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
