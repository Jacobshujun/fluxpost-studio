import { NextResponse } from "next/server";
import { checkImageTransportHealth } from "@/lib/image-transport";
import { isWorkspaceAdmin, isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    if (!isWorkspaceAdmin(account)) return NextResponse.json({ error: "Only workspace admins can inspect image transport" }, { status: 403 });
    const health = await checkImageTransportHealth();
    return NextResponse.json({ health }, { status: health.ok ? 200 : 503 });
  } catch (error) {
    return NextResponse.json(
      { error: isWorkspaceSignInError(error) ? "Workspace sign-in required" : "Image transport health check failed" },
      { status: isWorkspaceSignInError(error) ? 401 : 500 },
    );
  }
}
