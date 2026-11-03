import { NextResponse } from "next/server";
import { getSourceItemsByIds } from "@/lib/content-pool";
import { RuntimeImageUploadInputError, saveRuntimeImageUpload } from "@/lib/runtime-image-upload";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";
import { canAccessWorkspaceOwner } from "@/lib/workspace-ownership";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const form = await request.formData();
    const id = form.get("id");
    const file = form.get("file");
    if (typeof id !== "string" || !id.trim() || !(file instanceof File)) {
      return NextResponse.json({ error: "请选择样本和图片文件" }, { status: 400 });
    }
    const [item] = await getSourceItemsByIds([id], account);
    if (!item || !canAccessWorkspaceOwner(account, item.ownerUserId)) {
      return NextResponse.json({ error: "样本不存在或无权访问" }, { status: 404 });
    }
    return NextResponse.json(await saveRuntimeImageUpload(file, { directory: "content-uploads", prefix: "content" }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "图片上传失败" }, {
      status: isWorkspaceSignInError(error) ? 401 : error instanceof RuntimeImageUploadInputError ? 400 : 500,
    });
  }
}
