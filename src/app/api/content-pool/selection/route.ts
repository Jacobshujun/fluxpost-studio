import { NextResponse } from "next/server";
import { listContentPoolSelection, resolveContentPoolSelection } from "@/lib/content-pool";
import type { ContentPoolSelectionFilter, ContentTag, Platform, SourceMediaType, SourceUsageStatus } from "@/lib/types";
import { isWorkspaceSignInError, requireWorkspaceAccount } from "@/lib/workspace-accounts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const account = await requireWorkspaceAccount(request);
    const searchParams = new URL(request.url).searchParams;
    const filter: Partial<ContentPoolSelectionFilter> = {
      projectId: searchParams.get("projectId") || undefined,
      query: searchParams.get("q") || "",
      platforms: searchParams.getAll("platform") as Platform[],
      statuses: searchParams.getAll("status") as SourceUsageStatus[],
      mediaTypes: searchParams.getAll("mediaType") as SourceMediaType[],
      contentTags: searchParams.getAll("contentTag") as ContentTag[],
      customTags: searchParams.getAll("customTag"),
      localMediaComplete: searchParams.get("localMedia") === "complete",
      sort: (searchParams.get("sort") || "hot-desc") as ContentPoolSelectionFilter["sort"],
    };
    const itemId = searchParams.get("itemId")?.trim();
    if (itemId) {
      const item = (await resolveContentPoolSelection({}, account)).find((candidate) => candidate.id === itemId);
      return NextResponse.json({ items: item ? [item] : [], projects: [], total: item ? 1 : 0 });
    }
    const page = await listContentPoolSelection(
      filter,
      account,
      searchParams.get("cursor") || undefined,
      Number(searchParams.get("limit") || 40),
    );
    return NextResponse.json(page);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read content-pool selection";
    return NextResponse.json({ error: message }, { status: isWorkspaceSignInError(error) ? 401 : 500 });
  }
}
