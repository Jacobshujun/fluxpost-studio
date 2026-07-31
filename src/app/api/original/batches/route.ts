import { NextResponse } from "next/server";
import {
  OriginalBatchInputError,
  createOriginalBatch,
  getOriginalBatchPreflight,
  listOriginalBatches,
  validateOriginalBatchInput,
} from "@/lib/original-batches";
import type { OriginalBatchStatus } from "@/lib/types";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || undefined;
    const result = await listOriginalBatches(account, {
      page: Number(url.searchParams.get("page") || 1),
      pageSize: Number(url.searchParams.get("pageSize") || 20),
      status: isBatchStatus(status) ? status : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return originalBatchError(error);
  }
}

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as { action?: "preflight"; items?: unknown; settings?: unknown };
    if (body.action === "preflight") {
      const validation = validateOriginalBatchInput(body.items, body.settings);
      return NextResponse.json({
        duplicateRows: validation.duplicateRows,
        preflight: getOriginalBatchPreflight(validation.items.length, validation.settings),
      });
    }
    const result = await createOriginalBatch({ items: body.items, settings: body.settings }, account);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return originalBatchError(error);
  }
}

function isBatchStatus(value: string | undefined): value is OriginalBatchStatus {
  return Boolean(value && ["queued", "running", "paused", "completed", "partial", "failed", "cancelled"].includes(value));
}

function originalBatchError(error: unknown) {
  const message = error instanceof Error ? error.message : "Original batch request failed.";
  const status = isWorkspaceSignInError(error) ? 401 : error instanceof OriginalBatchInputError ? 400 : 500;
  return NextResponse.json({ error: message, ...(error instanceof OriginalBatchInputError ? { rowErrors: error.errors } : {}) }, { status });
}
