import { NextResponse } from "next/server";
import { RuntimeImageUploadInputError, saveRuntimeImageUpload } from "@/lib/runtime-image-upload";
import { appConfig } from "@/lib/config";
import { isTosRuntimeMediaConfigured } from "@/lib/runtime-media-storage";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

const maxCanvasUploadFiles = 4;
const maxCanvasUploadBytes = 100 * 1024 * 1024;
const maxGptReferenceBytes = 50 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    await requireWorkspaceAccount(request);
    const form = await request.formData();
    const requestedMode = form.get("mode");
    const mode = requestedMode === "gpt-reference" || requestedMode === "seedance-reference" ? requestedMode : "canvas-image";
    if (mode === "seedance-reference" && (!appConfig.tosEnabled || !isTosRuntimeMediaConfigured())) {
      throw new RuntimeImageUploadInputError("Seedance reference uploads require enabled and fully configured TOS storage.");
    }
    const files = form.getAll("files").filter(isUploadedFile);
    if (!files.length) return NextResponse.json({ error: "At least one image file is required." }, { status: 400 });
    if (files.length > maxCanvasUploadFiles) {
      return NextResponse.json({ error: `No more than ${maxCanvasUploadFiles} images may be imported at once.` }, { status: 400 });
    }
    if (files.reduce((total, file) => total + file.size, 0) > maxCanvasUploadBytes) {
      return NextResponse.json({ error: "The combined image upload is too large." }, { status: 400 });
    }

    const images = [];
    for (const file of files) {
      const image = await saveRuntimeImageUpload(file, {
        directory: "canvas-uploads",
        prefix: "canvas",
        ...(mode === "gpt-reference" ? { maxBytes: maxGptReferenceBytes, allowedMimeTypes: ["image/png", "image/jpeg"] } : {}),
        ...(mode === "seedance-reference" ? { allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"] } : {}),
      });
      if (mode === "seedance-reference" && !/^https?:\/\//i.test(image.imageUrl)) {
        throw new RuntimeImageUploadInputError("Seedance reference upload did not produce a public HTTP(S) URL.");
      }
      images.push(image);
    }
    return NextResponse.json({ images }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Canvas images could not be imported.";
    const status = isWorkspaceSignInError(error) ? 401 : error instanceof RuntimeImageUploadInputError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

function isUploadedFile(value: FormDataEntryValue): value is File {
  return typeof File !== "undefined" && value instanceof File;
}
