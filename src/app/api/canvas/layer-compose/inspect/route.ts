import { NextResponse } from "next/server";
import { requireWorkspaceAccount, isWorkspaceSignInError } from "@/lib/workspace-accounts";
import { inspectComposeSource } from "@/lib/canvas/layer-compose";
import { composeSourceKey } from "@/lib/canvas/layer-compose-contract";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || !("url" in body) || typeof body.url !== "string" || !body.url || body.url.length > 8192
      || !("kind" in body) || (body.kind !== "image" && body.kind !== "video")) return NextResponse.json({ error: "素材地址或类型无效。" }, { status: 400 });
    const media = { url: body.url };
    const metadata = await inspectComposeSource({ kind: body.kind, key: composeSourceKey(media), media }, account.id);
    return NextResponse.json(metadata);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法读取素材信息。" }, { status: isWorkspaceSignInError(error) ? 401 : 400 });
  }
}
