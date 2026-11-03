import type {
  ContentPoolDeskFilter,
  ContentPoolDeskSort,
  ContentTag,
  Platform,
  SourceMediaType,
  SourceUsageStatus,
} from "@/lib/types";

export type ContentPoolDeskRequest = {
  filter: Partial<ContentPoolDeskFilter>;
  cursor?: string;
  limit?: number;
};

export function parseContentPoolDeskRequest(searchParams: URLSearchParams): ContentPoolDeskRequest {
  const limit = Number(searchParams.get("limit") || "");
  return {
    filter: {
      library: searchParams.get("library") || "all",
      includeDescendants: searchParams.get("descendants") !== "0",
      query: searchParams.get("q") || "",
      statuses: searchParams.getAll("status") as SourceUsageStatus[],
      platforms: searchParams.getAll("platform") as Platform[],
      mediaTypes: searchParams.getAll("mediaType") as SourceMediaType[],
      contentTags: searchParams.getAll("contentTag") as ContentTag[],
      customTags: searchParams.getAll("customTag"),
      projectId: searchParams.get("projectId") || undefined,
      sort: (searchParams.get("sort") as ContentPoolDeskSort | null) || "hot_desc",
    },
    cursor: searchParams.get("cursor") || undefined,
    limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
  };
}
