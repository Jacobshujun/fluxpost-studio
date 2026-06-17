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

const syncPath = path.join(projectRoot, "src/lib/source-import-feishu.ts");
if (!existsSync(syncPath)) throw new Error("Source import Feishu sync module is missing.");

const sync = read("src/lib/source-import-feishu.ts");
const sourceLinkImport = read("src/lib/source-link-import.ts");
const simpleRuns = read("src/lib/simple-runs.ts");
const config = read("src/lib/config.ts");
const checkPs1 = read("scripts/harness/check.ps1");
const resolveSourceTitleBlock = sync.match(/function resolveSourceTitle\(item: NormalizedSourceItem\) \{[\s\S]*?\n\}/)?.[0] || "";

assertContains(config, /feishuSourceImportEnabled:\s*booleanOrDefault\(process\.env\.FEISHU_SOURCE_IMPORT_ENABLED,\s*true\)/, "Source import Feishu sync should be enabled by default.");
assertContains(config, /feishuSourceImportBaseToken:\s*process\.env\.FEISHU_SOURCE_IMPORT_BASE_TOKEN\s*\|\|\s*"JbpPbSIMqaD75wsZ9fAcBy9mnEe"/, "Source import Base token default should match the requested Base.");
assertContains(config, /feishuSourceImportTableId:\s*process\.env\.FEISHU_SOURCE_IMPORT_TABLE_ID\s*\|\|\s*"tbllsn3LBZ6mWTyL"/, "Source import table id default should match the requested table.");

assertContains(sync, /const defaultFieldMap:[\s\S]*sourceUrl:\s*"[^"]+"/, "Source URL field mapping is missing.");
assertContains(sync, /const defaultFieldMap:[\s\S]*title:\s*"[^"]+"/, "Title field mapping is missing.");
assertContains(sync, /const defaultFieldMap:[\s\S]*body:\s*"[^"]+"/, "Body field mapping is missing.");
assertContains(sync, /const defaultFieldMap:[\s\S]*image:\s*"[^"]+"/, "Image attachment field mapping is missing.");
assertContains(sync, /const defaultFieldMap:[\s\S]*video:\s*"[^"]+"/, "Video attachment field mapping is missing.");
assertContains(sync, /const defaultFieldMap:[\s\S]*platform:\s*"[^"]+"/, "Platform field mapping is missing.");
assertContains(sync, /imageFieldId:\s*"fldMHwZDAf"/, "Image upload should use the confirmed image field id.");
assertContains(sync, /videoFieldId:\s*"fldt2fIaoG"/, "Video upload should use the confirmed video field id.");

assertContains(sync, /const labels:\s*Record<Platform,\s*string> = \{[\s\S]*douyin:\s*"[^"]+"/, "Douyin platform label must be mapped.");
assertContains(sync, /const labels:\s*Record<Platform,\s*string> = \{[\s\S]*weibo:\s*"[^"]+"/, "Weibo platform label must be mapped.");
assertContains(sync, /const labels:\s*Record<Platform,\s*string> = \{[\s\S]*xiaohongshu:\s*"[^"]+"/, "Xiaohongshu platform label must be mapped.");
assertContains(sync, /const labels:\s*Record<Platform,\s*string> = \{[\s\S]*wechat_channels:\s*"[^"]+"/, "WeChat Channels platform label must be mapped.");

assertContains(sync, /dedupeSourceItemsByLink\(items\)/, "Sync should dedupe input items by source link before writing.");
assertContains(sync, /type SourceImportLink = \{[\s\S]*sourceUrl:\s*string;[\s\S]*searchKeyword:\s*string;[\s\S]*duplicateValues:\s*string\[\]/, "Source import should separate the written source URL from the Feishu search keyword.");
assertContains(sync, /const feishuRecordSearchKeywordMaxLength = 50/, "Feishu record-search keyword length limit should be encoded.");
assertContains(sync, /resolveSourceLinkForFeishu\(item\)/, "Source-link dedupe should use the Feishu-resolved canonical link.");
assertContains(sync, /return `https:\/\/www\.douyin\.com\/note\/\$\{sourceId\}`/, "Douyin source links should be canonicalized to short note URLs before source-table writes.");
assertContains(sync, /resolveSourceRecordSearchKeyword\(item,\s*sourceUrl,\s*rawSourceUrl\)/, "Duplicate search should derive a short keyword instead of using the full URL.");
assertContains(sync, /compactSourceId\(item\.sourceId\)[\s\S]*extractLikelyContentId\(sourceUrl\)[\s\S]*extractLikelyContentId\(rawSourceUrl\)/, "Record-search keyword should prefer source ids or extracted content ids.");
assertContains(sync, /text\.slice\(0,\s*feishuRecordSearchKeywordMaxLength\)/, "Record-search keyword fallback must be capped to Feishu's 50-character limit.");
assertContains(sync, /search_fields:\s*\[fieldMap\.sourceUrl\]/, "Duplicate detection must search only the source-link field.");
assertContains(sync, /keyword:\s*sourceLink\.searchKeyword/, "Duplicate detection must use the short source-link search keyword.");
assertNotContains(sync, /keyword:\s*sourceUrl/, "Duplicate detection must not use full sourceUrl as record-search keyword.");
assertContains(sync, /"\+record-search"/, "Duplicate detection must use record-search before creating a record.");
assertContains(sync, /findExistingSourceRecordWithAnyExactFieldValue\(parsed,\s*fieldMap,\s*sourceLink\.duplicateValues\)/, "Duplicate detection must exact-match canonical and historical raw source URLs after short-keyword search.");
assertContains(sync, /expected\.has\(item\.trim\(\)\)/, "Duplicate detection must perform exact source-link equality after search.");
assertContains(sync, /status:\s*"skipped_duplicate"/, "Existing source-link records must be skipped rather than rewritten.");

assertContains(sync, /"\+record-batch-create"/, "Text and select fields should be written with record-batch-create.");
assertContains(sync, /fields:\s*\[fieldMap\.sourceUrl,\s*fieldMap\.title,\s*fieldMap\.body,\s*fieldMap\.platform\]/, "Record create payload should write source link, title, body, and platform only.");
assertContains(resolveSourceTitleBlock, /compactText\(item\.title,\s*240\)\s*\|\|\s*""/, "Source import title should use only a real source title and allow blank titles.");
assertNotContains(resolveSourceTitleBlock, /item\.contentText/, "Source import title must not fall back to body text.");
assertNotContains(sourceLinkImport, /title:\s*item\.title\s*\|\|\s*item\.contentText/, "Link import result titles must not use body previews as title fallbacks.");
assertNotContains(sync, /(?<!select_)fields:\s*\[[^\]]*fieldMap\.image[^\]]*\]/, "Attachment fields must not be included in the normal record create payload.");
assertNotContains(sync, /(?<!select_)fields:\s*\[[^\]]*fieldMap\.video[^\]]*\]/, "Video attachments must not be included in the normal record create payload.");
assertContains(sync, /parseCreatedSourceRecordIds\(result\.stdout\)\[0\]/, "Source record creation must parse created record IDs through the source-create parser.");
assertContains(sync, /findStringArray\(parsed,\s*"record_id_list"\)\s*\|\|\s*findRecordIds\(parsed\)/, "Source record creation must handle lark-cli record_id_list responses.");
assertContains(sync, /"\+record-upload-attachment"[\s\S]*"--field-id"[\s\S]*fieldId/, "Attachments must use the dedicated upload command with field ids.");
assertContains(sync, /fieldMap\.imageFieldId/, "Image uploads must use imageFieldId.");
assertContains(sync, /fieldMap\.videoFieldId/, "Video uploads must use videoFieldId.");
assertContains(sync, /resolveSourceImageAttachmentFiles\(item\)[\s\S]*item\.videoFrames\?\.length[\s\S]*item\.downloadedImages/, "Image upload should prefer downloaded high/video frames and otherwise local downloaded images.");
assertContains(sync, /resolveSourceVideoAttachmentFiles\(item\)[\s\S]*item\.downloadedVideoUrl[\s\S]*item\.videoUrl/, "Video upload should consider downloaded local video before video URL.");
assertContains(sync, /select_fields:\s*\[fieldMap\.sourceUrl,\s*fieldMap\.image,\s*fieldMap\.video\]/, "Duplicate search should select attachment fields so missing duplicate attachments can be repaired.");
assertContains(sync, /existingRecord\.imageAttachmentCount === 0\s*\?\s*resolveSourceImageAttachmentFiles\(item\)/, "Duplicate records with empty image attachments should upload local frames/images instead of skipping forever.");
assertContains(sync, /existingRecord\.videoAttachmentCount === 0\s*\?\s*resolveSourceVideoAttachmentFiles\(item\)/, "Duplicate records with empty video attachments should upload local video instead of skipping forever.");
assertContains(sync, /function findTableRecordWithExpectedFieldValue[\s\S]*record_id_list[\s\S]*fields\.indexOf\(fieldMap\.sourceUrl\)[\s\S]*countAttachmentCell/, "Duplicate detection must understand lark-cli table-shaped record-search responses and attachment counts.");
assertContains(sync, /firstFailedSourceItemId[\s\S]*firstFailedSourceError/, "Source import sync logs should include first failed item diagnostics.");
assertContains(sync, /execFileAsync\(invocation\.file,\s*\[\.\.\.invocation\.argsPrefix,\s*\.\.\.args\]/, "Feishu CLI calls must use execFile args, not shell string concatenation.");
assertContains(sync, /runWithConcurrencyPool\("feishu"/, "Source import Feishu CLI calls should use the shared Feishu pool.");
assertContains(sync, /sanitizeCliText/, "Source import Feishu errors must be sanitized before logging.");

assertContains(sourceLinkImport, /syncSourceItemsToFeishu\(safetyResult\.items,\s*\{\s*scope:\s*"crawl\/links"/, "Advanced link import must sync only safety-kept source items.");
assertNotContains(sourceLinkImport, /syncSourceItemsToFeishu\(dedupedItems/, "Advanced link import must not sync unresolved or unsafe raw deduped items.");
assertContains(sourceLinkImport, /sourceFeishuSync\?:\s*SourceImportFeishuSyncResult/, "Advanced link import response should expose source Feishu sync details.");
assertContains(sourceLinkImport, /feishuSourceCreated/, "Advanced link import summary should include source Feishu create counts.");
assertContains(sourceLinkImport, /feishuSourceSkippedDuplicate/, "Advanced link import summary should include source Feishu duplicate skip counts.");

assertContains(simpleRuns, /if \(isSimpleRunLinkMode\(normalizedInput\)\) \{[\s\S]*syncSourceItemsToFeishu\(safetyResult\.items,\s*\{\s*scope:\s*"simple\/run",\s*sourceRunId:\s*run\.id\s*\}/, "Simple link mode must sync only safety-kept source items.");
assertNotContains(simpleRuns, /syncSourceItemsToFeishu\(crawledItems/, "Simple link mode must not sync unresolved or unsafe crawled items.");
assertContains(checkPs1, /Source import Feishu check/, "Harness baseline must include the source import Feishu check.");

console.log("Source import Feishu check passed.");
