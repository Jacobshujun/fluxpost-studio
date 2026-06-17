import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assertContains(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function assertNotContains(source, pattern, message) {
  if (pattern.test(source)) throw new Error(message);
}

const modulePath = path.join(projectRoot, "src/lib/distribution-check.ts");
const routePath = path.join(projectRoot, "src/app/api/distribution-check/route.ts");
const pagePath = path.join(projectRoot, "src/app/distribution-check/page.tsx");
if (!existsSync(modulePath)) throw new Error("Distribution check module is missing.");
if (!existsSync(routePath)) throw new Error("Distribution check API route is missing.");
if (!existsSync(pagePath)) throw new Error("Distribution check page is missing.");

const moduleSource = read("src/lib/distribution-check.ts");
const route = read("src/app/api/distribution-check/route.ts");
const page = read("src/app/distribution-check/page.tsx");
const config = read("src/lib/config.ts");
const types = read("src/lib/types.ts");
const settings = read("src/lib/workspace-settings.ts");
const home = read("src/app/page.tsx");
const checkPs1 = read("scripts/harness/check.ps1");
const settingsRoute = read("src/app/api/workspace/settings/route.ts");
const promptDefaults = read("src/lib/distribution-check-prompt.ts");

assertContains(config, /feishuDistributionCheckBaseToken:\s*process\.env\.FEISHU_DISTRIBUTION_CHECK_BASE_TOKEN\s*\|\|\s*"JbpPbSIMqaD75wsZ9fAcBy9mnEe"/, "Distribution check should default to the requested Base token.");
assertContains(config, /feishuDistributionCheckTableId:\s*process\.env\.FEISHU_DISTRIBUTION_CHECK_TABLE_ID\s*\|\|\s*"tblA0EfoAF9J4ffi"/, "Distribution check should default to the requested table id.");
assertContains(config, /feishuDistributionCheckViewId:\s*process\.env\.FEISHU_DISTRIBUTION_CHECK_VIEW_ID\s*\|\|\s*"vewE44G31p"/, "Distribution check should preserve the requested view id.");
assertContains(config, /feishuDistributionCheckFieldMap:\s*process\.env\.FEISHU_DISTRIBUTION_CHECK_FIELD_MAP/, "Distribution check field map env wiring is missing.");
assertContains(types, /feishuDistributionCheckConfigured:\s*boolean/, "ConfigStatus must expose distribution-check readiness.");
assertContains(types, /distributionCheckPrompt:\s*string/, "Workspace settings must expose the distribution-check prompt.");
assertContains(promptDefaults, /defaultDistributionCheckPrompt/, "Distribution check default prompt module is missing.");
assertContains(settings, /distributionCheckPrompt:\s*defaultDistributionCheckPrompt/, "Workspace settings must include the default distribution-check prompt.");
assertContains(settings, /distributionCheckPrompt:\s*stringOrDefault\(input\.distributionCheckPrompt/, "Workspace settings must normalize saved distribution-check prompt.");
assertContains(settingsRoute, /distributionCheckPromptLength/, "Workspace settings route should log distribution prompt length.");

for (const fieldName of ["编号", "动态标题", "动态正文", "动态素材", "车型", "是否分发"]) {
  assertContains(moduleSource, new RegExp(`"${fieldName}"`), `Default distribution check field missing: ${fieldName}`);
}

assertContains(moduleSource, /"\+record-search"/, "Distribution check must search Base records by number.");
assertContains(moduleSource, /"\+field-list"/, "Distribution check must preflight Base fields before writes.");
assertContains(moduleSource, /"\+field-list"[\s\S]*"--jq"[\s\S]*"\."/m, "Distribution field-list must use --jq . because this CLI command has no --format flag.");
assertNotContains(moduleSource, /"\+field-list"[\s\S]{0,500}"--format"/m, "Distribution field-list must not pass the unsupported --format flag.");
assertContains(moduleSource, /assertDistributionFieldsReady\(fieldMap\)/, "Distribution check must call the field preflight.");
assertContains(moduleSource, /search_fields:\s*\[fieldMap\.number\]/, "Distribution check search must be scoped to 编号.");
assertContains(moduleSource, /select_fields:\s*\[fieldMap\.number,\s*fieldMap\.title,\s*fieldMap\.body,\s*fieldMap\.materials,\s*fieldMap\.vehicle,\s*fieldMap\.distribution\]/, "Distribution check must project only required fields.");
assertContains(moduleSource, /findRecordWithExactNumber\(parseJsonOutput\(result\.stdout\),\s*fieldMap,\s*number\)/, "Distribution check must exact-match 编号 after keyword search.");
assertContains(moduleSource, /"\+record-batch-update"/, "Distribution check must update Base records with record-batch-update.");
assertContains(moduleSource, /record_id_list:\s*batch/, "Distribution update must send record_id_list.");
assertContains(moduleSource, /\[fieldMap\.distribution\]:\s*decision/, "Distribution update must patch 是否分发 with the assessment decision.");
assertContains(moduleSource, /const defaultFieldMap[\s\S]*distribution:\s*"是否分发"/, "Default field map must include 是否分发.");
assertContains(moduleSource, /const maxNumbersPerBatch = 200/, "Distribution check must cap one batch at 200 numbers.");
assertContains(moduleSource, /distribution:\s*blocked \? "不可分发" : "可分发"/, "Local assessment must map blocked records to 不可分发.");
assertContains(moduleSource, /if \(local\.distribution === "不可分发"\) return local/, "Local hard risks should conservatively block distribution.");
assertContains(moduleSource, /distribution 只能是“可分发”或“不可分发”/, "Model prompt must constrain output values.");
assertContains(moduleSource, /defaultDistributionCheckPrompt/, "Distribution check should fall back to the default prompt.");
assertContains(moduleSource, /customPrompt\?:\s*string/, "Distribution check model prompt should accept a custom prompt.");
assertContains(moduleSource, /auditPrompt/, "Distribution check model prompt should include the user-editable audit prompt.");
assertContains(moduleSource, /runWithConcurrencyPool\("feishu"/, "Distribution check CLI calls must use the shared Feishu pool.");
assertContains(moduleSource, /sanitizeCliText/, "Distribution check errors must be sanitized.");
assertNotContains(moduleSource, /\+record-upload-attachment|\+record-download-attachment/, "Distribution check should not touch Base attachments.");

assertContains(route, /requireWorkspaceAccount\(request\)/, "Distribution check API must require workspace auth before Feishu writes.");
assertContains(route, /getWorkspacePromptSettings\(\)/, "Distribution check API must load the saved prompt settings.");
assertContains(route, /runDistributionCheck\(body\.numbers,\s*\{[\s\S]*prompt:/, "Distribution check API must pass the custom prompt to the domain helper.");
assertContains(page, /\/api\/distribution-check/, "Distribution check page must call the API route.");
assertContains(page, /\/api\/workspace\/settings/, "Distribution check page must load and save prompt settings.");
assertContains(page, /审核提示词/, "Distribution check page must expose prompt editing.");
assertContains(page, /保存提示词/, "Distribution check page must expose prompt saving.");
assertContains(page, /distributionCheckPrompt/, "Distribution check page must read and write distributionCheckPrompt.");
assertContains(page, /defaultDistributionCheckPrompt/, "Distribution check page must offer the default prompt.");
assertContains(page, /开始判断并回写/, "Distribution check page must expose the requested one-step action.");
assertContains(page, /是否分发/, "Distribution check page must show the target field meaning.");
assertContains(home, /href="\/distribution-check"/, "Home page must link to the distribution check tool.");
assertContains(checkPs1, /Distribution check/, "Harness baseline must include the distribution check.");

console.log("Distribution check passed.");
