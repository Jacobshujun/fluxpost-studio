import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import { getWorkspacePromptSettings, saveWorkspacePromptSettings } from "@/lib/workspace-settings";
import { requireWorkspaceAccount } from "@/lib/workspace-accounts";
import type { WorkspacePromptSettings } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireWorkspaceAccount(request);
    return NextResponse.json({ settings: await getWorkspacePromptSettings() });
  } catch {
    return NextResponse.json({ error: "Workspace account sign-in is required" }, { status: 401 });
  }
}

export async function PATCH(request: Request) {
  const startedAt = Date.now();
  try {
    await requireWorkspaceAccount(request);
    const body = (await request.json()) as Partial<WorkspacePromptSettings>;
    const settings = await saveWorkspacePromptSettings(body);
    await recordExecutionLog({
      scope: "workspace/settings",
      action: "保存默认生产策略",
      status: "success",
      message: "精简版默认文案和图片提示词已更新",
      durationMs: Date.now() - startedAt,
      details: {
        textLength: settings.textInstruction.length,
        carExteriorPromptLength: settings.imageStrategyPrompts.carExterior.length,
        textImagePromptLength: settings.imageStrategyPrompts.textImage.length,
        peopleWithCarPromptLength: settings.imageStrategyPrompts.peopleWithCar.length,
        distributionCheckPromptLength: settings.distributionCheckPrompt.length,
        imageSize: settings.imageSize,
        imageQuality: settings.imageQuality,
      },
    });
    return NextResponse.json({ settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save workspace settings";
    await recordExecutionLog({
      scope: "workspace/settings",
      action: "保存默认生产策略失败",
      status: "error",
      message: compactError(error),
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: message }, { status: /sign-in/i.test(message) ? 401 : 400 });
  }
}
