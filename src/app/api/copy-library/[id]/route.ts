import { NextResponse } from "next/server";
import { deleteCopyLibraryEntry, getCopyLibraryEntry, updateCopyLibraryEntry, type CopyLibraryInput } from "@/lib/copy-library";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const account = await requireWorkspaceAccount(request);
    return NextResponse.json({ entry: await getCopyLibraryEntry(account, (await context.params).id) });
  } catch (error) {
    return copyLibraryError(error, isWorkspaceSignInError(error) ? 401 : 404);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const account = await requireWorkspaceAccount(request);
    const input = (await request.json()) as CopyLibraryInput;
    return NextResponse.json({ entry: await updateCopyLibraryEntry(account, (await context.params).id, input) });
  } catch (error) {
    return copyLibraryError(error, isWorkspaceSignInError(error) ? 401 : copyLibraryStatus(error));
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const account = await requireWorkspaceAccount(request);
    return NextResponse.json(await deleteCopyLibraryEntry(account, (await context.params).id));
  } catch (error) {
    return copyLibraryError(error, isWorkspaceSignInError(error) ? 401 : copyLibraryStatus(error));
  }
}

function copyLibraryStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/read-only/i.test(message)) return 403;
  if (/not found/i.test(message)) return 404;
  return 400;
}

function copyLibraryError(error: unknown, status: number) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Copy library request failed." }, { status });
}
