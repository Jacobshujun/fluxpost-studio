import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const projectRoot = process.cwd();

const files = {
  route: read("src/app/api/config/route.ts"),
  config: read("src/lib/config.ts"),
  compose: read("compose.yaml"),
  dockerfile: read("Dockerfile"),
  types: read("src/lib/types.ts"),
  page: read("src/app/config/page.tsx"),
  home: read("src/app/page.tsx"),
};

assertContains(files.types, /export type AdvancedConfigSnapshot = \{[\s\S]*groups:\s*AdvancedConfigGroup\[\]/, "Advanced config snapshot type is missing.");
assertContains(files.types, /export type AdvancedConfigPatch = \{[\s\S]*values:\s*Record<string,\s*AdvancedConfigPatchValue>/, "Advanced config patch type is missing.");

assertContains(files.route, /url\.searchParams\.get\("advanced"\)\s*!==\s*"1"[\s\S]*getConfigStatus\(\)/, "Plain /api/config must keep returning non-sensitive status.");
assertContains(files.route, /requireWorkspaceAccount\(request\)/, "Advanced config route must require workspace sign-in.");
assertContains(files.route, /!isWorkspaceAdmin\(account\)/, "Advanced config route must require admin role.");
assertContains(files.route, /export async function PATCH/, "Advanced config route must expose a write path.");
assertContains(files.route, /saveAdvancedConfigPatch\(body\)/, "Advanced config PATCH must delegate env writes to config helper.");

assertContains(files.config, /value:\s*field\.kind === "secret" \? undefined : field\.read\(\) \?\? ""/, "Advanced config snapshot must not return secret values.");
assertContains(files.config, /const advancedConfigByKey = new Map/, "Advanced config writes must be allow-listed by known keys.");
assertContains(files.config, /if \(!definition\) throw new Error\(`Unsupported config key:/, "Unknown config keys must be rejected.");
assertContains(files.config, /process\.env\.FLUXPOST_CONFIG_FILE\?\.trim\(\)/, "Advanced config must support an explicit persistent config file.");
assertContains(files.config, /path\.join\(process\.cwd\(\),\s*"\.env\.local"\)/, "Local advanced config must still default to .env.local.");
assertContains(files.config, /if \(configuredEnvironmentFile\) loadEnvironmentOverrides\(advancedEnvironmentFilePath\);[\s\S]*export const appConfig\s*=/, "Persistent overrides must load before appConfig initialization.");
assertContains(files.config, /writeFileSync\(envPath,/, "Advanced config must write environment changes through the helper.");
assertContains(files.config, /const persistEmptyValues = Boolean\(configuredEnvironmentFile\)/, "Persistent config writes must retain clear tombstones.");
assertContains(files.config, /if \(value === ""\) \{[\s\S]*delete process\.env\[key\]/, "Persistent empty values must clear inherited environment values.");
assertContains(files.config, /delete process\.env\[key\]/, "Clearing a config value must remove it from the current process env.");
assertContains(files.config, /reloadAppConfig\(\)/, "Saving advanced config must refresh the in-process app config.");

assertContains(files.compose, /FLUXPOST_CONFIG_FILE:\s*\/app\/config\/\.env\.local/, "Production app must select the persistent advanced config file.");
assertContains(files.compose, /- fluxpost-config:\/app\/config/, "Production app must mount the advanced config volume.");
assertContains(files.compose, /\n\s{2}fluxpost-config:\s*(?:\r?\n|$)/, "Compose must declare the advanced config volume.");
assertContains(files.dockerfile, /mkdir -p config data public\/media public\/generated[\s\S]*chown -R node:node \/app/, "The persistent config mount point must be writable by the app user.");

assertContains(files.page, /sessionData\.account\.role !== "admin"/, "Advanced config page must block non-admin users.");
assertContains(files.page, /field\.kind === "secret" \? "" : field\.value \|\| ""/, "Advanced config page must not initialize secret inputs with secret values.");
assertContains(files.page, /清空该项/, "Advanced config page must provide an explicit clear action for hidden secrets.");
assertContains(files.page, /\/api\/config\?advanced=1/, "Advanced config page must use the admin-only config snapshot endpoint.");
assertContains(files.home, /currentAccount\.role === "admin"[\s\S]*href="\/config"/, "Home navigation must show advanced config only to admins.");

assertNotContains(files.page, /dangerouslySetInnerHTML/, "Advanced config page must not render config values through raw HTML.");
assertNotContains(files.route, /process\.env\[[^\]]+\][\s\S]*NextResponse\.json/, "Config route must not directly return arbitrary process.env values.");

checkImageProxyConfiguration();
checkConfigSynchronization();
console.log("Advanced config admin boundary, cross-module synchronization and image proxy persistence checks passed.");

function checkConfigSynchronization() {
  for (const platform of ["win32", "linux"]) {
    const runtime = loadConfig(platform, {
      OPENAI_BASE_URL: "https://old.example/v1",
      OPENAI_API_KEY: "fixture-fallback-key",
      OPENAI_IMAGE_BASE_URL: "https://old-image.example/v1",
      OPENAI_IMAGE_API_KEY: "fixture-old-key",
      OPENAI_IMAGE_PROXY_ENABLED: "false",
    });
    // Production bundling initializes the worker and API as separate module instances.
    const worker = runtime.config;
    const retainedConfig = worker.appConfig;
    const api = runtime.loadModule();
    api.saveAdvancedConfigPatch({ values: {
      OPENAI_IMAGE_BASE_URL: "https://new-image.example/v1/",
      OPENAI_IMAGE_API_KEY: "fixture-new-key",
      OPENAI_IMAGE_MODEL: "fixture-image-model",
      OPENAI_IMAGE_API_PROFILE: "openai_json",
      OPENAI_IMAGE_BACKUP_BASE_URL: "https://backup.example/v1",
      OPENAI_IMAGE_BACKUP_API_KEY: "fixture-backup-key",
      OPENAI_IMAGE_BACKUP_MODEL: "fixture-backup-model",
      OPENAI_IMAGE_BACKUP_API_PROFILE: "openai_sse",
      OPENAI_TEXT_BASE_URL: "https://text.example/v1",
      OPENAI_TEXT_MODEL: "fixture-text-model",
      OPENAI_IMAGE_PROXY_ENABLED: true,
      OPENAI_IMAGE_PROXY_URL: "http://127.0.0.1:10809",
    } });
    assert.equal(worker.openaiImageUrl("images/generations"), "https://new-image.example/v1/images/generations");
    assert.equal(worker.openaiImageApiKey(), "fixture-new-key");
    assert.equal(worker.openaiImageRouteConfig().model, "fixture-image-model");
    assert.equal(worker.openaiImageRouteConfig().profile, "openai_json");
    assert.equal(worker.openaiImageUrl("images/edits", "backup"), "https://backup.example/v1/images/edits");
    assert.equal(worker.openaiImageApiKey("backup"), "fixture-backup-key");
    assert.equal(worker.openaiImageRouteConfig("backup").model, "fixture-backup-model");
    assert.equal(worker.openaiImageRouteConfig("backup").profile, "openai_sse");
    assert.equal(worker.openaiTextUrl("responses"), "https://text.example/v1/responses");
    assert.equal(retainedConfig.openaiTextModel, "fixture-text-model");
    assert.equal(retainedConfig.openaiImageProxyEnabled, true);
    assert.equal(retainedConfig.openaiImageProxyUrl, "http://127.0.0.1:10809");
    assert.equal(worker.appConfig, retainedConfig, "a captured config reference must stay live");
    assert.equal(api.appConfig, retainedConfig, "independent modules must share the live object");

    const lateModule = runtime.loadModule();
    assert.equal(lateModule.appConfig, retainedConfig);
    lateModule.saveAdvancedConfigPatch({ values: {
      OPENAI_BASE_URL: "https://fallback.example/v1",
      OPENAI_IMAGE_BASE_URL: null,
      OPENAI_IMAGE_API_KEY: null,
      OPENAI_IMAGE_BACKUP_BASE_URL: null,
      OPENAI_IMAGE_BACKUP_API_KEY: null,
      OPENAI_IMAGE_PROXY_ENABLED: false,
      OPENAI_IMAGE_PROXY_URL: null,
    } });
    assert.equal(worker.openaiImageUrl("images/generations"), "https://fallback.example/v1/images/generations");
    assert.equal(api.openaiImageApiKey(), "fixture-fallback-key");
    assert.equal(worker.isOpenaiImageRouteConfigured("backup"), false);
    assert.equal(retainedConfig.openaiImageProxyEnabled, false);
    assert.equal(retainedConfig.openaiImageProxyUrl, platform === "win32" ? "http://127.0.0.1:10808" : "");

    const before = JSON.stringify(retainedConfig);
    const persisted = runtime.persisted();
    assert.throws(() => api.saveAdvancedConfigPatch({ values: { OPENAI_IMAGE_API_PROFILE: "invalid" } }));
    runtime.failWrites(true);
    assert.throws(() => api.saveAdvancedConfigPatch({ values: { OPENAI_IMAGE_BASE_URL: "https://unsaved.example/v1" } }), /fixture write failure/);
    runtime.failWrites(false);
    assert.equal(JSON.stringify(retainedConfig), before);
    assert.equal(runtime.persisted(), persisted);
    assert.equal(api.getConfigStatus().openaiImageBaseUrl, worker.getConfigStatus().openaiImageBaseUrl);
    for (const field of worker.getAdvancedConfigSnapshot().groups.flatMap(group => group.fields).filter(field => field.kind === "secret")) {
      assert.equal(field.value, undefined, "sharing config must not expose secrets");
    }
  }
}

function checkImageProxyConfiguration() {
  for (const platform of ["win32", "linux"]) {
    const defaults = loadConfig(platform);
    assert.equal(defaults.config.appConfig.openaiImageProxyEnabled, platform === "win32");
    assert.equal(defaults.config.appConfig.openaiImageProxyUrl, platform === "win32" ? "http://127.0.0.1:10808" : "");
    const legacy = loadConfig(platform, { OPENAI_IMAGE_PROXY_URL: "http://127.0.0.1:10809" });
    assert.equal(legacy.config.appConfig.openaiImageProxyEnabled, true);
    const cleared = loadConfig(platform, { OPENAI_IMAGE_PROXY_URL: "" });
    assert.equal(cleared.config.appConfig.openaiImageProxyEnabled, false);
    const disabled = loadConfig(platform, { OPENAI_IMAGE_PROXY_ENABLED: "false" });
    assert.equal(disabled.config.appConfig.openaiImageProxyEnabled, false);
  }

  const runtime = loadConfig("win32");
  const retainedUrl = "http://127.0.0.1:10809";
  runtime.config.saveAdvancedConfigPatch({ values: { OPENAI_IMAGE_PROXY_URL: retainedUrl } });
  const snapshot = runtime.config.saveAdvancedConfigPatch({ values: { OPENAI_IMAGE_PROXY_ENABLED: false } });
  const toggle = snapshot.groups.flatMap((group) => group.fields).find((field) => field.key === "OPENAI_IMAGE_PROXY_ENABLED");
  assert.equal(toggle.kind, "boolean");
  assert.equal(toggle.value, "false");
  assert.equal(runtime.config.appConfig.openaiImageProxyEnabled, false);
  assert.equal(runtime.config.appConfig.openaiImageProxyUrl, retainedUrl);
  assert.match(runtime.persisted(), /OPENAI_IMAGE_PROXY_ENABLED=false/);
  const restarted = loadConfig("win32", {}, runtime.persisted());
  assert.equal(restarted.config.appConfig.openaiImageProxyEnabled, false);
  assert.equal(restarted.config.appConfig.openaiImageProxyUrl, retainedUrl);
  restarted.config.saveAdvancedConfigPatch({ values: { OPENAI_IMAGE_PROXY_ENABLED: true } });
  assert.equal(restarted.config.appConfig.openaiImageProxyEnabled, true);
  assert.equal(restarted.config.appConfig.openaiImageProxyUrl, retainedUrl);
  assert.equal(loadConfig("win32", {}, restarted.persisted()).config.appConfig.openaiImageProxyEnabled, true);

  for (const values of [
    { OPENAI_IMAGE_PROXY_ENABLED: "invalid" },
    { OPENAI_IMAGE_PROXY_URL: "socks5://127.0.0.1:10808" },
    { OPENAI_IMAGE_PROXY_URL: "http://user:password@127.0.0.1:10808" },
    { OPENAI_IMAGE_PROXY_URL: "not-a-url" },
  ]) {
    const before = runtime.persisted();
    assert.throws(() => runtime.config.saveAdvancedConfigPatch({ values }));
    assert.equal(runtime.persisted(), before, "invalid proxy changes must not be persisted");
    assert.equal(runtime.config.appConfig.openaiImageProxyUrl, retainedUrl);
  }
  const noAddress = loadConfig("linux");
  assert.throws(() => noAddress.config.saveAdvancedConfigPatch({ values: { OPENAI_IMAGE_PROXY_ENABLED: true } }), /代理地址/);
  assert.equal(noAddress.persisted(), "");
  assert.equal(noAddress.config.appConfig.openaiImageProxyEnabled, false);
  noAddress.config.saveAdvancedConfigPatch({ values: { OPENAI_IMAGE_PROXY_ENABLED: true, OPENAI_IMAGE_PROXY_URL: retainedUrl } });
  assert.equal(noAddress.config.appConfig.openaiImageProxyEnabled, true);
  assert.throws(() => noAddress.config.saveAdvancedConfigPatch({ values: { OPENAI_IMAGE_PROXY_URL: null } }), /代理地址/);
  noAddress.config.saveAdvancedConfigPatch({ values: { OPENAI_IMAGE_PROXY_ENABLED: false, OPENAI_IMAGE_PROXY_URL: null } });
  assert.equal(noAddress.config.appConfig.openaiImageProxyEnabled, false);
  assert.equal(noAddress.config.appConfig.openaiImageProxyUrl, "");
}

function loadConfig(platform, values = {}, persisted = "") {
  const configPath = path.join(projectRoot, "isolated-config-fixture", ".env.local");
  const environment = { ...values, FLUXPOST_CONFIG_FILE: configPath };
  const nativeRequire = createRequire(import.meta.url);
  const sharedGlobal = {};
  let failWrites = false;
  const fakeFs = {
    existsSync: (file) => file === configPath && Boolean(persisted),
    readFileSync: (file) => {
      assert.equal(file, configPath);
      return persisted;
    },
    writeFileSync: (file, content) => {
      assert.equal(file, configPath);
      if (failWrites) throw new Error("fixture write failure");
      persisted = content;
    },
  };
  function load(relative) {
    const loadedModule = { exports: {} };
    const output = ts.transpileModule(read(relative), {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: relative,
    }).outputText;
    vm.runInNewContext(output, {
      module: loadedModule,
      exports: loadedModule.exports,
      process: { env: environment, platform, cwd: () => projectRoot },
      globalThis: sharedGlobal,
      URL,
      require: (name) => {
        if (name === "node:fs") return fakeFs;
        if (name === "./database") return { getDatabaseRuntimeStatus: () => ({}) };
        if (name === "./feishu-table-id") return load("src/lib/feishu-table-id.ts");
        if (name === "./image-providers/contracts") return load("src/lib/image-providers/contracts.ts");
        return nativeRequire(name);
      },
    }, { filename: relative });
    return loadedModule.exports;
  }
  return {
    config: load("src/lib/config.ts"),
    loadModule: () => load("src/lib/config.ts"),
    persisted: () => persisted,
    failWrites: (value) => { failWrites = value; },
  };
}

function read(relativePath) {
  const filePath = path.join(projectRoot, relativePath);
  if (!existsSync(filePath)) throw new Error(`Missing file: ${relativePath}`);
  return readFileSync(filePath, "utf8");
}

function assertContains(value, pattern, message) {
  if (!pattern.test(value)) throw new Error(message);
}

function assertNotContains(value, pattern, message) {
  if (pattern.test(value)) throw new Error(message);
}
