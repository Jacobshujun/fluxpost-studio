import { NextResponse } from "next/server";
import { requireWorkspaceAccount, isWorkspaceSignInError } from "@/lib/workspace-accounts";
import { qwenCredentialStatus, saveQwenCredential, removeQwenCredential, QwenCredentialError, type QwenCredentialTarget } from "@/lib/canvas/qwen-credentials";

export const runtime = "nodejs";

function target(request: Request): QwenCredentialTarget {
  const params = new URL(request.url).searchParams;
  return { workflowId: params.get("workflowId") || "", nodeId: params.get("nodeId") || "", regionId: params.get("regionId") || undefined };
}

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    return NextResponse.json(await qwenCredentialStatus(target(request), account), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

export async function PUT(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Qwen: 请求无效。" }, { status: 400 });
    const { apiKey, endpoint } = body as Record<string, unknown>;
    await saveQwenCredential(target(request), account, apiKey, endpoint);
    return NextResponse.json({ configured: true });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    await removeQwenCredential(target(request), account);
    return NextResponse.json({ configured: false });
  } catch (error) { return failure(error); }
}

function failure(error: unknown) {
  const signIn = isWorkspaceSignInError(error);
  return NextResponse.json({ error: signIn ? "请先登录。" : error instanceof QwenCredentialError || (error instanceof Error && error.message.startsWith("Qwen:")) ? error.message : "Qwen: 密钥操作失败，请检查服务端运行数据。" }, { status: signIn ? 401 : 400 });
}
