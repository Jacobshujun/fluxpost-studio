import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const projectRoot = process.cwd();
const nodeRequire = createRequire(import.meta.url);

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assertContains(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function loadTsModule(relativePath, requireMap = {}) {
  const sourcePath = path.join(projectRoot, relativePath);
  const source = readFileSync(sourcePath, "utf8");
  const transpiled = ts.transpileModule(source, {
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
    URL,
    console,
    module: cjsModule,
    exports: cjsModule.exports,
    require: (name) => {
      if (Object.hasOwn(requireMap, name)) return requireMap[name];
      if (name.startsWith("node:")) return nodeRequire(name);
      throw new Error(`Unexpected import in ${relativePath}: ${name}`);
    },
  };
  vm.runInNewContext(transpiled.outputText, sandbox, { filename: sourcePath });
  return cjsModule.exports;
}

const helperPath = "src/lib/feishu-field-options.ts";
const routePath = "src/app/api/publish/feishu/vehicle-options/route.ts";

const types = read("src/lib/types.ts");
const feishu = read("src/lib/feishu-cli.ts");
const reviewRoute = read("src/app/api/review/route.ts");
const publishRoute = read("src/app/api/publish/feishu/route.ts");
const reviewPage = read("src/app/review/page.tsx");
const check = read(".trellis/verification/check.ps1");

if (!existsSync(path.join(projectRoot, helperPath))) throw new Error("Feishu field-options helper is missing.");
if (!existsSync(path.join(projectRoot, routePath))) throw new Error("Feishu vehicle options API route is missing.");

const helper = read(helperPath);
const vehicleRoute = read(routePath);

assertContains(types, /export type GeneratedPost = \{[\s\S]*feishuVehicle\?:\s*string/, "GeneratedPost must persist a manual Feishu vehicle value.");
assertContains(
  feishu,
  /function formatVehicleFieldValue\(post: GeneratedPost\)[\s\S]*post\.feishuVehicle\?\.trim\(\)\s*\|\|\s*post\.taskKeyword\?\.trim\(\)\s*\|\|\s*null/,
  "Feishu vehicle field must prefer manual feishuVehicle and fall back to taskKeyword.",
);
assertContains(helper, /"\+field-list"/, "Vehicle options helper must read Feishu Base fields through field-list.");
assertContains(helper, /appConfig\.feishuBitableAppToken/, "Vehicle options helper must use the publish Base token.");
assertContains(helper, /appConfig\.feishuBitableTableId/, "Vehicle options helper must use the publish table id.");
assertContains(helper, /extractSingleSelectOptions/, "Vehicle options helper must extract single-select options.");
assertContains(helper, /export function normalizeFeishuVehicleValue/, "Vehicle options helper must expose publish-time vehicle normalization.");
assertContains(helper, /normalizeMonaAlias/, "Vehicle normalization must support MONA alias matching.");
assertContains(vehicleRoute, /requireWorkspaceAccount\(request\)/, "Vehicle options API must require a workspace account.");
assertContains(vehicleRoute, /listFeishuVehicleOptions/, "Vehicle options API must delegate to the helper.");
assertContains(publishRoute, /normalizePostsForFeishuPublish/, "Manual Feishu publish route must preflight posts before enqueue.");
assertContains(publishRoute, /normalizeFeishuVehicleValue/, "Manual Feishu publish route must normalize vehicle values against real Base options.");
assertContains(publishRoute, /Feishu \$\{vehicleOptions\.fieldName\} option not found/, "Manual Feishu publish route must reject unknown vehicle options before queueing.");
assertContains(publishRoute, /enqueueFeishuPublishJob\(postsForPublish/, "Manual Feishu publish route must enqueue normalized posts.");
assertContains(reviewRoute, /manualPatch\?: Partial<Pick<GeneratedPost,[\s\S]*"feishuVehicle"/, "Review API manualPatch must allow feishuVehicle.");
assertContains(reviewRoute, /if \("feishuVehicle" in body\.manualPatch\) allowedPatch\.feishuVehicle = body\.manualPatch\.feishuVehicle/, "Review API must preserve feishuVehicle in manual patches.");
assertContains(reviewPage, /\/api\/publish\/feishu\/vehicle-options/, "Standalone review page must load Feishu vehicle options.");
assertContains(reviewPage, /feishuVehicle/, "Standalone review page must render or persist feishuVehicle.");
assertContains(check, /feishu_vehicle_options_check\.mjs/, "Trellis baseline must include the Feishu vehicle options check.");

const helperModule = loadTsModule(helperPath, {
  "./config": {
    appConfig: {
      feishuCliBin: "",
      feishuBitableAppToken: "",
      feishuBitableTableId: "",
      feishuBitableFieldMap: "",
    },
  },
  "./concurrency": {
    runWithConcurrencyPool: async (_pool, operation) => operation(),
  },
  "./feishu-cli": {
    resolveFeishuCliInvocation: () => {
      throw new Error("resolveFeishuCliInvocation should not run in normalization checks.");
    },
  },
});
const normalized = helperModule.normalizeFeishuVehicleValue("小鹏L03", ["小鹏G6", "小鹏MONA L03", "小鹏X9"]);
if (!normalized.matched || normalized.value !== "小鹏MONA L03" || normalized.normalizedFrom !== "小鹏L03") {
  throw new Error("Vehicle normalization should map 小鹏L03 to the existing 小鹏MONA L03 option.");
}
const unknown = helperModule.normalizeFeishuVehicleValue("小鹏L05", ["小鹏G6", "小鹏MONA L03", "小鹏X9"]);
if (unknown.matched || unknown.value !== "小鹏L05") {
  throw new Error("Vehicle normalization should reject unknown vehicle values.");
}

console.log("Feishu vehicle options check passed.");
