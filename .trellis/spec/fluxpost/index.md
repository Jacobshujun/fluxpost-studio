# FluxPost Trellis Context

This layer is the project-specific operating memory migrated from the previous Harness structure. It applies to all FluxPost Studio work: product behavior, backend/API changes, frontend work, local verification, deployment commands, and cross-session handoff.

## Pre-Development Checklist

- Read `AGENTS.md`, then `.trellis/spec/fluxpost/status.md`, `.trellis/spec/fluxpost/feature_list.json`, and `.trellis/spec/fluxpost/rules.md`.
- If the task touches users, product behavior, runtime data, integrations, deployment, or stack facts, read `.trellis/spec/fluxpost/project_brief.md`.
- For code or deployment changes, read targeted sections of `.trellis/spec/fluxpost/pitfalls.md`, `.trellis/spec/fluxpost/architecture_rules.md`, or `.trellis/spec/fluxpost/decisions.md` only when that boundary is involved.
- Do not use `docs/harness.disabled/` or `scripts/harness.disabled/` as active sources. They are migration archives only.

## Guides

| File | Purpose |
| --- | --- |
| [status.md](./status.md) | Current state, next entry point, recent verification, risks, and history paths. |
| [feature_list.json](./feature_list.json) | Feature state machine and evidence. |
| [rules.md](./rules.md) | Context budgets, history-reading rules, recording policy, and quality rules. |
| [project_brief.md](./project_brief.md) | Confirmed product, stack, flow, data, deployment, and integration facts. |
| [verification.md](./verification.md) | Baseline and manual verification commands. |
| [pitfalls.md](./pitfalls.md) | Known traps and integration risks. |
| [architecture_rules.md](./architecture_rules.md) | Module, data, deployment, and Trellis boundaries. |
| [decisions.md](./decisions.md) | Stable product, architecture, and deployment decisions. |
| [handoff.md](./handoff.md) | On-demand handoff history; read only latest marker by default. |
| [progress.md](./progress.md) | On-demand progress history; read only latest marker by default. |

## Quality Check

- Run `powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1` before claiming completion unless you explicitly explain why it could not run.
- Keep default startup context under 45 KB and typical code-task context under 70 KB.
- Keep history in lightweight current files plus targeted archives; do not create another memory or handoff system outside `.trellis/`.
- Do not call live TikHub, OpenAI-compatible providers, ComfyUI, Feishu writes, Lark replies, or simple-run production in default checks.
