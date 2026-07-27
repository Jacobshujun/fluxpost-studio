# Canvas Node Result And Execution Controls

## Goal

Extend the existing infinite canvas with a durable read-only image preview node, genuinely isolated node execution, and ComfyUI-style enabled/bypass/disabled node modes without changing the existing run-with-upstream behavior.

## Background

- This is a follow-up to `.trellis/tasks/07-24-infinite-canvas-workflows`; that task remains pending its existing operator-approved live review gates.
- Canvas workflows, immutable run snapshots, node runs, latest-success projection, GPT-Image-2, content composition, and the review desk already exist.
- Current selected-node execution runs the selected node and every ancestor, so composing a post can unintentionally rerun a paid image model.
- Current latest-success lookup scans only the recent run list and is not a durable per-workflow result lookup.

## Requirements

- Add `utility.image-preview` with one required images input and one images output. It is read-only and stores only media URLs and metadata in durable node-run outputs.
- Automatically capture a directly connected upstream image result when that producer succeeds. A failed, cancelled, or empty result must not replace the previous successful preview.
- Add `CanvasNode.executionMode` with enabled, bypass, and disabled behavior; missing values normalize to enabled.
- Bypass must use an explicit registry port mapping and pass compatible artifacts without invoking the executor. Nodes without a mapping cannot enter bypass mode.
- Disabled nodes produce no output. Missing optional downstream input remains runnable; missing required input blocks only that dependent branch.
- Add isolated execution for exactly one target node. Literal input ancestors use current config, while other ancestors reuse compatible successful outputs. Isolated execution must never implicitly rerun model or external-write ancestors.
- Preserve the current run-with-upstream mode as the default API and UI behavior.
- Reused outputs must record source run/node-run provenance. Ordinary reuse requires matching node identity/type/version/config and resolved input fingerprint. Preview results remain valid while their input edge identity is unchanged.
- Confirmation plans must include only nodes that will actually execute, excluding reused, bypassed, disabled, and blocked nodes.
- A successful content-composition execution continues to create a new draft generated post and exposes a review-desk link.
- Preserve owner scoping, immutable run snapshots, URL-only media persistence, revision conflicts, clipboard behavior, and deterministic baseline safety.

## Acceptance Criteria

- [ ] Existing workflows and API callers without the new fields retain enabled and with-upstream behavior.
- [ ] Image preview nodes display and output the latest successful captured image set across all workflow history, including when it is older than the recent run-list limit.
- [ ] Preview capture never calls an external provider and failed/empty upstream results do not erase a successful preview.
- [ ] Isolated content composition combines current literal text with a compatible GPT image/preview result without invoking GPT-Image-2.
- [ ] Isolated execution is rejected before enqueue when a required reusable result is absent or incompatible, with the blocking node identified.
- [ ] Bypass passes only its declared compatible input to output and never invokes the node executor.
- [ ] Disabled nodes and their required dependents are represented explicitly while unrelated runnable branches continue.
- [ ] Paid/external confirmation excludes work that will be reused, bypassed, disabled, or blocked.
- [ ] Node mode survives save, immutable snapshot, duplicate, copy, cut, and paste.
- [ ] Desktop and mobile canvas views expose image preview, node modes, isolated run, run-with-upstream, result status, and review navigation without overflow.
- [ ] Focused deterministic checks, TypeScript, lint, build, full Trellis baseline, local restart, and mocked browser checks pass without paid or Feishu calls.

## Out Of Scope

- Editing, deleting, reordering, or selecting a primary image inside the preview node.
- Automatic provider retries, live provider validation, arbitrary node plugins, conditions, loops, or schedules.
- Changing the existing infinite-canvas task's live Seedance/Feishu/PostgreSQL review gates.
