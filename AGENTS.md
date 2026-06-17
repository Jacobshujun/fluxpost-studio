# FluxPost Studio Agents Protocol

## Project

FluxPost Studio (`social-content-studio`) is a local Next.js web app for social media content harvesting, AI-assisted post creation, review, and Feishu CLI publishing.

## Harness Fact Sources

Use `docs/harness/` as the only persistent project context.

- `docs/harness/status.md`: lightweight current state, next entry point, recent verification, risks, and history paths.
- `docs/harness/feature_list.json`: feature state machine. Do not mark a feature `done` without evidence.
- `docs/harness/rules.md`: stable Harness rules, context budgets, history-reading policy, and quality rules.
- `docs/harness/project_brief.md`: confirmed project facts, stack, flows, data, deployment facts, and unknowns.
- `docs/harness/handoff.md`: on-demand handoff history. Do not read the whole file during startup.
- `docs/harness/progress.md`: on-demand progress history. Do not read the whole file during startup.
- `docs/harness/decisions.md`: stable product, architecture, and deployment decisions.
- `docs/harness/verification.md`: baseline commands, automation coverage, recent verification, and manual checks.
- `docs/harness/pitfalls.md`: known traps and integration/verification risks.
- `docs/harness/architecture_rules.md`: module, data, deployment, and Harness boundaries.

## Startup Protocol

At the start of a new session:

1. Read `AGENTS.md`.
2. Read `docs/harness/status.md`.
3. Read `docs/harness/feature_list.json`.
4. Read `docs/harness/rules.md`.
5. If the task touches scope, users, product behavior, or technical stack, read `docs/harness/project_brief.md`.
6. Before claiming completion, read `docs/harness/verification.md`.
7. Do not default to whole-file reads of `docs/harness/handoff.md` or `docs/harness/progress.md`.
8. When recent history is needed, read only the content between `<!-- HARNESS-LATEST-START -->` and `<!-- HARNESS-LATEST-END -->` in `handoff.md` or `progress.md`.
9. If the latest entry is not enough, locate deeper history by heading, keyword, date, or feature id before reading larger archive sections.

## Work Protocol

- Work on one clearly defined task at a time.
- Before edits, state the affected files, behavior impact, and verification method.
- Do not do unrelated refactors, formatting churn, or metadata cleanup.
- Do not invent checks or commands. Use commands that exist in this project.
- For code or deployment changes, use `docs/harness/rules.md` first, then read targeted sections of `docs/harness/pitfalls.md`, `docs/harness/architecture_rules.md`, or `docs/harness/decisions.md` only when the task touches those boundaries.
- If frontend or API code changes must be visible on the local production server at `http://127.0.0.1:3001/`, run `npm run local:restart`; `npm run build` alone does not refresh an already-running `next start` process.
- Record only facts that can be confirmed from the repository or from an explicit user instruction. Mark unknowns as `待确认`.

## Completion Protocol

After development, debugging, deployment work, or important analysis:

1. Run the baseline verification from `docs/harness/verification.md`.
2. Update `docs/harness/status.md` with the current lightweight state when the task outcome changes.
3. If feature state changed, update `docs/harness/feature_list.json`.
4. Update `docs/harness/handoff.md` or `docs/harness/progress.md` only when the task is unfinished across sessions, reusable troubleshooting/deployment evidence was discovered, or the user explicitly asks.
5. Update `decisions.md`, `pitfalls.md`, `architecture_rules.md`, or `verification.md` only when there is a stable new fact.

## Boundary Rules

- Do not commit or expose secrets, production config, `.env.local`, `.env*`, API keys, local user data, uploaded materials, generated outputs, cached media, or auth logs.
- Runtime data and generated media live under `data/`, `public/generated/`, `public/media/`, and local debug artifacts such as `.tmp-*.json` or `test-artifacts/`; treat them as local state, not Harness context.
- Deployment must use the confirmed project entry points until a dedicated deployment document is added: `npm run dev`, `npm run dev:lan`, `npm run build`, `npm run start`, `npm run start:lan`, and `npm run local:restart`.
- Do not create another memory, TODO, planning, or handoff system outside `docs/harness/`.

## Quality Rules

- Do not add meaningless fallback code, broad try/catch blocks, silent error swallowing, polling, compatibility branches, or default values just to make the app look stable.
- When behavior is uncertain, identify the real cause, make the fix explicit, and verify it.
- External production services must not be called by default baseline checks unless a safe isolated test path is added and documented.
