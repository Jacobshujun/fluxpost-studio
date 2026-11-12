import { getContentSafetyPolicy, normalizeContentSafetyPolicySnapshot } from "../content-safety-policy";
import { importSourceLinks } from "../source-link-import";
import { importFeishuContentByTaskNumbers, normalizeFeishuTaskNumberInput } from "../feishu-content-import";
import { filterUnsafeSourceItems } from "../source-safety";
import { markItemsAsSkippedTagging, tagSourceItems } from "../source-tagging";
import { ingestCrawlItems } from "../content-pool";
import type { SourceLinkPlatform } from "../types";
import type { WorkspaceAccessActor } from "../workspace-ownership";
import { canvasCollectionSourceLabel, canvasCollectionSourceLink, validateCanvasCollectionConfig } from "./content-collection";
import type { CanvasArtifact, CanvasNode } from "./types";

export async function collectCanvasContent(node: CanvasNode, account: WorkspaceAccessActor): Promise<Record<string, CanvasArtifact>> {
  const errors = validateCanvasCollectionConfig(node.config);
  if (errors.length) throw new Error(errors[0]);
  const sourceLink = canvasCollectionSourceLink(node.config);
  const result = node.config.platform === "feishu" ? await collectFeishuContent(node, account, sourceLink) : await importSourceLinks({
    query: String(node.config.projectName).trim(),
    links: [sourceLink],
    platform: node.config.platform === "auto" ? undefined : node.config.platform as SourceLinkPlatform,
    owner: account,
    skipTagging: node.config.automaticTagging !== true,
    videoFrameOriginalReference: node.config.videoFrameOriginalReference !== false,
    enableVideoTranscription: node.config.enableVideoTranscription === true,
    contentSafetyPolicy: normalizeContentSafetyPolicySnapshot(await getContentSafetyPolicy()),
  });
  if (result.items.length !== 1) {
    const failure = result.results.find((item) => item.status !== "imported");
    throw new Error(failure?.error || `内容采集应返回一条内容，实际返回 ${result.items.length} 条。请检查${canvasCollectionSourceLabel(node.config)}、平台或安全过滤结果。`);
  }
  const item = result.items[0];
  const imageUrls = item.downloadedImages?.length ? item.downloadedImages : item.images;
  const videoUrl = item.downloadedVideoUrl || item.videoUrl;
  return {
    title: { kind: "text", value: item.title || "" },
    body: { kind: "text", value: item.contentText || "" },
    source: { kind: "text", value: item.sourceUrl || sourceLink },
    images: { kind: "images", items: [...new Set(imageUrls || [])].map((url) => ({ url })) },
    videos: { kind: "videos", items: videoUrl ? [{ url: videoUrl }] : [] },
  };
}

async function collectFeishuContent(node: CanvasNode, account: WorkspaceAccessActor, source: string) {
  const numbers = normalizeFeishuTaskNumberInput(source);
  if (numbers.length !== 1) throw new Error("每个内容任务只能导入一个飞书编号；多个编号请每行一条并使用批量调度。");
  const imported = await importFeishuContentByTaskNumbers(numbers, {
    enableVideoTranscription: node.config.enableVideoTranscription === true,
  });
  if (imported.items.length !== 1) {
    throw new Error(imported.results.find((result) => result.status !== "imported")?.error || `飞书编号应返回一条内容，实际返回 ${imported.items.length} 条。`);
  }
  const query = String(node.config.projectName).trim();
  const safety = await filterUnsafeSourceItems(imported.items.map((item) => ({
    ...item, videoFrameOriginalReference: node.config.videoFrameOriginalReference !== false,
  })), { scope: "canvas/content-collection", query }, normalizeContentSafetyPolicySnapshot(await getContentSafetyPolicy()));
  if (safety.items.length !== 1) throw new Error("飞书内容未通过来源安全过滤。");
  const items = node.config.automaticTagging === true ? await tagSourceItems(safety.items) : markItemsAsSkippedTagging(safety.items);
  await ingestCrawlItems(query, items, account);
  return { items, results: imported.results };
}
