
import { NextResponse } from "next/server";
import { getContentPoolSnapshot } from "@/lib/content-pool";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get("query") || undefined;
    const snapshot = await getContentPoolSnapshot(query);
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read content pool";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
