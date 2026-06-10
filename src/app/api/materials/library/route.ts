import { NextResponse } from "next/server";
import {
  createMaterialAsset,
  createMaterialFolder,
  deleteMaterialAsset,
  deleteMaterialFolder,
  listMaterialLibrary,
  updateMaterialAsset,
  updateMaterialFolder,
} from "@/lib/material-library";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const library = await listMaterialLibrary(account);
    return NextResponse.json(library);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read material library" },
      { status: isWorkspaceSignInError(error) ? 401 : 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as {
      type?: "folder" | "asset";
      name?: string;
      parentId?: string;
      folderId?: string;
      path?: string;
      tags?: string[];
    };
    if (body.type === "folder") {
      const folder = await createMaterialFolder(body.name || "", body.parentId, account);
      return NextResponse.json({ folder });
    }
    if (body.type === "asset") {
      if (!body.folderId) return NextResponse.json({ error: "Folder id is required" }, { status: 400 });
      if (!body.path) return NextResponse.json({ error: "Asset path is required" }, { status: 400 });
      const asset = await createMaterialAsset({
        folderId: body.folderId,
        path: body.path,
        name: body.name,
        tags: body.tags,
      }, account);
      return NextResponse.json({ asset });
    }
    return NextResponse.json({ error: "Unsupported material library resource type" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create material resource" },
      { status: isWorkspaceSignInError(error) ? 401 : 400 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const body = (await request.json()) as {
      type?: "folder" | "asset";
      id?: string;
      patch?: {
        name?: string;
        parentId?: string;
        folderId?: string;
        tags?: string[];
      };
    };
    if (!body.id) return NextResponse.json({ error: "Resource id is required" }, { status: 400 });
    if (body.type === "folder") {
      const folder = await updateMaterialFolder(body.id, body.patch || {}, account);
      return NextResponse.json({ folder });
    }
    if (body.type === "asset") {
      const asset = await updateMaterialAsset(body.id, body.patch || {}, account);
      return NextResponse.json({ asset });
    }
    return NextResponse.json({ error: "Unsupported material library resource type" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update material resource" },
      { status: isWorkspaceSignInError(error) ? 401 : 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const url = new URL(request.url);
    const type = url.searchParams.get("type");
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Resource id is required" }, { status: 400 });
    if (type === "folder") {
      await deleteMaterialFolder(id, account);
      return NextResponse.json({ status: "deleted" });
    }
    if (type === "asset") {
      await deleteMaterialAsset(id, account);
      return NextResponse.json({ status: "deleted" });
    }
    return NextResponse.json({ error: "Unsupported material library resource type" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete material resource" },
      { status: isWorkspaceSignInError(error) ? 401 : 400 },
    );
  }
}
