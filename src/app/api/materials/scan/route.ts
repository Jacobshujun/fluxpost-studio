import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import { scanMaterialFolder } from "@/lib/materials";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    await requireWorkspaceAccount(request);
    const body = (await request.json()) as { path?: string };
    if (!body.path || typeof body.path !== "string") {
      await recordExecutionLog({
        scope: "materials/scan",
        action: "素材扫描请求校验失败",
        status: "error",
        message: "缺少本地素材文件夹路径",
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json({ error: "Material folder path is required" }, { status: 400 });
    }
    await recordExecutionLog({
      scope: "materials/scan",
      action: "开始扫描本地素材",
      status: "running",
      message: "准备读取本地文件夹中的图片素材",
      details: {
        path: body.path,
      },
    });
    const assets = await scanMaterialFolder(body.path);
    await recordExecutionLog({
      scope: "materials/scan",
      action: "素材扫描完成",
      status: "success",
      message: `已索引 ${assets.length} 个素材文件`,
      durationMs: Date.now() - startedAt,
      details: {
        assetCount: assets.length,
      },
    });
    return NextResponse.json({ assets });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to scan material folder";
    await recordExecutionLog({
      scope: "materials/scan",
      action: "素材扫描失败",
      status: "error",
      message: compactError(error),
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: message }, { status: isWorkspaceSignInError(error) ? 401 : 400 });
  }
}
