import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import { getGeneratedPost } from "@/lib/generated-posts";
import { ReviewImageUploadInputError, saveReviewImageUpload } from "@/lib/review-image-upload";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const account = await requireWorkspaceAccount(request);
    const form = await request.formData();
    const file = form.get("file");
    const postId = formValueToString(form.get("postId"));
    const imageIndex = formValueToNumber(form.get("imageIndex"));
    const mode = formValueToString(form.get("mode")) === "append" ? "append" : "replace";

    if (!postId) return NextResponse.json({ error: "Post id is required" }, { status: 400 });
    if (!isUploadedFile(file)) return NextResponse.json({ error: "Image file is required" }, { status: 400 });

    const post = await getGeneratedPost(postId, account);
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    const isInvalidReplacementIndex = (imageIndex >= post.imageUrls.length) && mode !== "append";
    const isInvalidAppendIndex = mode === "append" && imageIndex !== post.imageUrls.length;
    if (!Number.isSafeInteger(imageIndex) || imageIndex < 0 || isInvalidReplacementIndex || isInvalidAppendIndex) {
      return NextResponse.json({ error: "Image index is invalid" }, { status: 400 });
    }

    await recordExecutionLog({
      scope: "review",
      action: "开始上传审查替换图片",
      status: "running",
      message: `准备保存第 ${imageIndex + 1} 张手动替换图片`,
      durationMs: Date.now() - startedAt,
      details: {
        postId,
        imageIndex,
        mode,
        fileName: file.name || null,
        fileType: file.type || null,
        fileSize: file.size,
      },
    });

    const result = await saveReviewImageUpload(file);

    await recordExecutionLog({
      scope: "review",
      action: "审查替换图片上传完成",
      status: "success",
      message: `第 ${imageIndex + 1} 张手动替换图片已保存`,
      durationMs: Date.now() - startedAt,
      details: {
        postId,
        imageIndex,
        mode,
        imageUrl: result.imageUrl,
        bytes: result.bytes,
        mimeType: result.mimeType,
      },
    });

    return NextResponse.json({ ...result, mode, imageIndex });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload review image";
    await recordExecutionLog({
      scope: "review",
      action: "审查替换图片上传失败",
      status: "error",
      message: compactError(error),
      durationMs: Date.now() - startedAt,
    });
    const status = isWorkspaceSignInError(error) ? 401 : error instanceof ReviewImageUploadInputError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

function formValueToString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function formValueToNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return Number.NaN;
  return Number(value);
}
