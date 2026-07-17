import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const projectRoot = process.cwd();
const identityPath = path.join(projectRoot, "src/lib/feishu-cli-identity.ts");
if (!existsSync(identityPath)) throw new Error("Missing Feishu CLI identity module.");

const configSource = read("src/lib/config.ts");
const feishuSource = read("src/lib/feishu-cli.ts");
const identitySource = read("src/lib/feishu-cli-identity.ts");
const activitySource = read("src/lib/activity-log.ts");
const contentImportSource = read("src/lib/feishu-content-import.ts");
const distributionSource = read("src/lib/distribution-check.ts");
const fieldOptionsSource = read("src/lib/feishu-field-options.ts");
const envExample = read("deploy/env.production.example");
const composeSource = read("compose.yaml");

assertContains(configSource, /feishuAppId:\s*process\.env\.FEISHU_APP_ID\s*\|\|\s*""/, "App config must read FEISHU_APP_ID.");
assertContains(configSource, /feishuAppSecret:\s*process\.env\.FEISHU_APP_SECRET\s*\|\|\s*""/, "App config must read FEISHU_APP_SECRET.");
assertContains(configSource, /feishuBrand:\s*normalizeFeishuBrand\(process\.env\.FEISHU_BRAND\s*\|\|\s*"feishu"\)/, "App config must normalize FEISHU_BRAND.");
assertContains(configSource, /configField\("FEISHU_APP_ID"[\s\S]*?"text",\s*"feishu"/, "Advanced config must expose Feishu App ID.");
assertContains(configSource, /configField\("FEISHU_APP_SECRET"[\s\S]*?"secret",\s*"feishu"/, "Advanced config must expose Feishu App Secret as a masked secret.");
assertContains(configSource, /configField\("FEISHU_BRAND"[\s\S]*?"select",\s*"feishu"[\s\S]*?options:\s*\["feishu",\s*"lark"\]/, "Advanced config must constrain Feishu brand.");
assertContains(configSource, /feishuConfigured:\s*Boolean\([\s\S]*feishuAppId[\s\S]*feishuAppSecret[\s\S]*feishuBitableAppToken[\s\S]*feishuBitableTableId/, "Feishu readiness must include application identity credentials.");

assertContains(feishuSource, /ensureFeishuCliIdentity/, "Feishu CLI execution must enforce application identity readiness.");
assertContains(contentImportSource, /ensureConfiguredFeishuCliIdentity/, "Feishu content import must use the shared identity readiness boundary.");
assertContains(distributionSource, /ensureConfiguredFeishuCliIdentity/, "Distribution audit must use the shared identity readiness boundary.");
assertContains(fieldOptionsSource, /ensureConfiguredFeishuCliIdentity/, "Feishu field options must use the shared identity readiness boundary.");
assertContains(identitySource, /--app-secret-stdin/, "Feishu CLI initialization must use stdin for App Secret.");
assertNotContains(identitySource, /--app-secret(?:\s|",\s*)appSecret/, "App Secret must never be passed in CLI argv.");
assertContains(feishuSource, /stdin\.end\(input\)/, "CLI initialization must write App Secret through child stdin.");
assertContains(feishuSource, /appConfig\.feishuAppSecret[\s\S]*replaceAll/, "CLI sanitization must redact the configured App Secret.");
assertContains(activitySource, /FEISHU_APP_SECRET=/, "Execution log compaction must redact Feishu App Secret env values.");
assertContains(envExample, /FEISHU_APP_ID=\r?\nFEISHU_APP_SECRET=\r?\nFEISHU_BRAND=feishu/, "Production env template must document Feishu application identity fields.");
assertContains(composeSource, /- fluxpost-node-home:\/home\/node/, "lark-cli identity must remain on the persistent node-home volume.");

const transpiled = ts.transpileModule(identitySource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
});
const identityModule = { exports: {} };
vm.runInNewContext(
  transpiled.outputText,
  {
    module: identityModule,
    exports: identityModule.exports,
    require(name) {
      if (name === "node:crypto") return { createHash };
      throw new Error(`Unexpected identity dependency: ${name}`);
    },
    console,
    Promise,
    Error,
    JSON,
  },
  { filename: identityPath },
);

const { ensureFeishuCliIdentity, resetFeishuCliIdentityCacheForTests } = identityModule.exports;
if (typeof ensureFeishuCliIdentity !== "function" || typeof resetFeishuCliIdentityCacheForTests !== "function") {
  throw new Error("Feishu CLI identity module must export readiness and test-reset helpers.");
}

await testMissingCredentials();
await testInitializationAndCache();
await testCredentialChangeReinitializes();
await testConcurrentInitializationDeduplicates();
await testInitializationFailureRetries();

console.log("Feishu CLI identity auto-init check passed.");

async function testMissingCredentials() {
  resetFeishuCliIdentityCacheForTests();
  let calls = 0;
  await expectRejects(
    () => ensureFeishuCliIdentity({ appId: "", appSecret: "", brand: "feishu" }, async () => { calls += 1; }),
    /FEISHU_APP_ID or FEISHU_APP_SECRET is not configured/,
  );
  assertEqual(calls, 0, "Missing credentials must not invoke lark-cli.");
}

async function testInitializationAndCache() {
  resetFeishuCliIdentityCacheForTests();
  const initCalls = [];
  const init = async (args, input) => { initCalls.push({ args, input }); return { stdout: "", stderr: "" }; };
  const config = { appId: "cli_match", appSecret: "secret-a", brand: "feishu" };
  await ensureFeishuCliIdentity(config, init);
  await ensureFeishuCliIdentity(config, init);
  assertEqual(initCalls.length, 1, "A successful identity initialization must be cached.");
  assertEqual(initCalls[0].input, "secret-a\n", "App Secret must be supplied only through stdin.");
  assertEqual(initCalls[0].args.join(" "), "config init --app-id cli_match --app-secret-stdin --brand feishu", "Init argv must contain identity metadata only.");
  if (initCalls[0].args.includes("secret-a")) throw new Error("Init argv exposed App Secret.");
}

async function testCredentialChangeReinitializes() {
  resetFeishuCliIdentityCacheForTests();
  let initCalls = 0;
  const inputs = [];
  const init = async (_args, input) => { initCalls += 1; inputs.push(input.trim()); return { stdout: "", stderr: "" }; };
  await ensureFeishuCliIdentity({ appId: "cli_change", appSecret: "secret-c1", brand: "feishu" }, init);
  await ensureFeishuCliIdentity({ appId: "cli_change", appSecret: "secret-c2", brand: "feishu" }, init);
  assertEqual(initCalls, 2, "Credential fingerprint changes must reinitialize CLI identity.");
  assertEqual(inputs.join(","), "secret-c1,secret-c2", "Reinitialization must use the updated secret.");
}

async function testConcurrentInitializationDeduplicates() {
  resetFeishuCliIdentityCacheForTests();
  let initCalls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const init = async () => { initCalls += 1; await gate; return { stdout: "", stderr: "" }; };
  const config = { appId: "cli_parallel", appSecret: "secret-d", brand: "lark" };
  const first = ensureFeishuCliIdentity(config, init);
  const second = ensureFeishuCliIdentity(config, init);
  release();
  await Promise.all([first, second]);
  assertEqual(initCalls, 1, "Concurrent callers must share one initialization.");
}

async function testInitializationFailureRetries() {
  resetFeishuCliIdentityCacheForTests();
  let initCalls = 0;
  await expectRejects(
    () => ensureFeishuCliIdentity(
      { appId: "cli_error", appSecret: "secret-e", brand: "feishu" },
      async () => { initCalls += 1; throw new Error("permission denied"); },
    ),
    /permission denied/,
  );
  await ensureFeishuCliIdentity(
    { appId: "cli_error", appSecret: "secret-e", brand: "feishu" },
    async () => { initCalls += 1; return { stdout: "", stderr: "" }; },
  );
  assertEqual(initCalls, 2, "Failed initialization must not poison the credential cache.");
}

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assertContains(value, pattern, message) {
  if (!pattern.test(value)) throw new Error(message);
}

function assertNotContains(value, pattern, message) {
  if (pattern.test(value)) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message} Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
}

async function expectRejects(action, pattern) {
  try {
    await action();
  } catch (error) {
    if (pattern.test(String(error?.message || error))) return;
    throw error;
  }
  throw new Error(`Expected rejection matching ${pattern}.`);
}
