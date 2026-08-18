export const feishuPublishModes = ["full", "text", "media"] as const;

export type FeishuPublishMode = (typeof feishuPublishModes)[number];

export const feishuPublishModeOptions: ReadonlyArray<{ value: FeishuPublishMode; label: string }> = [
  { value: "full", label: "完整写入" },
  { value: "text", label: "仅标题与正文" },
  { value: "media", label: "仅图片与视频" },
];

export function isFeishuPublishMode(value: unknown): value is FeishuPublishMode {
  return typeof value === "string" && feishuPublishModes.includes(value as FeishuPublishMode);
}

export function normalizeFeishuPublishMode(value: unknown): FeishuPublishMode {
  if (value === undefined) return "full";
  if (isFeishuPublishMode(value)) return value;
  throw new Error(`Feishu publish mode must be one of: ${feishuPublishModes.join(", ")}.`);
}

export function feishuPublishModeIncludesText(mode: FeishuPublishMode) {
  return mode === "full" || mode === "text";
}

export function feishuPublishModeIncludesMedia(mode: FeishuPublishMode) {
  return mode === "full" || mode === "media";
}

export function buildCustomMediaAttachmentEvidence(
  posts: Array<{ id: string; imageUrls: string[]; videoUrls?: string[] }>,
  recordMappings: Array<{ postId: string; recordId: string }>,
) {
  const recordIdByPostId = new Map(recordMappings.map((mapping) => [mapping.postId, mapping.recordId]));
  return posts.flatMap((post) => {
    const recordId = recordIdByPostId.get(post.id);
    const fileCount = [...post.imageUrls, ...(post.videoUrls || [])].filter((url) => url.trim()).length;
    return recordId && fileCount
      ? [{ postId: post.id, recordId, fileCount, status: "uploaded" as const, stdout: "", stderr: "" }]
      : [];
  });
}

export function formatFeishuPublishMode(mode: FeishuPublishMode) {
  return feishuPublishModeOptions.find((option) => option.value === mode)?.label || mode;
}
