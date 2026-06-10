import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import { concurrencyConfig } from "@/lib/concurrency";
import { generateImagesFromPrompt } from "@/lib/image-generation";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";
import type { ImageGenerationQuality, SourceImageTask } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    await requireWorkspaceAccount(request);
    const body = (await request.json()) as {
      prompt?: string;
      count?: number;
      imageTasks?: SourceImageTask[];
      size?: string;
      quality?: ImageGenerationQuality;
    };
    if (!body.prompt?.trim()) {
      await recordExecutionLog({
        scope: "images",
        action: "图片生成请求校验失败",
        status: "error",
        message: "缺少 image prompt",
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "Image prompt is required" }, { status: 400 });
    }

    await recordExecutionLog({
      scope: "images",
      action: "开始生成图片",
      status: "running",
      message: "准备调用图片模型生成图文配图",
      details: {
        promptLength: body.prompt.trim().length,
        count: body.count || 1,
        imageTaskCount: Array.isArray(body.imageTasks) ? body.imageTasks.filter((task) => task.selected).length : 0,
        size: body.size || "1200x1600",
        quality: body.quality || "medium",
      },
    });
    const result = await generateImagesFromPrompt(body.prompt.trim(), body.count || 1, Array.isArray(body.imageTasks) ? body.imageTasks : undefined, {
      size: body.size,
      quality: body.quality,
      taskConcurrency: concurrencyConfig.image,
    });
    await recordExecutionLog({
      scope: "images",
      action: "图片生成完成",
      status: result.status === "completed" ? "success" : "info",
      message: result.status === "completed" ? `已生成 ${result.imageUrls.length} 张图片` : result.message || "图片模型未配置",
      durationMs: Date.now() - startedAt,
      details: {
        imageCount: result.imageUrls.length,
        status: result.status,
        size: body.size || "1200x1600",
        quality: body.quality || "medium",
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate image";
    await recordExecutionLog({
      scope: "images",
      action: "图片生成失败",
      status: "error",
      message: compactError(error),
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: message }, { status: isWorkspaceSignInError(error) ? 401 : 500 });
  }
}
