import { NextResponse } from "next/server";
import { resolveRuntimeReleaseIdentity } from "@/lib/runtime-release";

export const runtime = "nodejs";

const responseHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function GET() {
  try {
    return NextResponse.json(resolveRuntimeReleaseIdentity(), { headers: responseHeaders });
  } catch {
    return NextResponse.json(
      { error: "Runtime release identity is invalid" },
      { status: 500, headers: responseHeaders },
    );
  }
}
