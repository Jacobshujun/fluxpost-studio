import { recordExecutionLog } from "./activity-log";
import { getContentSafetyPolicy, normalizeContentSafetyPolicySnapshot } from "./content-safety-policy";
import { ingestCrawlItems } from "./content-pool";
import { importFeishuContentByTaskNumbers } from "./feishu-content-import";
import { filterUnsafeSourceItems } from "./source-safety";
import { markItemsAsSkippedTagging, tagSourceItems } from "./source-tagging";
import type { SourceLinkImportResponse, SourceLinkImportResult } from "./source-link-import";
import type { WorkspaceAccessActor } from "./workspace-ownership";

export function parseFeishuContentPoolRequest(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("请输入飞书导入参数。");
  const values = body as Record<string, unknown>;
  const query = typeof values.query === "string" ? values.query.trim() : "";
  if (!query || query.length > 80) throw new Error("内容池项目名称须为 1–80 个字符。");
  if (!Array.isArray(values.taskNumbers) || !values.taskNumbers.length || values.taskNumbers.length > 200) throw new Error("请输入 1–200 个飞书编号，每行一个。");
  const taskNumbers = values.taskNumbers.map((value: unknown) => {
    if (typeof value !== "string" || !value.trim() || /[\r\n,，;；\t ]/.test(value.trim())) throw new Error("每行只能填写一个飞书编号。");
    return value.trim();
  });
  for (const key of ["skipTagging", "enableVideoTranscription", "videoFrameOriginalReference"]) {
    if (values[key] !== undefined && typeof values[key] !== "boolean") throw new Error(`${key} 必须为布尔值。`);
  }
  if (values.collectionId !== undefined && typeof values.collectionId !== "string") throw new Error("内容库 ID 必须为字符串。");
  return {
    query, taskNumbers,
    collectionId: typeof values.collectionId === "string" ? values.collectionId.trim() || undefined : undefined,
    skipTagging: values.skipTagging === true,
    enableVideoTranscription: values.enableVideoTranscription === true,
    videoFrameOriginalReference: values.videoFrameOriginalReference !== false,
  };
}

type FeishuPoolImportInput = ReturnType<typeof parseFeishuContentPoolRequest> & {
  owner: WorkspaceAccessActor;
  requireSingle?: boolean;
};

export async function importFeishuContentToPool(input: FeishuPoolImportInput): Promise<SourceLinkImportResponse> {
  const options = parseFeishuContentPoolRequest(input);
  const taskNumbers = [...new Set(options.taskNumbers)];
  if (input.requireSingle && taskNumbers.length !== 1) throw new Error("每个内容任务只能导入一个飞书编号。");
  const imported = await importFeishuContentByTaskNumbers(taskNumbers, { enableVideoTranscription: options.enableVideoTranscription });
  if (input.requireSingle && imported.items.length !== 1) {
    throw new Error(imported.results.find((result) => result.status !== "imported")?.error || `飞书编号应返回一条内容，实际返回 ${imported.items.length} 条。`);
  }
  const scope = input.requireSingle ? "canvas/content-collection" : "crawl/feishu";
  const safety = await filterUnsafeSourceItems(imported.items.map((item) => ({ ...item, videoFrameOriginalReference: options.videoFrameOriginalReference })),
    { scope, query: options.query }, normalizeContentSafetyPolicySnapshot(await getContentSafetyPolicy()));
  if (input.requireSingle && safety.items.length !== 1) throw new Error("飞书内容未通过来源安全过滤。");
  const items = !safety.items.length ? [] : options.skipTagging ? markItemsAsSkippedTagging(safety.items) : await tagSourceItems(safety.items);
  const keptIds = new Set(items.map((item) => item.id));
  const results: SourceLinkImportResult[] = imported.results.map((result) => ({
    url: result.taskNumber, platform: "feishu", sourceId: result.taskNumber, itemId: result.itemId, title: result.title,
    status: result.status !== "imported" ? "failed" : result.itemId && !keptIds.has(result.itemId) ? "filtered" : "imported",
    error: result.status === "imported" && result.itemId && !keptIds.has(result.itemId) ? "内容未通过来源安全过滤。" : result.error,
  }));
  const project = items.length ? await ingestCrawlItems(options.query, items, input.owner, { collectionId: options.collectionId }) : undefined;
  const summary = {
    total: results.length, valid: results.filter((result) => result.status !== "failed").length,
    imported: results.filter((result) => result.status === "imported").length,
    filteredUnsafe: results.filter((result) => result.status === "filtered").length,
    duplicates: options.taskNumbers.length - taskNumbers.length, unsupported: 0,
    failed: results.filter((result) => result.status === "failed").length,
    taggedContent: items.filter((item) => item.contentTagging?.status === "success").length,
    taggedVisual: items.reduce((sum, item) => sum + (item.visualTagging?.assets.length || 0), 0),
    localImages: items.reduce((sum, item) => sum + (item.downloadedImages?.length || 0), 0),
    videoFrames: items.reduce((sum, item) => sum + (item.videoFrames?.length || 0), 0),
  };
  await recordExecutionLog({ scope, action: "Feishu content-pool import completed", status: summary.imported ? "success" : "info",
    message: `Imported ${summary.imported}/${summary.total} Feishu record(s).`, details: summary });
  return { query: options.query, items, project, results, summary };
}
