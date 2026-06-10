import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import { concurrencyConfig } from "@/lib/concurrency";
import { getSourceItemsByIds, markSourceRewritten } from "@/lib/content-pool";
import { saveGeneratedPost } from "@/lib/generated-posts";
import { generateImagesFromPrompt } from "@/lib/image-generation";
import { generatePost } from "@/lib/openai";
import { savePost } from "@/lib/store";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";
import type { ImageGenerationQuality, NormalizedSourceItem, ProductionPlan, SourceImageTask } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as {
      source?: NormalizedSourceItem;
      materialPaths?: string[];
      instruction?: string;
      productionPlanOverride?: ProductionPlan;
      imageTasks?: SourceImageTask[];
      generateImages?: boolean;
      imageSize?: string;
      imageQuality?: ImageGenerationQuality;
    };
    if (!body.source) {
      await recordExecutionLog({
        scope: "generate",
        action: "生成请求校验失败",
        status: "error",
        message: "缺少 source 样本",
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "Source item is required" }, { status: 400 });
    }
    const source = (await getSourceItemsByIds([body.source.id], account))[0];
    if (!source) return NextResponse.json({ error: "Source item not found" }, { status: 404 });

    await recordExecutionLog({
      scope: "generate",
      action: "开始逐条仿写",
      status: "running",
      message: "已接收选中的爆款样本，准备调用文本模型生成图文草稿",
      details: {
        sourceItemId: source.id,
        platform: source.platform,
          materialCount: Array.isArray(body.materialPaths) ? body.materialPaths.length : 0,
          instructionLength: body.instruction?.length || 0,
          imageTaskCount: Array.isArray(body.imageTasks) ? body.imageTasks.filter((task) => task.selected).length : 0,
          generateImages: body.generateImages !== false,
          imageSize: body.imageSize || "1200x1600",
          imageQuality: body.imageQuality || "medium",
      },
    });

    const post = await generatePost({
      source,
      materialPaths: Array.isArray(body.materialPaths) ? body.materialPaths : [],
      instruction: body.instruction,
      productionPlanOverride: body.productionPlanOverride,
      imageTasks: Array.isArray(body.imageTasks) ? body.imageTasks : undefined,
    });

    if (body.generateImages !== false) {
      try {
        await recordExecutionLog({
          scope: "generate",
          action: "开始生成草稿配图",
          status: "running",
          message: "文案草稿已生成，准备按用户选择逐张生成配图",
          details: {
            postId: post.id,
            sourceItemId: post.sourceItemId,
            imageTaskCount: Array.isArray(body.imageTasks) ? body.imageTasks.filter((task) => task.selected).length : 0,
            imageSize: body.imageSize || "1200x1600",
            imageQuality: body.imageQuality || "medium",
          },
        });
        const imageResult = await generateImagesFromPrompt(post.imagePrompt, 1, post.imageTasks, {
          size: body.imageSize,
          quality: body.imageQuality,
          taskConcurrency: concurrencyConfig.image,
        });
        post.imageUrls = imageResult.imageUrls;
        post.aiNotes = [
          ...post.aiNotes,
          imageResult.status === "completed"
            ? `已随草稿自动生成 ${imageResult.imageUrls.length} 张配图。`
            : imageResult.message || "图片模型未配置，当前仅生成文字草稿。",
        ];
        post.updatedAt = new Date().toISOString();
      } catch (error) {
        post.aiNotes = [...post.aiNotes, `图片自动生成失败：${compactError(error)}`];
        post.updatedAt = new Date().toISOString();
        await recordExecutionLog({
          scope: "generate",
          action: "草稿配图生成失败",
          status: "error",
          message: compactError(error),
          durationMs: Date.now() - startedAt,
          details: {
            postId: post.id,
            sourceItemId: post.sourceItemId,
          },
        });
      }
    }

    const savedPost = await saveGeneratedPost(post, account);
    await savePost(savedPost, account);
    await markSourceRewritten(savedPost.sourceItemId, savedPost, account);
    await recordExecutionLog({
      scope: "generate",
      action: "图文草稿生成完成",
      status: "success",
      message: post.imageUrls.length ? "完整图文草稿已写入本地 store，并标记原样本为已仿写" : "文字草稿已写入本地 store，并标记原样本为已仿写",
      durationMs: Date.now() - startedAt,
      details: {
        postId: savedPost.id,
        sourceItemId: savedPost.sourceItemId,
        titleLength: savedPost.title.length,
        bodyLength: savedPost.body.length,
        imageCount: savedPost.imageUrls.length,
      },
    });
    return NextResponse.json({ post: savedPost });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate post";
    await recordExecutionLog({
      scope: "generate",
      action: "图文草稿生成失败",
      status: "error",
      message: compactError(error),
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: message }, { status: isWorkspaceSignInError(error) ? 401 : 500 });
  }
}
