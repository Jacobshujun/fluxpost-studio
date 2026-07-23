import { NextResponse } from "next/server";
import { importLibraryAsset } from "@/lib/library-assets";
import { kickLibraryTaggingWorker } from "@/lib/library-tagging";
import type { LibraryAssetRole, LibraryVisibility } from "@/lib/types";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Image file is required." }, { status: 400 });
    const result = await importLibraryAsset(account, {
      bytes: Buffer.from(await file.arrayBuffer()),
      originalName: file.name,
      relativePath: stringValue(form.get("relativePath")),
      role: (stringValue(form.get("role")) || "reference") as LibraryAssetRole,
      visibility: (stringValue(form.get("visibility")) || "private") as LibraryVisibility,
      collectionId: stringValue(form.get("collectionId")),
    });
    if ("job" in result && result.job) kickLibraryTaggingWorker();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Library import failed." },
      { status: isWorkspaceSignInError(error) ? 401 : 400 },
    );
  }
}

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
