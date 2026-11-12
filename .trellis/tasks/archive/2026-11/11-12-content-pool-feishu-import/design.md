# Design

Add `mode=feishu` to the content page's URL-backed capture selector. Reuse existing import form and result summary, with separate Feishu text/options so link drafts remain intact. Submit arrays of one identifier per line to `/api/crawl/feishu`; no platform/cookie fields in Feishu requests.

Extract the Canvas Feishu preparation into `feishu-content-pool-import.ts`. Both entry points reuse import, safety, tagging, owner ingest and video flags. The Canvas caller requests strict single-item behavior; the content desk supports batch partial results and a destination collection. Return the existing link-import response shape for reuse of result display. Missing numbers map to failed results; filtered items cannot remain imported.

The API authenticates, validates query/array/count/options and checks the collection before invoking the external importer. Responses strip item raw data and return project summaries. No credentials enter requests or persisted UI state.

Offline fixtures mock external import and use isolated route dependencies; browser intercepts all APIs on a worker-disabled 45678 server. Existing Canvas tests exercise the extracted implementation. Local 3001 activation follows verified clean commits and task archival.
