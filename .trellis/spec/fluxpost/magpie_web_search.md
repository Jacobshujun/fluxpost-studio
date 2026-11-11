# Magpie original web search

Applies to `magpie-web-search.ts`, shared JSON text generation, simple original creation and original batches.

- Admin advanced configuration owns `MAGPIE_GATEWAY_KEY` (secret, never returned) and `MAGPIE_WEB_SEARCH_URL` (the user-supplied HTTP MCP endpoint by default). URLs reject credentials, query strings and fragments before persistence. Existing process-global config reload applies to subsequent jobs.
- Public ConfigStatus exposes only `webSearchAvailable`; it means a key is configured, not that connectivity has been verified. Both original flows require it when search is requested, independent of text endpoint shape.
- Each search initializes an official SDK Streamable HTTP client with Bearer auth, then calls `web_search` with `{ query, count: 5 }`. Initialization has a 30-second deadline; tool execution has a 300-second deadline. Close the client in finally. No redirects, reconnect retry or model-native search fallback.
- Decode CallToolResult, reject tool errors and empty text, and concatenate text blocks in order. HTTP status errors and timeout/network/protocol failures are explicit; do not expose gateway error bodies or secrets.
- Shared JSON generation searches once using the caller's topic/requirements, adds source text as untrusted reference material with citation guidance, then calls the configured Chat or Responses provider. Search-off makes zero MCP calls; search failure makes zero text-model calls.
- No new persistence tables, public search endpoint, real-gateway baseline requests or Python dependency.

Verification: `node .trellis/verification/magpie_web_search_check.mjs`, `node .trellis/verification/advanced_config_check.mjs`, simple-original/text-reasoning regressions and the full baseline. A configured key and access to the supplied private network are required for operator acceptance. Local activation follows the clean committed HEAD rule.

Browser: `BROWSER_BASE_URL` must point to a worker-disabled loopback fixture server outside 3001; run `python .trellis/verification/magpie_web_search_browser_check.py`. All API requests are intercepted; verifies 1440/390 password input, save/reload/clear and layout. Built config checks also verify the worker observes saved Magpie credentials.
