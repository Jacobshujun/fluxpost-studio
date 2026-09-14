import type { GeneratedPost, Platform } from "./types";

export type ReviewListItem = Pick<GeneratedPost, "id" | "title" | "status" | "platform" | "updatedAt"> & {
  excerpt: string;
  author: string;
  mediaCount: number;
  thumbnailVersion?: string;
};
export type ReviewListPage = { posts: ReviewListItem[]; nextCursor?: string };
export type ReviewMetadata = {
  summary: { total: number; ready: number; approved: number; published: number };
  authors: string[];
  platforms: Platform[];
};
export type ReviewPatch = Partial<Pick<GeneratedPost, "title" | "body" | "imagePrompt" | "status" | "imageUrls" | "videoUrls" | "imageTasks" | "feishuVehicle" | "xhsSeries">>;
export type ReviewSaveRequest = { postId?: string; post?: GeneratedPost; manualPatch?: ReviewPatch; instruction?: string };
export const reviewPatchFields = ["title", "body", "imagePrompt", "status", "imageUrls", "videoUrls", "imageTasks", "feishuVehicle", "xhsSeries"] as const;

export function changedReviewFields(draft: GeneratedPost, persisted: GeneratedPost): ReviewPatch {
  return Object.fromEntries(reviewPatchFields.filter((key) => draft[key] !== persisted[key] && JSON.stringify(draft[key]) !== JSON.stringify(persisted[key])).map((key) => [key, draft[key]])) as ReviewPatch;
}

export function reviewListItemFromPost(post: GeneratedPost): ReviewListItem {
  return { id: post.id, title: post.title, status: post.status, platform: post.platform, updatedAt: post.updatedAt,
    excerpt: (post.body || post.imagePrompt || "").slice(0, 160), author: post.ownerDisplayName?.trim() || post.ownerUserId?.trim() || "未标记作者",
    mediaCount: post.imageUrls.length + (post.videoUrls?.length || 0), thumbnailVersion: post.imageUrls[0] };
}

export function reviewThumbnailUrl(postId: string, index: number, version: string, size: 240 | 960 = 240) {
  return `/api/review/posts/${encodeURIComponent(postId)}/thumbnail?index=${index}&size=${size}&v=${encodeURIComponent(version)}`;
}
