import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import { markSourceRewritten } from "@/lib/content-pool";
import { saveGeneratedPost } from "@/lib/generated-posts";
import { editPostWithPrompt } from "@/lib/openai";
import { savePost } from "@/lib/store";
import type { GeneratedPost } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const body = (await request.json()) as {
      post?: GeneratedPost;
      instruction?: string;
      manualPatch?: Partial<Pick<GeneratedPost, "title" | "body" | "imagePrompt" | "status" | "imageUrls" | "imageTasks">>;
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

    let post = body.post;
    if (body.manualPatch) {
      post = {
        ...post,
        ...body.manualPatch,
        updatedAt: new Date().toISOString(),
      };
    }

    if (body.instruction?.trim()) {
      post = await editPostWithPrompt({ post, instruction: body.instruction.trim() });
    }

    await savePost(post);
    await saveGeneratedPost(post);
    await markSourceRewritten(post.sourceItemId, post);
    await recordExecutionLog({
      scope: "review",
      action: "审查更新完成",
      status: "success",
      message: `草稿状态已更新为 ${post.status}`,
      durationMs: Date.now() - startedAt,
      details: {
        postId: post.id,
        status: post.status,
        titleLength: post.title.length,
        bodyLength: post.body.length,
      },
    });
    return NextResponse.json({ post });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update review";
    await recordExecutionLog({
      scope: "review",
      action: "审查更新失败",
      status: "error",
      message: compactError(error),
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
