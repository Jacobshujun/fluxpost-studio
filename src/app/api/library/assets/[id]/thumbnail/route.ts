import { NextResponse } from "next/server";
import { getLibraryAsset } from "@/lib/library-assets";
import {
  getLibraryThumbnail,
  libraryThumbnailCacheControl,
  libraryThumbnailMimeType,
} from "@/lib/library-thumbnails";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  let asset;
  try {
    const account = await requireWorkspaceAccount(request);
    asset = await getLibraryAsset(account, (await context.params).id);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Library asset not found." },
      { status: isWorkspaceSignInError(error) ? 401 : 404 },
    );
  }

  try {
    const thumbnail = await getLibraryThumbnail(asset);
    return new NextResponse(new Uint8Array(thumbnail.bytes), {
      headers: {
        "Cache-Control": libraryThumbnailCacheControl,
        "Content-Length": String(thumbnail.bytes.length),
        "Content-Type": libraryThumbnailMimeType,
        ETag: thumbnail.etag,
        "X-FluxPost-Thumbnail-Cache": thumbnail.cacheStatus,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Library thumbnail generation failed." },
      { status: 502 },
    );
  }
}
