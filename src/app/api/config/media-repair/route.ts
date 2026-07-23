import { NextResponse } from "next/server";
import { compactError } from "@/lib/activity-log";
import { GeneratedMediaRepairValidationError, runGeneratedMediaRepairBatch } from "@/lib/generated-media-repair";
import { isWorkspaceAdmin, isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";
import type { GeneratedMediaRepairMode } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    if (!isWorkspaceAdmin(account)) {
      return NextResponse.json({ error: "Only workspace admins can repair historical generated media" }, { status: 403 });
    }
    const body = (await request.json()) as { mode?: GeneratedMediaRepairMode; cursor?: string; limit?: number };
    if (body.mode !== "scan" && body.mode !== "apply") {
      return NextResponse.json({ error: "Repair mode must be scan or apply" }, { status: 400 });
    }
    const result = await runGeneratedMediaRepairBatch({
      mode: body.mode,
      cursor: typeof body.cursor === "string" ? body.cursor : undefined,
      limit: body.limit,
      account,
    });
    return NextResponse.json(result);
  } catch (error) {
    const status = isWorkspaceSignInError(error)
      ? 401
      : error instanceof GeneratedMediaRepairValidationError || error instanceof SyntaxError
        ? 400
        : 500;
    return NextResponse.json(
      { error: compactError(error) },
      { status },
    );
  }
}
