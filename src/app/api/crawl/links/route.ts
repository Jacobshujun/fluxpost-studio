import { NextResponse } from "next/server";
import { compactError, recordExecutionLog } from "@/lib/activity-log";
import { importSourceLinks } from "@/lib/source-link-import";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";
import type { SourceLinkPlatform } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as {
      query?: string;
      links?: string[] | string;
      platform?: SourceLinkPlatform | "auto";
      cookie?: string;
      videoFrameOriginalReference?: boolean;
      enableVideoTranscription?: boolean;
    };
    const input = parseLinkImportInput(body);
    const result = await importSourceLinks({ ...input, owner: account });
    return NextResponse.json(result);
  } catch (error) {
    await recordExecutionLog({
      scope: "crawl/links",
      action: "Source link import request failed",
      status: "error",
      message: compactError(error),
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid link import request" },
      { status: isWorkspaceSignInError(error) ? 401 : 400 },
    );
  }
}

function parseLinkImportInput(body: {
  query?: string;
  links?: string[] | string;
  platform?: SourceLinkPlatform | "auto";
  cookie?: string;
  videoFrameOriginalReference?: boolean;
  enableVideoTranscription?: boolean;
}) {
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) throw new Error("Query is required");

  const links = Array.isArray(body.links)
    ? body.links.map((link) => String(link || "").trim()).filter(Boolean)
    : typeof body.links === "string"
      ? body.links.split(/\r?\n/).map((link) => link.trim()).filter(Boolean)
      : [];
  if (!links.length) throw new Error("At least one source link is required");

  return {
    query,
    links,
    platform: isPlatform(body.platform) ? body.platform : undefined,
    cookie: typeof body.cookie === "string" ? body.cookie : undefined,
    videoFrameOriginalReference: body.videoFrameOriginalReference !== false,
    enableVideoTranscription: body.enableVideoTranscription === true,
  };
}

function isPlatform(value: unknown): value is SourceLinkPlatform {
  return value === "wechat_channels" || value === "xiaohongshu" || value === "douyin" || value === "weibo" || value === "xiaopeng_bbs" || value === "dongchedi";
}
