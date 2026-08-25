# Canvas schedule partial retry

## Goal

Restore Canvas batch retry when per-image GPT reconstruction is partially complete, without repeating successful paid work.

## Background

- V1/V2 schedule tasks project Canvas run status, including `partial`, but current UI/service retry only `failed`.
- The executor already persists per-image metadata and reuses successful children.

## Requirements

- V1/V2 child rows must expose retry for `failed` and retryable `partial`; partial uses `重试失败图片`.
- V2 row-level retry must include both failed child tasks and retryable partial child tasks.
- Schedule retry services must accept `partial` only when the underlying run contains a `model.gpt-image-each` node attempt with failed children.
- Retry target selection must keep the existing earliest execution-order failure priority, then select a retryable partial per-image node when no ordinary failed/blocked/needs-config node exists.
- V1 image-task, V2 child-task, V2 row-level, and shared-stage retry must use the same retryable-node selection rule.
- Preserve run history/reuse, generated posts, owner scope, revisions, pause behavior, and candidate synchronization.
- Do not add API actions, public types, database fields, migrations, automatic provider retries, or live external-service calls.

## Acceptance Criteria

- [x] A V1 partial per-image task shows `重试失败图片` and queues its existing run.
- [x] A V2 partial child task supports single-child retry; a row action retries every failed or retryable partial child and leaves completed children unchanged.
- [x] A partial shared stage retries only before artifacts freeze or children launch.
- [x] A `partial` task without a failed `model.gpt-image-each` child remains non-retryable and returns a clear validation error if requested directly.
- [x] Per-image retry submits only failed children and preserves ordered successes.
- [x] Deterministic scheduler and image-each checks, TypeScript, lint, production build, and the full offline Trellis baseline pass without provider or Feishu calls.
- [x] The verified change is committed before the clean current HEAD is activated on port `3001`; HTTP smoke passes and no push or deployment occurs.

## Out Of Scope

- Adding retry controls to ordinary Canvas node cards or task-center views.
- Retrying generic partial nodes that do not expose per-child failure metadata.
- Changing scheduler aggregation policies or automatically accepting updated review candidates.
