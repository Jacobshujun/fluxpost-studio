import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const projectRoot = process.cwd();

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function loadTsModule(relativePath, requireMap = {}) {
  const sourcePath = path.join(projectRoot, relativePath);
  const transpiled = ts.transpileModule(read(relativePath), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  });
  const cjsModule = { exports: {} };
  const sandbox = {
    Buffer,
    console,
    module: cjsModule,
    exports: cjsModule.exports,
    require(name) {
      if (Object.hasOwn(requireMap, name)) return requireMap[name];
      throw new Error(`Unexpected import in ${relativePath}: ${name}`);
    },
  };
  vm.runInNewContext(transpiled.outputText, sandbox, { filename: sourcePath });
  return cjsModule.exports;
}

let storedPolicy;
let forceCasConflict = false;
const logs = [];
const policyDomain = loadTsModule("src/lib/content-safety-policy.ts", {
  "./activity-log": {
    recordExecutionLog: async (entry) => logs.push(entry),
  },
  "./database": {
    readAppMetaValue: async () => storedPolicy,
    compareAndSetAppMetaValue: async (_key, expectedValue, value) => {
      if (forceCasConflict) {
        forceCasConflict = false;
        const concurrent = { ...JSON.parse(storedPolicy), revision: JSON.parse(storedPolicy).revision + 1 };
        storedPolicy = JSON.stringify(concurrent);
        return false;
      }
      if (storedPolicy !== expectedValue) return false;
      storedPolicy = value;
      return true;
    },
  },
});

const admin = { id: "admin-1", displayName: "Admin", role: "admin" };
const defaults = policyDomain.createDefaultContentSafetyPolicy();
if (defaults.schemaVersion !== 1 || defaults.revision !== 0 || defaults.enabled !== true) {
  throw new Error("The shipped policy must be enabled, schema-versioned, and start at revision zero.");
}
if (defaults.model.reviewThreshold !== 40 || defaults.model.filterThreshold !== 80) {
  throw new Error("The shipped model thresholds must be 40/80.");
}
const shippedStrongComparison = policyDomain.evaluateLocalContentSafety(item("小鹏 G9L", "参数碾压理想和问界"), defaults);
if (shippedStrongComparison.decision !== "review" || shippedStrongComparison.matchedRuleId !== "competitor-strong-comparison") {
  throw new Error("The shipped policy must review strong competitor comparisons without locally filtering them.");
}
const shippedNegativePrecedence = policyDomain.evaluateLocalContentSafety(item("理想对比", "碾压对手，避雷并劝退"), defaults);
if (shippedNegativePrecedence.decision !== "filter" || shippedNegativePrecedence.matchedRuleId !== "negative-cluster") {
  throw new Error("The shipped negative cluster filter must precede competitor review when both rules match.");
}
const shippedAbuse = policyDomain.evaluateLocalContentSafety(item("普通标题", "这个垃圾产品，滚出市场"), defaults);
if (shippedAbuse.decision !== "filter") throw new Error("The shipped policy must still filter explicit abusive text.");

const policy = policyDomain.normalizeContentSafetyPolicy({
  ...defaults,
  categories: [
    { id: "exception", label: "Exception" },
    { id: "abuse", label: "Abuse" },
    { id: "negative", label: "Negative" },
  ],
  local: {
    enabled: true,
    rules: [
      {
        id: "disabled-filter",
        name: "Disabled filter",
        enabled: false,
        action: "filter",
        categoryIds: ["abuse"],
        groups: [{ fields: ["title"], mode: "any", terms: ["objective"] }],
      },
      {
        id: "exception-first",
        name: "Objective exception",
        enabled: true,
        action: "allow",
        categoryIds: ["exception"],
        groups: [{ fields: ["title"], mode: "all", terms: ["objective", "comparison"] }],
      },
      {
        id: "abuse-filter",
        name: "Explicit abuse",
        enabled: true,
        action: "filter",
        categoryIds: ["abuse"],
        groups: [
          { fields: ["body"], mode: "any", terms: ["trash", "idiot"] },
          { fields: ["author"], mode: "at_least", atLeast: 2, terms: ["spam", "bot", "troll"] },
        ],
      },
      {
        id: "negative-review",
        name: "Negative cluster",
        enabled: true,
        action: "review",
        categoryIds: ["negative"],
        groups: [{ fields: ["title", "body"], mode: "at_least", atLeast: 2, terms: ["avoid", "broken", "refund"] }],
      },
    ],
  },
});

function item(title, contentText, authorName = "") {
  return { id: "sample", sourceId: "sample", platform: "douyin", title, contentText, authorName, images: [], mediaUrls: [], metrics: {}, raw: {} };
}

const exception = policyDomain.evaluateLocalContentSafety(item("Objective Comparison", "trash", "spam bot"), policy);
if (exception.decision !== "allow" || exception.matchedRuleId !== "exception-first") {
  throw new Error("Disabled rules must be skipped and the first enabled matching rule must win.");
}
const abuse = policyDomain.evaluateLocalContentSafety(item("ordinary", "This is TR ASH", "spam bot"), policy);
if (abuse.decision !== "filter" || abuse.matchedRuleId !== "abuse-filter") {
  throw new Error("Groups must be AND-ed, normalize case/whitespace, and support any plus at_least modes.");
}
const wrongScope = policyDomain.evaluateLocalContentSafety(item("trash", "clean", "spam bot"), policy);
if (wrongScope.decision !== "allow") throw new Error("Rule terms must only inspect selected fields.");
const review = policyDomain.evaluateLocalContentSafety(item("Avoid this", "broken today"), policy);
if (review.decision !== "review" || review.matchedRuleId !== "negative-review") {
  throw new Error("at_least must count terms across the selected field scope.");
}

const normalizedDuplicateTerms = policyDomain.normalizeContentSafetyPolicy({
  ...defaults,
  local: {
    enabled: true,
    rules: [{
      id: "normalized-duplicates",
      name: "Normalized duplicate terms",
      enabled: true,
      action: "filter",
      categoryIds: ["profanity"],
      groups: [{ fields: ["body"], mode: "any", terms: ["BAD TERM", "b a d t e r m"] }],
    }],
  },
});
if (normalizedDuplicateTerms.local.rules[0].groups[0].terms.length !== 1) {
  throw new Error("Case/whitespace-equivalent terms must normalize to one match term.");
}
let duplicateAtLeastRejected = false;
try {
  policyDomain.normalizeContentSafetyPolicy({
    ...normalizedDuplicateTerms,
    local: {
      enabled: true,
      rules: [{
        ...normalizedDuplicateTerms.local.rules[0],
        groups: [{ fields: ["body"], mode: "at_least", atLeast: 2, terms: ["BAD TERM", "b a d t e r m"] }],
      }],
    },
  });
} catch {
  duplicateAtLeastRejected = true;
}
if (!duplicateAtLeastRejected) throw new Error("Equivalent duplicate terms must not inflate at_least match counts.");

for (const [score, expected] of [[39, "allow"], [40, "review"], [79, "review"], [80, "filter"]]) {
  const assessed = policyDomain.parseContentSafetyModelOutput(JSON.stringify({ riskScore: score, categoryIds: ["abuse", "unknown"], reasons: ["reason"] }), policy);
  if (assessed.decision !== expected) throw new Error(`Risk score ${score} must map to ${expected}.`);
  if (assessed.categories.join(",") !== "abuse") throw new Error("Unknown model category ids must be dropped.");
}

for (const invalid of [
  "not-json",
  JSON.stringify({ riskScore: -1, categoryIds: [], reasons: [] }),
  JSON.stringify({ riskScore: 101, categoryIds: [], reasons: [] }),
  JSON.stringify({ riskScore: "80", categoryIds: [], reasons: [] }),
  JSON.stringify({ riskScore: 50, categoryIds: [42], reasons: [] }),
  JSON.stringify({ riskScore: 50, categoryIds: [], reasons: [false] }),
  JSON.stringify({ riskScore: 50, categoryIds: [], reasons: ["x".repeat(501)] }),
]) {
  let rejected = false;
  try {
    policyDomain.parseContentSafetyModelOutput(invalid, policy);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("Invalid model JSON and scores must fail explicitly.");
}

let invalidPolicyRejected = false;
try {
  policyDomain.normalizeContentSafetyPolicy({ ...policy, model: { ...policy.model, reviewThreshold: 80, filterThreshold: 40 } });
} catch {
  invalidPolicyRejected = true;
}
if (!invalidPolicyRejected) throw new Error("Invalid threshold ordering must be rejected.");

const saved = await policyDomain.saveContentSafetyPolicy(policy, 0, admin);
if (saved.revision !== 1 || JSON.parse(storedPolicy).revision !== 1) throw new Error("Saving must persist and increment the revision.");
let conflict = false;
try {
  await policyDomain.saveContentSafetyPolicy(policy, 0, admin);
} catch (error) {
  conflict = error?.name === "ContentSafetyPolicyConflictError";
}
if (!conflict) throw new Error("A stale expected revision must produce a typed conflict.");
const reset = await policyDomain.resetContentSafetyPolicy(1, admin);
if (reset.revision !== 2 || reset.enabled !== defaults.enabled) throw new Error("Reset must restore defaults and increment the revision.");
forceCasConflict = true;
let atomicConflict = false;
try {
  await policyDomain.saveContentSafetyPolicy(reset, 2, admin);
} catch (error) {
  atomicConflict = error?.name === "ContentSafetyPolicyConflictError" && error.currentRevision === 3;
}
if (!atomicConflict) throw new Error("A concurrent compare-and-set loss must return the latest revision as a conflict.");

const emptyDisabled = policyDomain.normalizeContentSafetyPolicy({
  ...defaults,
  enabled: false,
  categories: [],
  local: { enabled: false, rules: [] },
  model: { ...defaults.model, enabled: false, prompt: "" },
});
if (emptyDisabled.categories.length || emptyDisabled.local.rules.length) {
  throw new Error("Administrators must be able to remove all content rules and categories.");
}

const auditText = JSON.stringify(logs);
for (const secret of ["Objective exception", "trash", defaults.model.prompt]) {
  if (auditText.includes(secret)) throw new Error("Policy audits must not log prompts, terms, or sample content.");
}
if (!logs.some((entry) => entry.action === "Content safety policy saved") || !logs.some((entry) => entry.action === "Content safety policy reset")) {
  throw new Error("Save and reset must emit sanitized audit summaries.");
}

const route = read("src/app/api/content-safety-policy/route.ts");
const resetRoute = read("src/app/api/content-safety-policy/reset/route.ts");
const testRoute = read("src/app/api/content-safety-policy/test/route.ts");
if (!/requireWorkspaceAccount\(request\)/.test(route) || !/export async function GET/.test(route) || !/export async function PUT/.test(route)) {
  throw new Error("The policy read/save route must authenticate GET and PUT.");
}
for (const [source, label] of [[route, "save"], [resetRoute, "reset"], [testRoute, "test"]]) {
  if (!/isWorkspaceAdmin\(account\)/.test(source) || !/status:\s*403/.test(source)) {
    throw new Error(`The ${label} route must reject non-admin users with 403.`);
  }
}
if (!/runModel\s*===\s*true/.test(testRoute)) throw new Error("A paid model policy test must require an explicit runModel true flag.");

const database = read("src/lib/database.ts");
if (!/export async function compareAndSetAppMetaValue/.test(database)) throw new Error("app_meta must expose an atomic compare-and-set helper.");
if (!/UPDATE app_meta SET value = \$1, updated_at = \$2 WHERE key = \$3 AND value = \$4/.test(database)) {
  throw new Error("PostgreSQL policy writes must compare the prior app_meta value atomically.");
}
if (!/UPDATE app_meta SET value = \?, updated_at = \? WHERE key = \? AND value = \?/.test(database)) {
  throw new Error("SQLite policy writes must compare the prior app_meta value atomically.");
}
if (!/ON CONFLICT\(key\) DO NOTHING/.test(database) || !/INSERT OR IGNORE INTO app_meta/.test(database)) {
  throw new Error("First policy writes must use conditional insert paths in PostgreSQL and SQLite.");
}

const routeLogs = [];
let routeActor;
let modelTestCalls = 0;
const nextServer = {
  NextResponse: {
    json(body, init = {}) {
      return { body, status: init.status || 200 };
    },
  },
};
const routeActivity = {
  compactError: (error) => error instanceof Error ? error.message : String(error),
  recordExecutionLog: async (entry) => routeLogs.push(entry),
};
const routeAccounts = {
  requireWorkspaceAccount: async () => {
    if (!routeActor) throw new Error("Workspace account sign-in is required.");
    return routeActor;
  },
  isWorkspaceAdmin: (actor) => actor?.role === "admin",
  isWorkspaceSignInError: (error) => /workspace account sign-in is required/i.test(error instanceof Error ? error.message : String(error)),
};
const policyRoute = loadTsModule("src/app/api/content-safety-policy/route.ts", {
  "next/server": nextServer,
  "@/lib/activity-log": routeActivity,
  "@/lib/content-safety-policy": policyDomain,
  "@/lib/workspace-accounts": routeAccounts,
});
const resetPolicyRoute = loadTsModule("src/app/api/content-safety-policy/reset/route.ts", {
  "next/server": nextServer,
  "@/lib/activity-log": routeActivity,
  "@/lib/content-safety-policy": policyDomain,
  "@/lib/workspace-accounts": routeAccounts,
});
const testPolicyRoute = loadTsModule("src/app/api/content-safety-policy/test/route.ts", {
  "next/server": nextServer,
  "@/lib/activity-log": routeActivity,
  "@/lib/content-safety-policy": policyDomain,
  "@/lib/source-safety": {
    assessSourceSafety: async (sample, testedPolicy) => {
      if (sample.title === "missing-key-private-sample") {
        return {
          ...policyDomain.evaluateLocalContentSafety(sample, testedPolicy),
          status: "skipped",
          error: "OPENAI_API_KEY is not configured",
        };
      }
      if (!testedPolicy.enabled || !testedPolicy.model.enabled) {
        return policyDomain.evaluateLocalContentSafety({}, testedPolicy);
      }
      modelTestCalls += 1;
      return {
        ...policyDomain.evaluateLocalContentSafety({}, testedPolicy),
        decision: "review",
        riskScore: 50,
        status: "success",
        source: "local_model",
      };
    },
  },
  "@/lib/workspace-accounts": routeAccounts,
});

const request = (body) => ({ json: async () => body });
routeActor = undefined;
for (const response of [
  await policyRoute.GET(request()),
  await policyRoute.PUT(request({ policy: defaults, expectedRevision: 3 })),
  await resetPolicyRoute.POST(request({ expectedRevision: 3 })),
  await testPolicyRoute.POST(request({ policy: defaults, sample: { title: "sample" }, runModel: false })),
]) {
  if (response.status !== 401) throw new Error("Every policy API handler must reject unauthenticated requests with 401.");
}

routeActor = { id: "operator-1", displayName: "Operator", role: "operator" };
if ((await policyRoute.GET(request())).status !== 200) throw new Error("Signed-in operators must be able to read the policy.");
for (const response of [
  await policyRoute.PUT(request({ policy: defaults, expectedRevision: 3 })),
  await resetPolicyRoute.POST(request({ expectedRevision: 3 })),
  await testPolicyRoute.POST(request({ policy: defaults, sample: { title: "sample" }, runModel: false })),
]) {
  if (response.status !== 403) throw new Error("Operators must receive 403 for policy mutations and tests.");
}

routeActor = admin;
if ((await policyRoute.PUT(request({ policy: defaults, expectedRevision: 0 }))).status !== 409) {
  throw new Error("The save API must return 409 for a stale expected revision.");
}
const currentRevision = JSON.parse(storedPolicy).revision;
const invalidRulePolicy = {
  ...defaults,
  revision: currentRevision,
  local: {
    enabled: true,
    rules: [{ id: "invalid", name: "Invalid", enabled: true, action: "filter", categoryIds: ["missing"], groups: [{ fields: ["body"], mode: "any", terms: ["private-term"] }] }],
  },
};
if ((await policyRoute.PUT(request({ policy: invalidRulePolicy, expectedRevision: currentRevision }))).status !== 400) {
  throw new Error("The save API must return 400 for invalid policy rules.");
}
if ((await policyRoute.PUT(request(null))).status !== 400 || (await resetPolicyRoute.POST(request(null))).status !== 400 || (await testPolicyRoute.POST(request(null))).status !== 400) {
  throw new Error("Policy APIs must return 400 for non-object JSON bodies.");
}
const saveResponse = await policyRoute.PUT(request({ policy: { ...defaults, revision: currentRevision }, expectedRevision: currentRevision }));
if (saveResponse.status !== 200 || saveResponse.body.policy.revision !== currentRevision + 1) {
  throw new Error("An admin must be able to save a valid policy through the API.");
}
const resetResponse = await resetPolicyRoute.POST(request({ expectedRevision: currentRevision + 1 }));
if (resetResponse.status !== 200 || resetResponse.body.policy.revision !== currentRevision + 2) {
  throw new Error("An admin must be able to reset the policy through the API.");
}

const dryRun = await testPolicyRoute.POST(request({
  policy: resetResponse.body.policy,
  sample: { title: "dry-run-private-sample" },
  runModel: false,
}));
if (dryRun.status !== 200 || modelTestCalls !== 0) throw new Error("A local dry-run must not invoke the model adapter.");
const disabledModelAuditStart = routeLogs.length;
const disabledModelRun = await testPolicyRoute.POST(request({
  policy: { ...resetResponse.body.policy, enabled: false },
  sample: { title: "disabled-model-private-sample" },
  runModel: true,
}));
if (disabledModelRun.status !== 200 || modelTestCalls !== 0) {
  throw new Error("A master-disabled policy test must not invoke the model adapter.");
}
const disabledModelAudit = JSON.stringify(routeLogs.slice(disabledModelAuditStart));
if (!disabledModelAudit.includes("Content safety policy model test skipped") || disabledModelAudit.includes("disabled-model-private-sample")) {
  throw new Error("A skipped model test must emit an explicit sanitized audit outcome.");
}
const modelOffAuditStart = routeLogs.length;
const modelOffRun = await testPolicyRoute.POST(request({
  policy: { ...resetResponse.body.policy, model: { ...resetResponse.body.policy.model, enabled: false } },
  sample: { title: "model-off-private-sample" },
  runModel: true,
}));
if (modelOffRun.status !== 200 || modelTestCalls !== 0) {
  throw new Error("A model-disabled policy test must not invoke the model adapter.");
}
const modelOffAudit = JSON.stringify(routeLogs.slice(modelOffAuditStart));
if (!modelOffAudit.includes("Content safety policy model test skipped") || modelOffAudit.includes("model-off-private-sample")) {
  throw new Error("A model-disabled test must emit a sanitized skipped audit outcome.");
}
const missingKeyAuditStart = routeLogs.length;
const missingKeyRun = await testPolicyRoute.POST(request({
  policy: resetResponse.body.policy,
  sample: { title: "missing-key-private-sample" },
  runModel: true,
}));
if (missingKeyRun.status !== 200 || missingKeyRun.body.assessment.status !== "skipped" || modelTestCalls !== 0) {
  throw new Error("Missing model configuration must return an explicit skipped result without a provider call.");
}
const missingKeyAudit = JSON.stringify(routeLogs.slice(missingKeyAuditStart));
if (!missingKeyAudit.includes("Content safety policy model test skipped") || missingKeyAudit.includes("missing-key-private-sample")) {
  throw new Error("A missing-key model test must emit a sanitized skipped audit outcome.");
}
const auditStart = routeLogs.length;
const modelRun = await testPolicyRoute.POST(request({
  policy: resetResponse.body.policy,
  sample: { title: "model-private-sample" },
  runModel: true,
}));
if (modelRun.status !== 200 || modelTestCalls !== 1) throw new Error("An explicit admin model test must invoke the model adapter once.");
const modelAudit = JSON.stringify(routeLogs.slice(auditStart));
if (!modelAudit.includes("Content safety policy model tested") || modelAudit.includes("model-private-sample")) {
  throw new Error("Model tests must emit a sanitized audit summary without sample content.");
}

console.log("Content safety policy check passed.");
