import { NextResponse } from "next/server";
import { importLibraryAsset } from "@/lib/library-assets";
import type { LibraryVisibility } from "@/lib/types";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const form = await request.formData();
    if (form.has("role")) throw new Error("Library roles are no longer supported. Use collectionIds.");
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Image file is required." }, { status: 400 });
    const result = await importLibraryAsset(account, {
      bytes: Buffer.from(await file.arrayBuffer()),
      originalName: file.name,
      relativePath: stringValue(form.get("relativePath")),
      visibility: (stringValue(form.get("visibility")) || "team") as LibraryVisibility,
      collectionIds: parseCollectionIds(form),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Library import failed." },
      { status: isWorkspaceSignInError(error) ? 401 : 400 },
    );
  }
}

function parseCollectionIds(form: FormData) {
  const repeated = form.getAll("collectionId").flatMap((value) => typeof value === "string" ? value.split(",") : []);
  const encoded = stringValue(form.get("collectionIds"));
  if (encoded) {
    try {
      const parsed = JSON.parse(encoded) as unknown;
      if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "string")) throw new Error();
      repeated.push(...parsed);
    } catch {
      throw new Error("collectionIds must be a JSON string array.");
    }
  }
  return Array.from(new Set(repeated.map((value) => value.trim()).filter(Boolean)));
}

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
