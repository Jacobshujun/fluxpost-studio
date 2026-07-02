# FluxPost Studio Agents Protocol

## Project

FluxPost Studio (`social-content-studio`) is a local Next.js web app for social media content harvesting, AI-assisted post creation, review, and Feishu CLI publishing.

## Trellis Fact Sources

Use `.trellis/` as the only active persistent AI collaboration system.

- `.trellis/workflow.md`: Trellis task workflow, phases, and task lifecycle rules.
- `.trellis/spec/fluxpost/status.md`: lightweight current state, next entry point, recent verification, risks, and history paths.
- `.trellis/spec/fluxpost/feature_list.json`: feature state machine. Do not mark a feature `done` without evidence.
- `.trellis/spec/fluxpost/rules.md`: stable FluxPost rules, context budgets, history-reading policy, and quality rules.
- `.trellis/spec/fluxpost/project_brief.md`: confirmed project facts, stack, flows, data, deployment facts, and unknowns.
- `.trellis/spec/fluxpost/handoff.md`: on-demand handoff history. Do not read the whole file during startup.
- `.trellis/spec/fluxpost/progress.md`: on-demand progress history. Do not read the whole file during startup.
- `.trellis/spec/fluxpost/decisions.md`: stable product, architecture, and deployment decisions.
- `.trellis/spec/fluxpost/verification.md`: baseline commands, automation coverage, recent verification, and manual checks.
- `.trellis/spec/fluxpost/pitfalls.md`: known traps and integration/verification risks.
- `.trellis/spec/fluxpost/architecture_rules.md`: module, data, deployment, and Trellis boundaries.
- `.trellis/verification/`: local deterministic baseline scripts.

`docs/harness.disabled/` and `scripts/harness.disabled/` are disabled migration archives. Do not use them as active context or command entry points unless the user explicitly asks for migration archaeology.

## Startup Protocol

At the start of a new session:

1. Read `AGENTS.md`.
2. Read `.trellis/workflow.md` only as needed to understand Trellis task state.
3. Read `.trellis/spec/fluxpost/status.md`.
4. Read `.trellis/spec/fluxpost/feature_list.json`.
5. Read `.trellis/spec/fluxpost/rules.md`.
6. If the task touches scope, users, product behavior, or technical stack, read `.trellis/spec/fluxpost/project_brief.md`.
7. Before claiming completion, read `.trellis/spec/fluxpost/verification.md`.
8. Do not default to whole-file reads of `.trellis/spec/fluxpost/handoff.md` or `.trellis/spec/fluxpost/progress.md`.
9. When recent history is needed, read only the content between `<!-- TRELLIS-LATEST-START -->` and `<!-- TRELLIS-LATEST-END -->` in `handoff.md` or `progress.md`.
10. If the latest entry is not enough, locate deeper history by heading, keyword, date, or feature id before reading larger archive sections.

## Work Protocol

- Work on one clearly defined task at a time.
- For substantial or multi-step work, use Trellis task artifacts under `.trellis/tasks/` according to `.trellis/workflow.md`.
- Before edits, state the affected files, behavior impact, and verification method.
- Do not do unrelated refactors, formatting churn, or metadata cleanup.
- Do not invent checks or commands. Use commands that exist in this project.
- For code or deployment changes, use `.trellis/spec/fluxpost/rules.md` first, then read targeted sections of `.trellis/spec/fluxpost/pitfalls.md`, `.trellis/spec/fluxpost/architecture_rules.md`, or `.trellis/spec/fluxpost/decisions.md` only when the task touches those boundaries.
- If frontend or API code changes must be visible on the local production server at `http://127.0.0.1:3001/`, run `npm run local:restart`; `npm run build` alone does not refresh an already-running `next start` process.
- Record only facts that can be confirmed from the repository or from an explicit user instruction. Mark unknowns as `pending confirmation`.

## Completion Protocol

After development, debugging, deployment work, or important analysis:

1. Run the baseline verification from `.trellis/spec/fluxpost/verification.md`.
2. Update `.trellis/spec/fluxpost/status.md` with the current lightweight state when the task outcome changes.
3. If feature state changed, update `.trellis/spec/fluxpost/feature_list.json`.
4. Update `.trellis/spec/fluxpost/handoff.md`, `.trellis/spec/fluxpost/progress.md`, or `.trellis/workspace/` only when the task is unfinished across sessions, reusable troubleshooting/deployment evidence was discovered, or the user explicitly asks.
5. Update `.trellis/spec/fluxpost/decisions.md`, `.trellis/spec/fluxpost/pitfalls.md`, `.trellis/spec/fluxpost/architecture_rules.md`, or `.trellis/spec/fluxpost/verification.md` only when there is a stable new fact.

## Boundary Rules

- Do not commit or expose secrets, production config, `.env.local`, `.env*`, API keys, local user data, uploaded materials, generated outputs, cached media, or auth logs.
- Runtime data and generated media live under `data/`, `public/generated/`, `public/media/`, and local debug artifacts such as `.tmp-*.json` or `test-artifacts/`; treat them as local state, not Trellis context.
- Deployment must use the confirmed project entry points until a dedicated deployment document is added: `npm run dev`, `npm run dev:lan`, `npm run build`, `npm run start`, `npm run start:lan`, and `npm run local:restart`.
- Do not create another memory, TODO, planning, handoff, or agent-context system outside `.trellis/`.

## Quality Rules

- Do not add meaningless fallback code, broad try/catch blocks, silent error swallowing, polling, compatibility branches, or default values just to make the app look stable.
- When behavior is uncertain, identify the real cause, make the fix explicit, and verify it.
- External production services must not be called by default baseline checks unless a safe isolated test path is added and documented.
