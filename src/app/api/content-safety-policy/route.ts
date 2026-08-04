import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import {
  ContentSafetyPolicyConflictError,
  ContentSafetyPolicyValidationError,
  getContentSafetyPolicy,
  saveContentSafetyPolicy,
} from "@/lib/content-safety-policy";
import { isWorkspaceAdmin, isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireWorkspaceAccount(request);
    return NextResponse.json({ policy: await getContentSafetyPolicy() });
  } catch (error) {
    return NextResponse.json(
      { error: isWorkspaceSignInError(error) ? "Workspace sign-in required" : "Content safety policy could not be loaded" },
      { status: isWorkspaceSignInError(error) ? 401 : 500 },
    );
  }
}

export async function PUT(request: Request) {
  const startedAt = Date.now();
  try {
    const account = await requireWorkspaceAccount(request);
    if (!isWorkspaceAdmin(account)) {
      return NextResponse.json({ error: "Only workspace admins can save the content safety policy" }, { status: 403 });
    }
    const body = await readJsonBody(request);
    if (typeof body.expectedRevision !== "number") {
      return NextResponse.json({ error: "expectedRevision must be a number" }, { status: 400 });
    }
    const policy = await saveContentSafetyPolicy(body.policy, body.expectedRevision, account);
    return NextResponse.json({ policy });
  } catch (error) {
    if (error instanceof ContentSafetyPolicyConflictError) {
      return NextResponse.json({ error: error.message, currentRevision: error.currentRevision }, { status: 409 });
    }
    const status = isWorkspaceSignInError(error) ? 401 : error instanceof ContentSafetyPolicyValidationError ? 400 : 500;
    await recordExecutionLog({
      scope: "content-safety/policy",
      action: "Content safety policy save failed",
      status: "error",
      message: compactError(error),
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: status === 401 ? "Workspace sign-in required" : compactError(error) }, { status });
  }
}

async function readJsonBody(request: Request) {
  try {
    const value = await request.json() as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new ContentSafetyPolicyValidationError("Request body must be a JSON object.");
    }
    return value as { policy?: unknown; expectedRevision?: unknown };
  } catch {
    throw new ContentSafetyPolicyValidationError("Request body must be a valid JSON object.");
  }
}
