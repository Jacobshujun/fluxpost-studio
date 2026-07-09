import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import { getAdvancedConfigSnapshot, getConfigStatus, saveAdvancedConfigPatch } from "@/lib/config";
import { isWorkspaceAdmin, requireWorkspaceAccount } from "@/lib/workspace-accounts";
import type { AdvancedConfigPatch } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("advanced") !== "1") {
    return NextResponse.json(getConfigStatus());
  }

  try {
    const account = await requireWorkspaceAccount(request);
    if (!isWorkspaceAdmin(account)) return NextResponse.json({ error: "Only workspace admins can view advanced config" }, { status: 403 });
    return NextResponse.json({ status: getConfigStatus(), advanced: getAdvancedConfigSnapshot() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load advanced config";
    return NextResponse.json({ error: message }, { status: /sign-in/i.test(message) ? 401 : 500 });
  }
}

export async function PATCH(request: Request) {
  const startedAt = Date.now();
  try {
    const account = await requireWorkspaceAccount(request);
    if (!isWorkspaceAdmin(account)) return NextResponse.json({ error: "Only workspace admins can update advanced config" }, { status: 403 });

    const body = (await request.json()) as AdvancedConfigPatch;
    const advanced = saveAdvancedConfigPatch(body);
    await recordExecutionLog({
      scope: "workspace/config",
      action: "保存高级环境配置",
      status: "success",
      message: "高级环境配置已写入 .env.local",
      durationMs: Date.now() - startedAt,
      details: {
        keyCount: Object.keys(body.values || {}).length,
      },
    });
    return NextResponse.json({ status: getConfigStatus(), advanced });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save advanced config";
    await recordExecutionLog({
      scope: "workspace/config",
      action: "保存高级环境配置失败",
      status: "error",
      message: compactError(error),
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: message }, { status: /sign-in/i.test(message) ? 401 : 400 });
  }
}
