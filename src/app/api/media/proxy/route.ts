import { NextResponse } from "next/server";
import { normalizeImageMime, sniffImageFormat } from "@/lib/image-format";
import { buildMediaRequestHeaders, isProxyableRemoteMediaUrl } from "@/lib/media-request";
import { isManagedRuntimeMediaUrl } from "@/lib/runtime-media-storage";

export const runtime = "nodejs";

const maxProxyImageBytes = 12 * 1024 * 1024;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const target = url.searchParams.get("url") || "";
    if (!isProxyableRemoteMediaUrl(target)) {
      return NextResponse.json({ error: "Invalid media URL" }, { status: 400 });
    }
    if (isManagedRuntimeMediaUrl(target)) {
      return NextResponse.redirect(target, {
        status: 307,
        headers: {
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        },
      });
    }

    const response = await fetch(target, {
      headers: buildMediaRequestHeaders(target),
      redirect: "follow",
    });

    if (!response.ok) {
      return NextResponse.json({ error: `Remote media failed: ${response.status}` }, { status: 502 });
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType && !contentType.toLowerCase().startsWith("image/")) {
      return NextResponse.json({ error: "Remote media is not an image" }, { status: 415 });
    }

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > maxProxyImageBytes) {
      return NextResponse.json({ error: "Remote image is too large" }, { status: 413 });
    }

    const image = Buffer.from(await response.arrayBuffer());
    if (image.byteLength > maxProxyImageBytes) {
      return NextResponse.json({ error: "Remote image is too large" }, { status: 413 });
    }
    const detectedFormat = sniffImageFormat(image);
    if (normalizeImageMime(contentType) === "image/heic" || detectedFormat?.mimeType === "image/heic") {
      return NextResponse.json({ error: "Remote HEIC images must be normalized before browser preview" }, { status: 415 });
    }

    return new NextResponse(image, {
      headers: {
        "Content-Type": detectedFormat?.mimeType || contentType || "image/jpeg",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to proxy media";
    return NextResponse.json({ error: message.slice(0, 240) }, { status: 502 });
  }
}
