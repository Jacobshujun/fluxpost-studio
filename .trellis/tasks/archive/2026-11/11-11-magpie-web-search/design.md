# Design

Use the official TypeScript MCP SDK with a per-search client and Streamable HTTP transport. Server-only configuration owns `MAGPIE_GATEWAY_KEY` and `MAGPIE_WEB_SEARCH_URL`, defaulting the URL to the user-supplied endpoint. Close resources in finally, bound initialization to 30 seconds and tool execution to 300 seconds, and keep provider error payloads out of user-visible errors.

The shared JSON text helper searches before calling the text provider, then supplies delimited reference text with instructions to treat it as external data. An optional search query lets original callers use the actual topic and requirements instead of sending the entire generation template. Remove model-native search dispatch. ConfigStatus exposes only search availability, reused by API guards, workers and UI. No new database schema or standalone public search route is needed.

Preserve existing search-off behavior and saved switches. No automatic external probes, Python subprocess or provider fallback. Existing unrelated worktree changes remain intact.
