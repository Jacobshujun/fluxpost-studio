import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import { runDistributionCheck } from "@/lib/distribution-check";
import { getWorkspacePromptSettings } from "@/lib/workspace-settings";
import { requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    await requireWorkspaceAccount(request);
    const body = (await request.json()) as { numbers?: string[] | string; prompt?: string };
    const settings = await getWorkspacePromptSettings();
    const result = await runDistributionCheck(body.numbers, {
      prompt: typeof body.prompt === "string" && body.prompt.trim() ? body.prompt : settings.distributionCheckPrompt,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Distribution check failed";
    await recordExecutionLog({
      scope: "feishu/distribution-check",
      action: "Distribution check failed",
      status: "error",
      message: compactError(error),
      durationMs: Date.now() - startedAt,
    });
    const status = /sign-in/i.test(message) ? 401 : /required|config|number/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
