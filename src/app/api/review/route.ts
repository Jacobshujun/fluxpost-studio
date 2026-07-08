import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import { markSourceRewritten } from "@/lib/content-pool";
import { getGeneratedPost, saveGeneratedPost } from "@/lib/generated-posts";
import { editPostWithPrompt } from "@/lib/openai";
import { savePost } from "@/lib/store";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";
import type { GeneratedPost } from "@/lib/types";
import type { WorkspaceAccessActor } from "@/lib/workspace-ownership";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as {
      post?: GeneratedPost;
      instruction?: string;
      manualPatch?: Partial<Pick<GeneratedPost, "title" | "body" | "imagePrompt" | "status" | "imageUrls" | "videoUrls" | "imageTasks" | "feishuVehicle">>;
    };

    if (!body.post) {
      await recordExecutionLog({
        scope: "review",
        action: "审查请求校验失败",
        status: "error",
        message: "缺少 post 草稿",
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "Post is required" }, { status: 400 });
    }
    await recordExecutionLog({
      scope: "review",
      action: body.instruction?.trim() ? "开始 AI 修改草稿" : "保存人工审查修改",
      status: "running",
      message: body.instruction?.trim() ? "准备调用文本模型按 Prompt 修改草稿" : "准备保存人工编辑字段",
      details: {
        postId: body.post.id,
        sourceItemId: body.post.sourceItemId,
        patchKeys: Object.keys(body.manualPatch || {}).join(",") || null,
        promptLength: body.instruction?.trim().length || 0,
      },
    });

    const currentPost = await getGeneratedPost(body.post.id, account);
    if (!currentPost) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    let post = currentPost;
    if (body.manualPatch) {
      const allowedPatch: Partial<Pick<GeneratedPost, "title" | "body" | "imagePrompt" | "status" | "imageUrls" | "videoUrls" | "imageTasks" | "feishuVehicle">> = {};
      if ("title" in body.manualPatch) allowedPatch.title = body.manualPatch.title;
      if ("body" in body.manualPatch) allowedPatch.body = body.manualPatch.body;
      if ("imagePrompt" in body.manualPatch) allowedPatch.imagePrompt = body.manualPatch.imagePrompt;
      if ("status" in body.manualPatch) allowedPatch.status = body.manualPatch.status;
      if ("imageUrls" in body.manualPatch) allowedPatch.imageUrls = body.manualPatch.imageUrls;
      if ("videoUrls" in body.manualPatch) allowedPatch.videoUrls = body.manualPatch.videoUrls;
      if ("imageTasks" in body.manualPatch) allowedPatch.imageTasks = body.manualPatch.imageTasks;
      if ("feishuVehicle" in body.manualPatch) allowedPatch.feishuVehicle = body.manualPatch.feishuVehicle;
      post = {
        ...post,
        ...allowedPatch,
        updatedAt: new Date().toISOString(),
      };
    }

    if (body.instruction?.trim()) {
      post = await editPostWithPrompt({ post, instruction: body.instruction.trim() });
    }

    const savedPost = await saveGeneratedPost(post, account);
    const sideEffectMode = resolveReviewSideEffectMode(currentPost, savedPost, Boolean(body.instruction?.trim()));
    if (sideEffectMode === "await") await syncReviewSideEffects(savedPost, account);
    if (sideEffectMode === "background") queueReviewSideEffects(savedPost, account);
    await recordExecutionLog({
      scope: "review",
      action: "审查更新完成",
      status: "success",
      message: `草稿状态已更新为 ${post.status}`,
      durationMs: Date.now() - startedAt,
      details: {
        postId: savedPost.id,
        status: savedPost.status,
        titleLength: savedPost.title.length,
        bodyLength: savedPost.body.length,
      },
    });
    return NextResponse.json({ post: savedPost });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update review";
    await recordExecutionLog({
      scope: "review",
      action: "审查更新失败",
      status: "error",
      message: compactError(error),
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: message }, { status: isWorkspaceSignInError(error) ? 401 : 500 });
  }
}

function resolveReviewSideEffectMode(previousPost: GeneratedPost, savedPost: GeneratedPost, usedAiInstruction: boolean) {
  if (usedAiInstruction) return "await";
  if (previousPost.status !== savedPost.status) return "background";
  return savedPost.status === "approved" || savedPost.status === "published" ? "background" : "skip";
}

async function syncReviewSideEffects(post: GeneratedPost, account: WorkspaceAccessActor) {
  await savePost(post, account);
  await markSourceRewritten(post.sourceItemId, post, account);
}

function queueReviewSideEffects(post: GeneratedPost, account: WorkspaceAccessActor) {
  void syncReviewSideEffects(post, account).catch(async (error) => {
    await recordExecutionLog({
      scope: "review",
      action: "Review source status sync warning",
      status: "info",
      message: compactError(error),
      details: {
        postId: post.id,
        sourceItemId: post.sourceItemId,
        status: post.status,
      },
    });
  });
}
