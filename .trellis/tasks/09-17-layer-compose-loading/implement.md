# Execution

1. Propagate audio metadata, split lightweight inspection and cache/deduplicate probes.
2. Introduce bounded editor loader; remove global busy lock, add source retry and metadata-only video preload.
3. Extend isolated composition and browser checks for loading races, concurrency, reuse, failures and cache invalidation.
4. Run full baseline and browser checks, record evidence, update contract/status, archive and commit; activate via npm run local and verify exact HEAD.
