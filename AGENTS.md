# FluxPost Studio Agents Protocol

## Project

FluxPost Studio (`social-content-studio`) is a local Next.js web app for social media content harvesting, AI-assisted post creation, review, and Feishu CLI publishing.

## Harness Fact Sources

Use `docs/harness/` as the only persistent project context.

- `docs/harness/project_brief.md`: confirmed project facts, stack, flows, data, deployment facts, and unknowns.
- `docs/harness/feature_list.json`: feature state machine. Do not mark a feature `done` without evidence.
- `docs/harness/progress.md`: current focus, latest status, risks, verification records, and next step.
- `docs/harness/handoff.md`: new-session recovery instructions and current work entry point.
- `docs/harness/decisions.md`: stable product, architecture, and deployment decisions.
- `docs/harness/verification.md`: baseline commands, automation coverage, recent verification, and manual checks.
- `docs/harness/pitfalls.md`: known traps and integration/verification risks.
- `docs/harness/architecture_rules.md`: module, data, deployment, and Harness boundaries.

## Startup Protocol

At the start of a new session:

1. Read `AGENTS.md`.
2. Read `docs/harness/handoff.md`, `docs/harness/progress.md`, `docs/harness/feature_list.json`, and `docs/harness/decisions.md`.
3. If the task touches product scope, users, stack, runtime data, APIs, or deployment, read `docs/harness/project_brief.md`.
4. Before finishing, read `docs/harness/verification.md`.
5. Before changing code or deployment behavior, read `docs/harness/pitfalls.md` and `docs/harness/architecture_rules.md`.

## Work Protocol

- Work on one clearly defined task at a time.
- Before edits, state the affected files, behavior impact, and verification method.
- Do not do unrelated refactors, formatting churn, or metadata cleanup.
- Do not invent checks or commands. Use commands that exist in this project.
- If frontend or API code changes must be visible on the local production server at `http://127.0.0.1:3001/`, run `npm run local:restart`; `npm run build` alone does not refresh an already-running `next start` process.
- Record only facts that can be confirmed from the repository or from an explicit user instruction. Mark unknowns as `待确认`.

## Completion Protocol

After development, debugging, deployment work, or important analysis:

1. Run the baseline verification from `docs/harness/verification.md`.
2. Update `docs/harness/progress.md` and `docs/harness/handoff.md`.
3. If feature state changed, update `docs/harness/feature_list.json`.
4. Update `decisions.md`, `pitfalls.md`, `architecture_rules.md`, or `verification.md` only when there is a stable new fact.

## Boundary Rules

- Do not commit or expose secrets, production config, `.env.local`, `.env*`, API keys, local user data, uploaded materials, generated outputs, cached media, or auth logs.
- Runtime data and generated media live under `data/`, `public/generated/`, `public/media/`, and local debug artifacts such as `.tmp-*.json` or `test-artifacts/`; treat them as local state, not Harness context.
- Deployment must use the confirmed project entry points until a dedicated deployment document is added: `npm run dev`, `npm run dev:lan`, `npm run build`, `npm run start`, `npm run start:lan`, and `npm run local:restart`.
- Do not create another memory, TODO, planning, or handoff system outside `docs/harness/`.

## Quality Rules

- Do not add meaningless fallback code, broad try/catch blocks, silent error swallowing, polling, compatibility branches, or default values just to make the app look stable.
- When behavior is uncertain, identify the real cause, make the fix explicit, and verify it.
- External production services must not be called by default baseline checks unless a safe isolated test path is added and documented.
