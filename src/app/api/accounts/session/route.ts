import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import {
  authenticateWorkspaceAccount,
  getCurrentWorkspaceAccount,
  getWorkspaceAccountBootstrapState,
  revokeCurrentWorkspaceSession,
  workspaceSessionCookieName,
  workspaceSessionMaxAgeSeconds,
} from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const state = await getWorkspaceAccountBootstrapState();
  const account = state.hasAccounts ? await getCurrentWorkspaceAccount(request) : undefined;
  return NextResponse.json({
    ...state,
    account: account || null,
  });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const body = (await request.json()) as { username?: string; password?: string };
    const result = await authenticateWorkspaceAccount(body.username, body.password);
    const state = await getWorkspaceAccountBootstrapState();
    const response = NextResponse.json({
      ...state,
      account: result.account,
      hasAccounts: true,
    });
    setSessionCookie(response, request, result.session.token);
    return response;
  } catch (error) {
    await recordExecutionLog({
      scope: "workspace/accounts",
      action: "Workspace account sign-in failed",
      status: "error",
      message: compactError(error),
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }
}

export async function DELETE(request: Request) {
  await revokeCurrentWorkspaceSession(request);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(workspaceSessionCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: isSecureRequest(request),
  });
  return response;
}

function setSessionCookie(response: NextResponse, request: Request, token: string) {
  response.cookies.set(workspaceSessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: workspaceSessionMaxAgeSeconds,
    secure: isSecureRequest(request),
  });
}

function isSecureRequest(request: Request) {
  return new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}
