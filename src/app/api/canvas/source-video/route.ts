import { NextResponse } from "next/server";
import { CanvasSourceVideoValidationError, resolveCanvasSourceVideos } from "@/lib/canvas/source-video-service";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as { sourceUrl?: unknown; projectName?: unknown };
    if (typeof body.sourceUrl !== "string" || typeof body.projectName !== "string") {
      throw new CanvasSourceVideoValidationError("sourceUrl 和 projectName 必须是字符串。");
    }
    const [source] = await resolveCanvasSourceVideos({ links: [body.sourceUrl], projectName: body.projectName, account });
    return NextResponse.json({ source });
  } catch (error) {
    const status = isWorkspaceSignInError(error) ? 401 : error instanceof CanvasSourceVideoValidationError ? 400 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "源视频解析失败。" }, { status });
  }
}
