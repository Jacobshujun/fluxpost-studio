import {
  RuntimeImageUploadInputError,
  saveRuntimeImageUpload,
  type RuntimeImageUploadResult,
} from "./runtime-image-upload";

export { RuntimeImageUploadInputError as ReviewImageUploadInputError };
export type ReviewImageUploadResult = RuntimeImageUploadResult;

export function saveReviewImageUpload(file: File): Promise<ReviewImageUploadResult> {
  return saveRuntimeImageUpload(file, { directory: "review-uploads", prefix: "review" });
}
