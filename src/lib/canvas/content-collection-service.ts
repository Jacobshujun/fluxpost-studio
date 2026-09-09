import { getContentSafetyPolicy, normalizeContentSafetyPolicySnapshot } from "../content-safety-policy";
import { importSourceLinks } from "../source-link-import";
import type { SourceLinkPlatform } from "../types";
import type { WorkspaceAccessActor } from "../workspace-ownership";
import { canvasCollectionSourceLink, validateCanvasCollectionConfig } from "./content-collection";
import type { CanvasArtifact, CanvasNode } from "./types";

export async function collectCanvasContent(node: CanvasNode, account: WorkspaceAccessActor): Promise<Record<string, CanvasArtifact>> {
  const errors = validateCanvasCollectionConfig(node.config);
  if (errors.length) throw new Error(errors[0]);
  const sourceLink = canvasCollectionSourceLink(node.config);
  const result = await importSourceLinks({
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
    throw new Error(failure?.error || `内容采集应返回一条内容，实际返回 ${result.items.length} 条。请检查链接、平台或安全过滤结果。`);
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
