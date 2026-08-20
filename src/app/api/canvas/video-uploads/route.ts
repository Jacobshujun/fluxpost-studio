import { NextResponse } from "next/server";
import { CanvasVideoUploadInputError, saveCanvasVideoUpload } from "@/lib/canvas/video-upload";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    await requireWorkspaceAccount(request);
    const filename = new URL(request.url).searchParams.get("filename") || "";
    return NextResponse.json({ video: await saveCanvasVideoUpload(request, filename) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "视频上传失败。";
    const status = isWorkspaceSignInError(error) ? 401 : error instanceof CanvasVideoUploadInputError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
