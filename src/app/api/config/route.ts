import { NextResponse } from "next/server";
import { getConfigStatus } from "@/lib/config";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(getConfigStatus());
}
