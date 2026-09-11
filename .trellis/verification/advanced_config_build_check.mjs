import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

// Execute the actual production config factories, with no application startup,
// real configuration, database access, network or filesystem writes.
const buildDir = process.argv[2] || process.env.FLUXPOST_NEXT_DIST_DIR || ".next";
const chunksDir = path.resolve(buildDir, "server", "chunks");
const factories = new Map();
for (const name of readdirSync(chunksDir).filter(name => name.endsWith(".js"))) {
  const source = readFileSync(path.join(chunksDir, name), "utf8");
  if (!source.startsWith("module.exports=[")) continue;
  const container = { exports: [] };
  vm.runInNewContext(source, { module: container }, { filename: name });
  let ids = [];
  for (const entry of container.exports) {
    if (typeof entry === "function") {
      for (const id of ids) factories.set(id, entry.toString());
      ids = [];
    } else {
      ids.push(entry);
    }
  }
  assert.equal(ids.length, 0, `Unresolved Turbopack module IDs in ${name}`);
}
const configFactories = [...factories.values()].filter(source =>
  source.includes("OPENAI_IMAGE_BASE_URL") && source.includes('"appConfig"') && source.includes('"openaiImageUrl"'));
const apiFactory = configFactories.find(source => source.includes('"saveAdvancedConfigPatch"'));
assert.ok(apiFactory, "built config API factory must exist");
const workerFactory = configFactories.find(source => !source.includes('"saveAdvancedConfigPatch"')) || apiFactory;

const environment = {
  OPENAI_IMAGE_BASE_URL: "https://old.example/v1",
  OPENAI_IMAGE_API_KEY: "fixture-old-key",
  OPENAI_IMAGE_PROXY_ENABLED: "false",
};
const sharedGlobal = {};
let persisted = "";
const fakeFs = {
  existsSync: () => Boolean(persisted),
  readFileSync: () => persisted,
  writeFileSync: (_file, contents) => { persisted = contents; },
};

const worker = await loadConfig(workerFactory);
const api = await loadConfig(apiFactory);
api.saveAdvancedConfigPatch({ values: {
  OPENAI_IMAGE_BASE_URL: "https://new.example/v1",
  OPENAI_IMAGE_API_KEY: "fixture-new-key",
  OPENAI_IMAGE_MODEL: "fixture-model",
  OPENAI_IMAGE_API_PROFILE: "openai_json",
  OPENAI_IMAGE_BACKUP_BASE_URL: "https://backup.example/v1",
  OPENAI_IMAGE_BACKUP_API_KEY: "fixture-backup-key",
  OPENAI_IMAGE_PROXY_URL: "http://127.0.0.1:10809",
  OPENAI_IMAGE_PROXY_ENABLED: true,
} });
assert.equal(worker.openaiImageUrl("images/generations"), "https://new.example/v1/images/generations");
assert.equal(worker.openaiImageApiKey(), "fixture-new-key");
assert.equal(worker.openaiImageRouteConfig().model, "fixture-model");
assert.equal(worker.openaiImageRouteConfig().profile, "openai_json");
assert.equal(worker.openaiImageUrl("images/edits", "backup"), "https://backup.example/v1/images/edits");
assert.equal(worker.appConfig.openaiImageProxyEnabled, true);
assert.equal(worker.appConfig.openaiImageProxyUrl, "http://127.0.0.1:10809");
assert.equal(worker.appConfig, api.appConfig);
const lateApi = await loadConfig(apiFactory);
lateApi.saveAdvancedConfigPatch({ values: { OPENAI_IMAGE_BASE_URL: "https://latest.example/v1" } });
assert.equal(worker.openaiImageUrl("images/generations"), "https://latest.example/v1/images/generations");
console.log("Production config API/worker bundle synchronization passed (isolated factories, no live calls).");

async function loadConfig(source) {
  const loaded = evaluate(source);
  await loaded.ready;
  return loaded.exports;
}

function evaluate(source) {
  const loaded = { exports: {}, ready: Promise.resolve() };
  const runtime = {
    i: (id) => {
      const dependency = factories.get(id);
      assert.ok(dependency, `Missing built dependency ${id}`);
      if (dependency.includes('"node:fs"')) return fakeFs;
      if (dependency.includes('"node:path"')) return { default: path };
      if (dependency.includes('"getDatabaseRuntimeStatus"')) return { getDatabaseRuntimeStatus: () => ({}) };
      if (dependency.includes('"normalizeFeishuTableId"') || dependency.includes('"resolveImageProviderProfile"')) {
        return evaluate(dependency).exports;
      }
      throw new Error(`Unexpected config dependency ${id}; extend the isolated adapter explicitly.`);
    },
    a: (body) => {
      loaded.ready = new Promise((resolve, reject) => {
        Promise.resolve(body(dependencies => dependencies, error => error ? reject(error) : resolve())).catch(reject);
      });
    },
    s: (definitions) => {
      for (let i = 0; i < definitions.length;) {
        const name = definitions[i++];
        const getter = definitions[i++];
        if (getter === 0) loaded.exports[name] = definitions[i++];
        else Object.defineProperty(loaded.exports, name, { get: getter });
      }
    },
  };
  vm.runInNewContext(`(${source})(runtime)`, {
    runtime,
    globalThis: sharedGlobal,
    process: { env: environment, platform: "win32", cwd: () => path.resolve("isolated-config-fixture") },
    URL,
  });
  return loaded;
}
