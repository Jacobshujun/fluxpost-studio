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

const importPath = path.join(projectRoot, "src/lib/feishu-content-import.ts");
if (!existsSync(importPath)) throw new Error("Feishu content import module is missing.");

const contentImport = read("src/lib/feishu-content-import.ts");
const simpleRuns = read("src/lib/simple-runs.ts");
const route = read("src/app/api/simple/runs/route.ts");
const page = read("src/app/page.tsx");
const types = read("src/lib/types.ts");
const config = read("src/lib/config.ts");
const checkPs1 = read(".trellis/verification/check.mjs");

assertContains(config, /feishuContentImportBaseToken:\s*process\.env\.FEISHU_CONTENT_IMPORT_BASE_TOKEN\s*\|\|\s*process\.env\.FEISHU_BITABLE_APP_TOKEN/, "Feishu content import should default to the publish Base token.");
assertContains(config, /feishuContentImportTableId:\s*process\.env\.FEISHU_CONTENT_IMPORT_TABLE_ID\s*\|\|\s*process\.env\.FEISHU_BITABLE_TABLE_ID/, "Feishu content import should default to the publish table.");
assertContains(config, /feishuContentImportFieldMap:\s*process\.env\.FEISHU_CONTENT_IMPORT_FIELD_MAP/, "Feishu content import field map env wiring is missing.");
assertContains(config, /feishuContentImportConfigured:\s*Boolean\([\s\S]*feishuContentImportBaseToken[\s\S]*feishuContentImportTableId/, "Config status must expose Feishu content import readiness.");

for (const fieldName of ["任务编号", "动态标题", "动态正文", "动态素材", "车型"]) {
  assertContains(contentImport, new RegExp(`"${fieldName}"`), `Default Feishu import field is missing: ${fieldName}`);
}

assertContains(contentImport, /"\+record-search"/, "Feishu import must search Base records by task number.");
assertContains(contentImport, /search_fields:\s*\[fieldMap\.taskNumber\]/, "Task-number search must be limited to the task number field.");
assertContains(contentImport, /select_fields:\s*\[fieldMap\.taskNumber,\s*fieldMap\.title,\s*fieldMap\.body,\s*fieldMap\.materials,\s*fieldMap\.vehicle\]/, "Task-number search must project only required import fields.");
assertContains(contentImport, /findRecordWithExactTaskNumber\(parseJsonOutput\(result\.stdout\),\s*fieldMap,\s*taskNumber\)/, "Feishu import must exact-match task numbers after keyword search.");
assertContains(contentImport, /"\+record-get"/, "Feishu import should support direct Base record ids.");
assertContains(contentImport, /"\+record-download-attachment"/, "Feishu dynamic materials must be downloaded through the Base attachment command.");
assertContains(contentImport, /for \(const key of \["file_token",\s*"fileToken",\s*"token"\]\)/, "Feishu import must extract attachment file tokens from Base cell values.");
assertContains(contentImport, /"public",\s*"media",\s*"crawl",\s*"feishu"/, "Feishu imported materials must be stored under public/media/crawl/feishu.");
assertContains(contentImport, /enableVideoTranscription\?:\s*boolean/, "Feishu content import must accept the video transcription switch.");
assertContains(contentImport, /cacheCrawledMedia\(importedItems,\s*\{\s*enableVideoTranscription:\s*options\.enableVideoTranscription === true\s*\}\)/, "Feishu imported items must pass through the existing media cache path with explicit transcription opt-in.");
assertContains(contentImport, /platform:\s*"feishu"/, "Feishu imported source items must use platform=feishu.");
assertContains(contentImport, /raw:\s*\{[\s\S]*feishu:\s*\{[\s\S]*recordId:[\s\S]*taskNumber,[\s\S]*vehicle/, "Feishu raw metadata must include record id, task number, and vehicle.");
const rawFeishuBlock = /raw:\s*\{\s*feishu:\s*\{([\s\S]*?)\n\s*\},\n\s*\},/.exec(contentImport)?.[1] || "";
assertNotContains(rawFeishuBlock, /feishuContentImportBaseToken|feishuBitableAppToken/, "Feishu Base tokens must not be stored in imported item raw metadata.");
assertContains(contentImport, /runWithConcurrencyPool\("feishu"/, "Feishu import CLI calls must use the shared Feishu pool.");
assertContains(contentImport, /sanitizeCliText/, "Feishu import errors must be sanitized before surfacing.");

assertContains(types, /export type SourceLinkPlatform = CrawlPlatform \| "xiaopeng_bbs"/, "Source-link platforms should extend crawl platforms without adding Feishu as a TikHub platform.");
assertContains(types, /export type Platform = SourceLinkPlatform \| "feishu" \| "original"/, "Platform type must include Feishu as an import source.");
assertContains(types, /sourceMode\?:\s*"keyword"\s*\|\s*"links"\s*\|\s*"feishu"[\s\S]*"pool"/, "SimpleRunInput must persist Feishu source mode.");
assertContains(types, /feishuTaskNumbers\?:\s*string\[\]/, "SimpleRunInput must persist Feishu task numbers.");
assertContains(types, /export type SimpleRunFeishuResult = \{[\s\S]*status:\s*"imported"\s*\|\s*"not_found"\s*\|\s*"failed"/, "SimpleRun must persist per-task Feishu import results.");
assertContains(types, /feishuResults\?:\s*SimpleRunFeishuResult\[\]/, "SimpleRun must carry Feishu import results.");

assertContains(simpleRuns, /importFeishuContentByTaskNumbers/, "Simple run workflow must use the Feishu content import module.");
assertContains(simpleRuns, /normalizeFeishuTaskNumberInput/, "Simple run input normalization must reuse Feishu task-number normalization.");
assertContains(simpleRuns, /function isSimpleRunFeishuMode/, "Simple run workflow must expose a Feishu-mode guard.");
assertContains(simpleRuns, /collectSimpleFeishuItems/, "Simple run workflow must branch into Feishu collection.");
assertContains(simpleRuns, /applyUnsafeFilterFeishuResults/, "Feishu per-task results should reflect source-safety filtering.");
assertContains(simpleRuns, /ingestSimpleTaggedItems\(normalizedInput,\s*taggedItems,\s*access\)/, "Simple run workflow must route tagged items through source-mode-aware ingest.");
assertContains(simpleRuns, /groupFeishuItemsByVehicle/, "Feishu imported items must be grouped by vehicle before content-pool ingest.");
assertContains(simpleRuns, /raw\.feishu\?\.vehicle\?\.trim\(\)/, "Feishu vehicle must map to the content project keyword.");

assertContains(route, /sourceMode\?:\s*"keyword"\s*\|\s*"links"\s*\|\s*"feishu"[\s\S]*"pool"/, "Simple run API must accept Feishu source mode.");
assertContains(route, /feishuTaskNumbers\?:\s*string\[\]\s*\|\s*string/, "Simple run API must accept Feishu task numbers.");
assertContains(route, /baseSourceMode\s*=\s*body\.sourceMode === "feishu" \? "feishu" : body\.sourceMode === "links" \? "links" : body\.sourceMode === "pool" \? "pool" : "keyword"/, "Simple run API must preserve Feishu/link/pool/keyword source mode mapping.");
assertContains(route, /sourceMode:\s*body\.sourceMode === "original" \? "original" : body\.sourceMode === "viral" \? "viral" : baseSourceMode/, "Simple run API must forward the resolved source mode.");
assertContains(route, /feishuTaskNumbers:\s*body\.feishuTaskNumbers/, "Simple run API must forward Feishu task numbers.");

assertContains(page, /type SimpleSourceMode = "keyword" \| "links" \| "feishu"/, "Simple UI must define Feishu source mode.");
assertContains(page, /simpleFeishuTaskText/, "Simple UI must keep controlled Feishu task-number state.");
assertContains(page, /function splitFeishuTaskNumbers/, "Simple UI must split pasted Feishu task numbers.");
assertContains(page, /<FieldLabel label=\{`飞书任务编号 · \$\{feishuTaskCount\} 条`\} \/>/, "Compact workspace must render the Feishu task-number input and count.");
assertContains(page, /feishuTaskNumbers:\s*sourceMode === "feishu" \? feishuTaskNumbers : undefined/, "Simple start request must send Feishu task numbers.");
assertContains(page, /writeFeishu \? "开始生产并写入飞书" : "开始生产待审查内容"/, "Compact start button must describe both Feishu auto-write and review-only flows.");
assertContains(page, /crawlPlatforms\.map/, "Keyword and link platform controls must use crawl platforms, not include Feishu as a TikHub platform.");

assertContains(checkPs1, /Feishu content import check/, "Trellis baseline must include the Feishu content import check.");

console.log("Feishu content import check passed.");
