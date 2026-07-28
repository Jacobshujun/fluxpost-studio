import { NextResponse } from "next/server";
import { createCopyLibraryEntry, listCopyLibraryEntries, parseCopyLibraryFilters, type CopyLibraryInput } from "@/lib/copy-library";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    return NextResponse.json(await listCopyLibraryEntries(account, parseCopyLibraryFilters(new URL(request.url))));
  } catch (error) {
    return copyLibraryError(error, isWorkspaceSignInError(error) ? 401 : 400);
  }
}

export async function POST(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const input = (await request.json()) as CopyLibraryInput;
    return NextResponse.json({ entry: await createCopyLibraryEntry(account, input) }, { status: 201 });
  } catch (error) {
    return copyLibraryError(error, isWorkspaceSignInError(error) ? 401 : 400);
  }
}

function copyLibraryError(error: unknown, status: number) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Copy library request failed." }, { status });
}
