# Simple-run material overflow diagnosis

2026-10-27: user reports a failed simple run containing 24,197 library URLs in
materialPaths and suspects storage migration. Investigation only; no task/runtime
writes, provider calls, replay, code fix or app restart.

## Confirmed evidence

- Local version endpoint identifies candidate cba71dc27b88e47460e94e8ca9abfba9a24ba8da.
- Local PostgreSQL queries use BEGIN READ ONLY, a loopback host guard and statement
  timeouts. No credentials, source text or object paths are copied into this report.
- Latest link-mode run: started 11:43:30 CST, failed 11:45:00 CST. One source link;
  crawl and tagging succeeded; draft generation failed; zero drafts/publishing.
- materialPaths contains 24,197 TOS URLs, not OSS URLs. The prompt's URL join
  produces 4,760,990 characters. Matching openai/text log at 11:44:54 CST
  records promptLength=4,766,235. HTTP 400 follows with invalid_parameter_error:
  `Range of input length should be [1, 1000000]`. Provider length units are not
  established by this message; do not label it a token count.
- Several preceding runs have the same length error and roughly 24k materials;
  another earlier run failed at collection instead and is a distinct failure.

## Proven code path

1. src/app/page.tsx loadVehicleLibrary loads all pages of the vehicle collection;
   if its named root is absent, the query has no collection filter (separate risk;
   not proven to be the condition in this incident).
2. vehicleMaterialAssetIds maps every loaded asset, not an explicit task selection.
   Submission sends this list even for ordinary link-mode tasks.
3. src/app/api/simple/runs/route.ts resolves IDs with access checks and persists
   every URL in materialPaths. src/lib/simple-runs.ts normalization trims/dedupes
   but does not restrict selection or size, then passes the list to generatePost.
4. src/lib/openai.ts generatePost joins the entire list into the text prompt,
   alongside the original title and body. This is extraneous appended input, not
   evidence that original source content was overwritten.
5. Git blame dates the list submission to July and unified loading to August;
   URL-to-prompt concatenation exists in the June baseline. The active candidate
   contains this path. Do not attribute its introduction to October OSS changes.

## Interpretation and next repair scope

This incident is explained by uncontrolled task material selection and unbounded
URL text expansion, not a demonstrated cloud-copy side effect. Migration can
consume network resources but does not explain this explicit length rejection.
No cloud managed migration task has been created by this agent. Existing local
copy tools do not import the app/database modules or write simple task records.

Repair should distinguish browseable library assets from explicit task inputs,
avoid sending library URL inventories to a text model, and retain source title,
body and explicitly selected image processing semantics. Add offline large-library
regression coverage and request-budget checks; do not merely slice the first N URLs
or increase model limits. Existing simple_config_sync/compact checks assert URL
snapshot plumbing but do not protect against whole-library prompt expansion.
Failed runs retain old input snapshots; after a verified repair, any replay/cleanup
must be explicit and must not delete library assets or silently mutate history.

Verification: code/history inspection, local version endpoint and read-only DB/log
evidence above. No paid model reproduction. Baseline rerun passed pre-lint domains
and stopped at the known 17 ignored-script lint errors / 17 warnings; no gate was
weakened. Evidence: ignored .tmp-simple-material-diagnosis-baseline.log. Diff check
passed. This document is not a claim of a fix or successful task replay.
