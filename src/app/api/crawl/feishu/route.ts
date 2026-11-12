import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import { contentPoolProjectSummary, stripContentPoolItemsRaw } from "@/lib/content-pool";
import { requireContentPoolCollectionWriteTarget } from "@/lib/content-pool-collections";
import { importFeishuContentToPool, parseFeishuContentPoolRequest } from "@/lib/feishu-content-pool-import";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const input = parseFeishuContentPoolRequest(await request.json());
    if (input.collectionId) await requireContentPoolCollectionWriteTarget(account, input.collectionId);
    const result = await importFeishuContentToPool({ ...input, owner: account });
    return NextResponse.json({ ...result, items: stripContentPoolItemsRaw(result.items), project: result.project ? contentPoolProjectSummary(result.project) : undefined });
  } catch (error) {
    await recordExecutionLog({ scope: "crawl/feishu", action: "Feishu content-pool import failed", status: "error", message: compactError(error) });
    return NextResponse.json({ error: error instanceof Error ? error.message : "飞书导入失败" }, { status: isWorkspaceSignInError(error) ? 401 : 400 });
  }
}
