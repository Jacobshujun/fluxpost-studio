# Design

Carry optional hasAudio through media references and literal outputs. Reuse complete upstream metadata within the current editor snapshot. Missing metadata uses a session-local two-request queue and independent states; add layers synchronously so asynchronous responses only enrich source metadata.

Server inspection shares source validation with rendering but skips digest calculation. A bounded owner-scoped cache uses canonical location, kind and local stat size/mtime/ctime, with a short remote TTL. In-flight requests deduplicate; failures evict. Metadata probing uses a dedicated central concurrency pool. Rendering always performs its existing full hash/size/probe validation. No database or binding-key migration.
