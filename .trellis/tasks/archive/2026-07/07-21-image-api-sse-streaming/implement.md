# Implementation

- [x] Add focused failing tests for request shape, SSE chunk parsing, partial/final handling, protocol errors, and body timeout.
- [x] Implement a small stateful OpenAI image SSE decoder with no provider or filesystem dependencies.
- [x] Wire generation and edit requests to SSE and keep the abort deadline active through stream consumption.
- [x] Preserve existing response adaptation, retry/failover, concurrency, and image persistence.
- [x] Add transport-only execution-log details without payload data.
- [x] Run focused checks, TypeScript, lint, build, and the complete Trellis baseline.
- [x] Update stable README/task facts and finish the task without modifying overlapping global status work.
