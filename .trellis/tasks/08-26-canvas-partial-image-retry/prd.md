# 恢复画布失败图片重试

## Goal

Restore the V2 infinite-Canvas batch control that lets an operator retry only failed images when a child task completed partially, without repeating successful paid image work.

## Background

- A `model.gpt-image-each` node can retain successful image children while its Canvas run and schedule child project as `partial` because other images failed.
- The executor already persists per-image failure metadata and reuses successful children on a node retry.
- Commit `d61d396` removed all partial-specific retry controls while isolating Canvas execution diagnostics from review and Feishu policy. The review/publish isolation remains required; only the narrowly retryable Canvas operation is restored.

## Requirements

- V2 schedule child tasks in `failed` state remain retryable as today.
- A V2 schedule child in `partial` state is retryable only when its existing run contains a latest `model.gpt-image-each` node attempt with failed child metadata.
- The child action says `重试失败图片` for a retryable partial task and preserves the existing `重试` label for failed tasks.
- The V2 row action includes failed children and retryable partial image children, while leaving completed and non-retryable partial children unchanged.
- Retry reuses the existing Canvas run so successful images, per-image attempt history, owner scope, schedule revision behavior, pause state, current generated post, and candidate synchronization are preserved.
- Generic partial nodes, partial shared stages, frozen shared artifacts, V1 schedules, review controls, and Feishu publishing rules remain unchanged.
- No API action, shared public type, database field, migration, automatic provider retry, or live external-service check is added.

## Acceptance Criteria

- [x] A V2 partial child backed by failed `model.gpt-image-each` children shows `重试失败图片` and queues its existing run.
- [x] The row retry includes failed and retryable partial children, but not completed or generic partial children.
- [x] The scheduler selects the earliest ordinary failed/configuration node first, then a retryable partial `model.gpt-image-each` node when no ordinary failure exists.
- [x] Successful per-image results and an existing generated post remain preserved through retry and candidate synchronization.
- [x] Generic partial children and partial shared stages remain non-retryable with explicit validation errors.
- [x] Deterministic Canvas scheduler/image checks and the complete offline Trellis baseline pass without provider or Feishu calls.
- [x] Stable Trellis decisions no longer state that every partial Canvas child is forbidden from retry; the exception is limited to failed children inside `model.gpt-image-each`.

## Out Of Scope

- Restoring V1 partial schedule retry.
- Restoring partial shared-stage or ordinary Canvas node-card retry controls.
- Reintroducing `canvasImageBatch` on generated posts or coupling Canvas diagnostics to review/publish availability.
