import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import { runImageProviderProbe } from "@/lib/image-generation";
import { isWorkspaceAdmin, isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";
import { isOpenaiImageRouteConfigured } from "@/lib/config";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const account = await requireWorkspaceAccount(request);
    if (!isWorkspaceAdmin(account)) return NextResponse.json({ error: "Only workspace admins can test image providers" }, { status: 403 });

    let body: { route?: unknown };
    try {
      body = (await request.json()) as { route?: unknown };
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
    }
    const route = body.route;
    if (route !== "primary" && route !== "backup") {
      return NextResponse.json({ error: "route must be primary or backup" }, { status: 400 });
    }
    if (!isOpenaiImageRouteConfigured(route)) {
      return NextResponse.json({ error: `${route} image provider is not configured` }, { status: 400 });
    }

    const result = await runImageProviderProbe(route);
    await recordExecutionLog({
      scope: "openai/image",
      action: result.ok ? "Image provider probe passed" : "Image provider probe failed",
      status: result.ok ? "success" : "error",
      message: result.ok ? "Text and reference image provider probes passed." : "One or more image provider probe modes failed.",
      durationMs: Date.now() - startedAt,
      details: {
        route: result.route,
        profile: result.profile,
        model: result.model,
        generationOk: result.generation.ok,
        generationDurationMs: result.generation.durationMs,
        editOk: result.edit.ok,
        editDurationMs: result.edit.durationMs,
      },
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (error) {
    await recordExecutionLog({
      scope: "openai/image",
      action: "Image provider probe failed",
      status: "error",
      message: compactError(error),
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      { error: isWorkspaceSignInError(error) ? "Workspace sign-in required" : "Image provider probe could not run. Check the execution log." },
      { status: isWorkspaceSignInError(error) ? 401 : 500 },
    );
  }
}
