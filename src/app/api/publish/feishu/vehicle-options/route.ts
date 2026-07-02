import { NextResponse } from "next/server";
import { compactError } from "@/lib/activity-log";
import { listFeishuVehicleOptions } from "@/lib/feishu-field-options";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireWorkspaceAccount(request);
    const result = await listFeishuVehicleOptions();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { options: [], fieldName: "车型", error: compactError(error) },
      { status: isWorkspaceSignInError(error) ? 401 : 500 },
    );
  }
}
