import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import {
  ContentSafetyPolicyConflictError,
  ContentSafetyPolicyValidationError,
  resetContentSafetyPolicy,
} from "@/lib/content-safety-policy";
import { isWorkspaceAdmin, isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const account = await requireWorkspaceAccount(request);
    if (!isWorkspaceAdmin(account)) {
      return NextResponse.json({ error: "Only workspace admins can reset the content safety policy" }, { status: 403 });
    }
    let body: { expectedRevision?: unknown };
    try {
      const value = await request.json() as unknown;
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new ContentSafetyPolicyValidationError("Request body must be a JSON object.");
      }
      body = value as { expectedRevision?: unknown };
    } catch {
      throw new ContentSafetyPolicyValidationError("Request body must be a valid JSON object.");
    }
    if (typeof body.expectedRevision !== "number") {
      throw new ContentSafetyPolicyValidationError("expectedRevision must be a number.");
    }
    return NextResponse.json({ policy: await resetContentSafetyPolicy(body.expectedRevision, account) });
  } catch (error) {
    if (error instanceof ContentSafetyPolicyConflictError) {
      return NextResponse.json({ error: error.message, currentRevision: error.currentRevision }, { status: 409 });
    }
    const status = isWorkspaceSignInError(error) ? 401 : error instanceof ContentSafetyPolicyValidationError ? 400 : 500;
    await recordExecutionLog({
      scope: "content-safety/policy",
      action: "Content safety policy reset failed",
      status: "error",
      message: compactError(error),
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: status === 401 ? "Workspace sign-in required" : compactError(error) }, { status });
  }
}
