import { NextResponse } from "next/server";
import {
  CanvasSubtitleRevisionConflictError,
  CanvasSubtitleRevisionNotFoundError,
  CanvasSubtitleRevisionRerunRequiredError,
} from "@/lib/canvas/subtitle-revisions";
import { isWorkspaceSignInError } from "@/lib/workspace-accounts";

export function subtitleRevisionErrorResponse(error: unknown) {
  const status = isWorkspaceSignInError(error) ? 401
    : error instanceof CanvasSubtitleRevisionNotFoundError ? 404
      : error instanceof CanvasSubtitleRevisionConflictError || error instanceof CanvasSubtitleRevisionRerunRequiredError ? 409
        : 400;
  return NextResponse.json({
    error: error instanceof Error ? error.message : "Subtitle revision request failed.",
    ...(error instanceof CanvasSubtitleRevisionRerunRequiredError ? { code: error.code } : {}),
    ...(error instanceof CanvasSubtitleRevisionConflictError && error.current ? { current: error.current } : {}),
  }, { status });
}
