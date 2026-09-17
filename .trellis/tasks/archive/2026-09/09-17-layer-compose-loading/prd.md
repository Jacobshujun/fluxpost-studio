# Layer editor loading, batch one

Reuse upstream image/video metadata. Inspect missing metadata without blocking editing, with per-source loading, failure and retry. Deduplicate requests, limit concurrency, and cache unchanged source metadata. Preview inspection must not hash whole videos; rendering must still verify real content. Preview videos load metadata on demand. Preserve workflow bindings, geometry, history and output behavior.

Acceptance: uploaded metadata needs no inspection; repeated missing sources deduplicate; local replacement invalidates cache; failures retry independently; closing cancels queued/client work; metadata completion never overwrites draft edits. Existing composition and theme checks pass, full offline baseline passes, then commit and activate local 3001. Unknown remote cold downloads and proxy videos remain out of scope.
