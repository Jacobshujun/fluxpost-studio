import { NextResponse } from "next/server";
import { orderLibraryAssetIds } from "@/lib/library-assets";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    return NextResponse.json({ assetIds: await orderLibraryAssetIds(account, await request.json()) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "素材排序失败" }, { status: isWorkspaceSignInError(error) ? 401 : 400 });
  }
}
