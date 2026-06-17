import { NextResponse } from "next/server";
import { appConfig } from "@/lib/config";
import { processLarkTaskMessage, type LarkTaskMessage } from "@/lib/lark-task-launcher";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!appConfig.larkTaskApiToken) {
      return NextResponse.json({ error: "LARK_TASK_API_TOKEN is not configured." }, { status: 503 });
    }
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (token !== appConfig.larkTaskApiToken) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await request.json()) as Partial<LarkTaskMessage>;
    if (!body.messageId || !body.chatId || !body.senderId || !body.text) {
      return NextResponse.json({ error: "messageId, chatId, senderId, and text are required." }, { status: 400 });
    }

    const result = await processLarkTaskMessage({
      messageId: body.messageId,
      chatId: body.chatId,
      senderId: body.senderId,
      senderName: body.senderName,
      text: body.text,
      createdAt: body.createdAt,
    });
    return NextResponse.json(result, { status: result.status === "failed" ? 400 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lark task launch failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
