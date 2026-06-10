import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import {
  createWorkspaceAccount,
  createWorkspaceSession,
  getWorkspaceAuthMode,
  getWorkspaceAccountBootstrapState,
  isWorkspaceAdmin,
  isWorkspaceSetupPasswordValid,
  isWorkspaceWhitelistAdminUsername,
  listWorkspaceAccounts,
  requireWorkspaceAccount,
  updateWorkspaceAccount,
  workspaceSessionCookieName,
  workspaceSessionMaxAgeSeconds,
} from "@/lib/workspace-accounts";
import type { WorkspaceAccountRole, WorkspaceAccountStatus } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const state = await getWorkspaceAccountBootstrapState();
  if (!state.hasAccounts) return NextResponse.json({ ...state, accounts: [] });

  try {
    const account = await requireWorkspaceAccount(request);
    return NextResponse.json({
      ...state,
      accounts: isWorkspaceAdmin(account) ? await listWorkspaceAccounts() : [account],
    });
  } catch {
    return NextResponse.json({ error: "Workspace account sign-in is required" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const state = await getWorkspaceAccountBootstrapState();
    const body = (await request.json()) as {
      username?: string;
      displayName?: string;
      password?: string;
      role?: WorkspaceAccountRole;
      setupPassword?: string;
    };

    const isWhitelistBootstrap = getWorkspaceAuthMode() === "whitelist" && !state.hasAdminAccount;
    const actor = state.hasAccounts && !isWhitelistBootstrap ? await requireWorkspaceAccount(request) : undefined;
    if (actor && !isWorkspaceAdmin(actor)) {
      return NextResponse.json({ error: "Only workspace admins can create accounts" }, { status: 403 });
    }

    if (isWhitelistBootstrap) {
      if (!isWorkspaceWhitelistAdminUsername(body.username)) {
        return NextResponse.json({ error: "Initial workspace admin must be listed in WORKSPACE_ADMIN_USERS" }, { status: 403 });
      }
      if (!isWorkspaceSetupPasswordValid(body.setupPassword || body.password)) {
        return NextResponse.json({ error: "Workspace setup password is required" }, { status: 401 });
      }
    }

    const account = await createWorkspaceAccount({
      username: body.username,
      displayName: body.displayName,
      password: body.password,
      role: isWhitelistBootstrap ? "admin" : body.role,
    });

    const response = NextResponse.json({
      account,
      accounts: actor || isWorkspaceAdmin(account) ? await listWorkspaceAccounts() : [account],
      hasAccounts: true,
      hasAdminAccount: state.hasAdminAccount || account.role === "admin",
    });

    if (!state.hasAccounts || isWhitelistBootstrap) {
      const session = await createWorkspaceSession(account.id);
      response.cookies.set(workspaceSessionCookieName, session.token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: workspaceSessionMaxAgeSeconds,
        secure: isSecureRequest(request),
      });
    }

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create workspace account";
    await recordExecutionLog({
      scope: "workspace/accounts",
      action: "Workspace account create failed",
      status: "error",
      message: compactError(error),
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: message }, { status: /required|username|password|exists/i.test(message) ? 400 : 500 });
  }
}

export async function PATCH(request: Request) {
  const startedAt = Date.now();
  try {
    const actor = await requireWorkspaceAccount(request);
    if (!isWorkspaceAdmin(actor)) {
      return NextResponse.json({ error: "Only workspace admins can manage accounts" }, { status: 403 });
    }

    const body = (await request.json()) as {
      id?: string;
      username?: string;
      displayName?: string;
      password?: string;
      role?: WorkspaceAccountRole;
      status?: WorkspaceAccountStatus;
    };
    const account = await updateWorkspaceAccount(body);
    return NextResponse.json({
      account,
      accounts: await listWorkspaceAccounts(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update workspace account";
    await recordExecutionLog({
      scope: "workspace/accounts",
      action: "Workspace account update failed",
      status: "error",
      message: compactError(error),
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: message }, { status: /sign-in/i.test(message) ? 401 : /not found/i.test(message) ? 404 : 400 });
  }
}

function isSecureRequest(request: Request) {
  return new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}
