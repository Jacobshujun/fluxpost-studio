import { NextResponse } from "next/server";
import {
  ContentPoolCollectionValidationError,
  deleteContentPoolTag,
  mergeContentPoolTags,
  renameContentPoolTag,
  setContentPoolTagColor,
} from "@/lib/content-pool-collections";
import { ContentPoolTagValidationError } from "@/lib/content-pool-tags";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as {
      action?: unknown;
      from?: unknown;
      to?: unknown;
      label?: unknown;
      color?: unknown;
    };
    switch (body.action) {
      case "rename":
        return NextResponse.json(await renameContentPoolTag(account, { from: body.from, to: body.to }));
      case "merge":
        return NextResponse.json(await mergeContentPoolTags(account, { from: body.from, to: body.to }));
      case "delete":
        return NextResponse.json(await deleteContentPoolTag(account, { label: body.label }));
      case "set_color":
        return NextResponse.json(await setContentPoolTagColor(account, { label: body.label, color: body.color }));
      default:
        throw new ContentPoolCollectionValidationError("不支持的标签操作。");
    }
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Failed to manage content-pool tags";
  const status = isWorkspaceSignInError(error) ? 401
    : error instanceof ContentPoolCollectionValidationError || error instanceof ContentPoolTagValidationError ? 400
      : 500;
  return NextResponse.json({ error: message }, { status });
}
