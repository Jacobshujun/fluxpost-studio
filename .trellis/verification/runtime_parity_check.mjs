import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
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
const proxyUriFunction = extractPowerShellFunction(restart, "ConvertTo-NodeProxyUri");
const windowsProxyFunction = extractPowerShellFunction(restart, "Get-WindowsProxyEnvironment");
const localProxyFunction = extractPowerShellFunction(restart, "Set-LocalProxyEnvironment");
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
assert.match(proxyUriFunction, /"http:\/\/\$proxyValue"/);
assert.match(proxyUriFunction, /@\("http",\s*"https"\)\s*-notcontains/);
assert.match(localProxyFunction, /\$explicitProxyNames\s*=\s*@\("HTTP_PROXY",\s*"HTTPS_PROXY",\s*"http_proxy",\s*"https_proxy"\)/);
assert.doesNotMatch(localProxyFunction, /ALL_PROXY|all_proxy/);
assert.match(localProxyFunction, /GetEnvironmentVariable\(\$proxyName,\s*"Process"\)/);
assert.match(localProxyFunction, /if \(-not \$hasExplicitProxy\)[\s\S]*Get-WindowsProxyEnvironment/);
assertOrder(localProxyFunction, "if (-not $hasExplicitProxy)", "$env:HTTP_PROXY = $windowsProxy.Http");
assertOrder(localProxyFunction, "if (-not $hasExplicitProxy)", "$env:HTTPS_PROXY = $windowsProxy.Https");
assert.match(windowsProxyFunction, /HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings/);
assert.match(windowsProxyFunction, /\[int\]\$internetSettings\.ProxyEnable\s+-ne\s+1/);
assert.match(windowsProxyFunction, /\$internetSettings\.ProxyServer/);
assert.match(windowsProxyFunction, /Http\s*=\s*\$proxyUri;\s*Https\s*=\s*\$proxyUri/);
assert.match(windowsProxyFunction, /\$proxyServer\.Contains\("="\)[\s\S]*-split\s+";"/);
assert.match(windowsProxyFunction, /\^\\s\*\(http\|https\)\\s\*=\\s\*/);
assert.match(windowsProxyFunction, /Http\s*=\s*\[string\]\$protocolProxies\["http"\][\s\S]*Https\s*=\s*\[string\]\$protocolProxies\["https"\]/);
assert.match(localProxyFunction, /\$env:HTTP_PROXY\s*=\s*\$windowsProxy\.Http/);
assert.match(localProxyFunction, /\$env:HTTPS_PROXY\s*=\s*\$windowsProxy\.Https/);
assert.match(localProxyFunction, /\$env:NODE_USE_ENV_PROXY\s*=\s*"1"/);
assert.match(localProxyFunction, /@\("NO_PROXY",\s*"no_proxy"\)/);
for (const localBypass of ["localhost", "127.0.0.1", "::1"]) {
  assert.match(localProxyFunction, new RegExp(`"${escapeRegex(localBypass)}"`));
}
assert.match(localProxyFunction, /\$existingNoProxyEntries\s*\+=/);
assert.match(localProxyFunction, /\$mergedNoProxyEntries[\s\S]*\$env:NO_PROXY\s*=\s*\$mergedNoProxy[\s\S]*\$env:no_proxy\s*=\s*\$mergedNoProxy/);
assertOrder(restart, "Set-LocalProxyEnvironment", "Start-Process");
assert.doesNotMatch(localProxyFunction, /Write-(?:Host|Output|Verbose|Debug)[\s\S]*(?:windowsProxy|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY)/i);
runWindowsProxyProbe({ proxyUriFunction, windowsProxyFunction, localProxyFunction });
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

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractPowerShellFunction(source, name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `Missing PowerShell function: ${name}`);
  const bodyStart = source.indexOf("{", start + marker.length);
  assert.ok(bodyStart >= 0, `Missing PowerShell function body: ${name}`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`Unclosed PowerShell function body: ${name}`);
}

function runWindowsProxyProbe({ proxyUriFunction, windowsProxyFunction, localProxyFunction }) {
  if (process.platform !== "win32") return;

  const temp = mkdtempSync(path.join(tmpdir(), "fluxpost-proxy-check-"));
  const probePath = path.join(temp, "probe.ps1");
  const probe = `
$ErrorActionPreference = "Stop"
${proxyUriFunction}
${windowsProxyFunction}
${localProxyFunction}

function Assert-Equal([string]$Actual, [string]$Expected, [string]$Message) {
  if ($Actual -cne $Expected) { throw "$Message (actual='$Actual')" }
}
function Assert-NoProxyEntry([string]$Value, [string]$Expected) {
  $entries = @($Value -split "[,;]" | ForEach-Object { $_.Trim() })
  if (-not ($entries | Where-Object { $_ -ieq $Expected })) { throw "NO_PROXY is missing a required entry" }
}
function Clear-ProxyEnvironment {
  foreach ($name in @("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy", "NODE_USE_ENV_PROXY")) {
    Remove-Item "Env:$name" -ErrorAction SilentlyContinue
  }
}

$script:discoveryCalls = 0
$script:proxySetting = "simple-proxy.invalid:9123"
function Get-ItemProperty {
  $script:discoveryCalls += 1
  [pscustomobject]@{ ProxyEnable = 1; ProxyServer = $script:proxySetting }
}

foreach ($explicitProxyName in @("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy")) {
  Clear-ProxyEnvironment
  [Environment]::SetEnvironmentVariable($explicitProxyName, "http://explicit-proxy.invalid:8123", "Process")
  [Environment]::SetEnvironmentVariable("no_proxy", "existing.internal", "Process")
  Set-LocalProxyEnvironment
  Assert-Equal ([Environment]::GetEnvironmentVariable($explicitProxyName, "Process")) "http://explicit-proxy.invalid:8123" "Explicit proxy must retain precedence"
  Assert-Equal "$script:discoveryCalls" "0" "Explicit proxy must skip Windows proxy discovery"
  Assert-Equal $env:NODE_USE_ENV_PROXY "1" "Explicit proxy must enable Node environment proxy support"
  foreach ($entry in @("existing.internal", "localhost", "127.0.0.1", "::1")) { Assert-NoProxyEntry $env:NO_PROXY $entry }
}

Clear-ProxyEnvironment
$script:proxyEnabled = 0
function Get-ItemProperty {
  $script:discoveryCalls += 1
  [pscustomobject]@{ ProxyEnable = $script:proxyEnabled; ProxyServer = $script:proxySetting }
}
Set-LocalProxyEnvironment
Assert-Equal $env:HTTP_PROXY "" "Disabled WinINET proxy must not populate HTTP_PROXY"
Assert-Equal $env:HTTPS_PROXY "" "Disabled WinINET proxy must not populate HTTPS_PROXY"
Assert-Equal $env:NODE_USE_ENV_PROXY "" "Disabled WinINET proxy must not enable Node environment proxy support"

Clear-ProxyEnvironment
$script:proxyEnabled = 1
$env:ALL_PROXY = "http://unsupported-all-proxy.invalid:8123"
Set-LocalProxyEnvironment
Assert-Equal $env:HTTP_PROXY "http://simple-proxy.invalid:9123/" "Unsupported ALL_PROXY must not block Windows proxy discovery"
Assert-Equal $env:HTTPS_PROXY "http://simple-proxy.invalid:9123/" "Unsupported ALL_PROXY must not block Windows proxy discovery"

Clear-ProxyEnvironment
$env:NO_PROXY = "first.internal,second.internal"
Set-LocalProxyEnvironment
Assert-Equal $env:HTTP_PROXY "http://simple-proxy.invalid:9123/" "Simple WinINET proxy must populate HTTP_PROXY"
Assert-Equal $env:HTTPS_PROXY "http://simple-proxy.invalid:9123/" "Simple WinINET proxy must populate HTTPS_PROXY"
Assert-Equal $env:NODE_USE_ENV_PROXY "1" "Discovered proxy must enable Node environment proxy support"
foreach ($entry in @("first.internal", "second.internal", "localhost", "127.0.0.1", "::1")) { Assert-NoProxyEntry $env:NO_PROXY $entry }

$script:proxySetting = "http=protocol-http.invalid:7123;https=https://protocol-https.invalid:7443;socks=ignored.invalid:1"
$protocolProxy = Get-WindowsProxyEnvironment
Assert-Equal $protocolProxy.Http "http://protocol-http.invalid:7123/" "Protocol-specific HTTP proxy must be parsed"
Assert-Equal $protocolProxy.Https "https://protocol-https.invalid:7443/" "Protocol-specific HTTPS proxy must be parsed"
Write-Output "Windows proxy environment behavior probe passed."
`;

  writeFileSync(probePath, probe, "utf8");
  try {
    const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", probePath], {
      cwd: projectRoot,
      encoding: "utf8",
      env: process.env,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout || "Windows proxy environment behavior probe failed.");
    assert.match(result.stdout, /Windows proxy environment behavior probe passed\./);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
