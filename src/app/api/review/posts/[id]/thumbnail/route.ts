import { NextResponse } from "next/server";
import { getGeneratedPost } from "@/lib/generated-posts";
import { reviewImageVersion } from "@/lib/review-posts";
import { getReviewThumbnail } from "@/lib/review-thumbnails";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const account = await requireWorkspaceAccount(request);
    const params = new URL(request.url).searchParams;
    const index = Number(params.get("index"));
    const size = Number(params.get("size") || 240);
    if (!Number.isInteger(index) || index < 0 || (size !== 240 && size !== 960)) return NextResponse.json({ error: "Invalid thumbnail index or size" }, { status: 400 });
    const post = await getGeneratedPost((await context.params).id, account);
    const source = post?.imageUrls[index];
    if (!source) return NextResponse.json({ error: "Image not found" }, { status: 404 });
    const version = params.get("v");
    if (version !== source && version !== reviewImageVersion(source)) return NextResponse.json({ error: "Image changed; refresh the post" }, { status: 409 });
    const result = await getReviewThumbnail(source, size);
    const headers = { "Content-Type": "image/webp", "Cache-Control": "private, max-age=0, must-revalidate", ETag: result.etag };
    if (request.headers.get("if-none-match") === result.etag) return new NextResponse(null, { status: 304, headers });
    return new NextResponse(new Uint8Array(result.bytes), { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Thumbnail failed" }, { status: isWorkspaceSignInError(error) ? 401 : 502 });
  }
}
