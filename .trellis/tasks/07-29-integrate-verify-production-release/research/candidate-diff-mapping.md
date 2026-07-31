# Research: Root-to-candidate dirty hunk mapping

> Subsequent scope decision: after this mapping was prepared, the user approved the grouped release plan and the active PRD was expanded. Legacy local-material retirement and local Next build slimming are therefore included subject to fresh exact-candidate verification. Root VPS wrapper v2 changes, Feishu/table-id/media follow-ups, broad verification migration, and runtime/debug artifacts remain excluded. Canvas random-copy, queue-concurrency, and run/retry reliability hunks are included with hunk-level review.

- Query: Map every remaining dirty implementation hunk in the root worktree to the requested candidate groups, identify candidate presence, dependencies, unsafe whole-file copies, and deterministic evidence.
- Scope: internal
- Date: 2026-07-29

## Findings

### Comparison basis

- Root worktree: `main` at `2279f31`, with no staged files and 75 dirty files (`+1793/-2200`), as reported by the coordinating agent's read-only Git inventory.
- Candidate worktree: `.tmp-release-candidate-20260729`, branch `release/shared-libraries-20260729`, reported candidate commit `3a8b9e0`.
- The candidate already contains the approved shared-library sorting/selection and member-upload integration. Normalized filesystem comparison confirms that these root files are semantically identical to the candidate despite some line-ending differences: `src/app/api/library/import/route.ts`, `src/app/copy-library/page.tsx`, `src/app/copy-library/copy-library.module.css`, `src/lib/copy-library.ts`, `src/lib/library-sort.ts`, `src/lib/list-selection.ts`, `src/lib/marquee-selection.ts`, `src/lib/use-library-list-sort.ts`, `src/lib/use-marquee-selection.ts`, `.trellis/verification/simple_queue_check.mjs`, and `.trellis/verification/feishu_cli_identity_check.mjs`. They need no further port.
- The release PRD explicitly excludes legacy local-material removal and unrelated infrastructure/spec changes (`prd.md` R13), and the release evidence warns that mixed library/content files must not be copied wholesale (`research/release-evidence.md`, Overlap Risk).

### Candidate decision map

| Group | Remaining root ownership | Candidate state | Recommendation | Evidence quality |
|---|---|---|---|---|
| Legacy local-material retirement | Route/module deletions; home/content UI removal; simple-run asset-id resolution; schema/import/type cleanup; HTTP material support | Deliberately absent; candidate retains legacy routes, modules, schema, and migration path | Exclude from this release | Strong focused evidence, but full wrapper was blocked and release scope explicitly excludes it |
| Local Next build slimming | Conditional standalone mode, trace exclusions, Docker build env, focused build-output assertions | Absent; candidate still defaults to standalone and has a newer Docker verification stage | Exclude unless scope is explicitly expanded; hunk-port only | Task ACs are checked, but no exact-candidate baseline evidence |
| Canvas random copy pool | Scheduler no-replacement allocation/resampling, Canvas labels/status, scheduler checks | Absent | Eligible only as an explicit scope expansion; port reviewed hunks and re-run all gates | Strong focused deterministic evidence; full wrapper was blocked |
| Canvas queue concurrency | Canvas concurrency config and bounded consumer group, Canvas/concurrency checks | Absent | Eligible only as an explicit scope expansion; port reviewed hunks and re-run all gates | Strong focused deterministic evidence; local restart deferred and full wrapper blocked |
| Canvas run/retry reliability | Clear stale run errors while provider work remains pending; retry earliest failed execution step; suppress nonterminal child errors | Absent | Exclude by default or treat as a separately reviewed integration fix; never take whole scheduler/runs files | Executable assertions exist, but there is no dedicated task/evidence entry for this exact bundle |
| VPS deployment wrapper | Root wrapper v2, app-only swap allowance, domain wrapper pinning; deployment docs/check edits | Candidate already has wrapper v3, operation locking, and `vps-verify-candidate.sh` | Exclude all root wrapper/docs hunks; keep candidate versions | Candidate contract is stronger; root wholesale copy would be a functional downgrade |
| Feishu/table-id/media fixes | Table-id normalization; removal of unsupported CLI format flags; shared runtime image-upload delegation; library role/tag follow-ups | Absent except already integrated member-upload/import behavior | Exclude from this release; split into independently verified follow-ups if desired | Static deterministic checks exist, but no coherent active task or exact-candidate evidence for the combined bundle |
| Verification/spec-only migration | Broad `.trellis/`, disabled-harness, task, and spec drift | Candidate already contains `.trellis/verification/check.mjs` and the release task/browser check | Keep candidate verification/spec state; port only evidence for code actually selected | Root wrapper is known incomplete because `check.mjs` is absent |
| Debug/runtime artifacts | `.env.local`, `data/`, generated/media trees, `.tmp-*`, screenshots, `test-artifacts/`, `.next/`, `tsconfig.tsbuildinfo`, Trellis runtime/session and Python cache files | Not release inputs | Always exclude | Boundary rule, not a verification question |

### Hunk and dependency mapping

#### 1. Legacy local-material retirement

Owned paths:

- Delete `src/app/api/library/migrate/route.ts`, `src/app/api/materials/library/route.ts`, `src/app/api/materials/preview/route.ts`, `src/app/api/materials/scan/route.ts`, `src/lib/material-library.ts`, and `src/lib/materials.ts`.
- Change `src/app/page.tsx`, `src/app/content/page.tsx`, `src/app/globals.css`, `src/app/api/simple/runs/route.ts`, `src/lib/database.ts`, `src/lib/types.ts`, `src/lib/viral-replication.ts`, `db/migrations/001_initial_postgres.sql`, and `scripts/db/migrate-sqlite-to-postgres.mjs`.
- `src/lib/library-assets.ts` adds authenticated role-based asset resolution at `src/lib/library-assets.ts:125` while removing legacy migration/import support. This file also contains unrelated library role-removal changes and is unsafe to copy wholesale.
- Verification ownership spans `.trellis/verification/material_library_preview_check.mjs` deletion plus `library_assets_check.mjs`, vehicle/simple queue, schema, migration, and HTTP assertions.

Dependencies are all-or-nothing across UI, API trust boundary, durable input snapshots, schema retirement, migration import removal, shared types, and legacy route/module deletion. Partial porting can leave broken imports, active endpoints without storage, or historical run incompatibility. The task design explicitly preserves historical local paths while adding HTTP(S) support (`07-29-remove-legacy-local-materials/design.md:26`).

Evidence: `.trellis/spec/fluxpost/verification.md:44` records focused UI/API/schema, permission/role/type, viral-pairing, TypeScript, lint, build/restart, HTTP, SQLite, and read-only PostgreSQL checks. It also records that the required wrapper could not run. This is credible focused evidence, not exact-candidate release evidence.

#### 2. Local Next build slimming

Owned paths:

- `next.config.ts:3` gates standalone output on `FLUXPOST_STANDALONE_BUILD=1`; `next.config.ts:7` excludes runtime data/media/test artifacts from tracing.
- `Dockerfile:11` enables standalone only for the Docker builder.
- `.trellis/verification/local_build_output_check.mjs` is root-only; `.trellis/verification/vps_deployment_check.mjs` also has associated assertions.

Dependency: port the two configuration hunks together. Do not copy the root `Dockerfile` wholesale because the candidate adds a separate verification stage and runs `.trellis/verification/check.mjs` before building (`.tmp-release-candidate-20260729/Dockerfile:8`). The root file would remove that gate.

Evidence: the task PRD marks default build, Docker mode, tracing exclusions, lint/TypeScript/build, and runtime preservation accepted (`07-15-slim-local-next-build/prd.md:25`), but the task remains `in_progress` and there is no exact-candidate verification record. Treat evidence as focused but not release-grade.

#### 3. Canvas random copy pool

Owned hunks:

- `src/lib/canvas/scheduler.ts:160` samples one unique frozen copy per content task; `src/lib/canvas/scheduler.ts:198` refreshes the pool only for whole-batch resampling; `src/lib/canvas/scheduler.ts:530` enforces capacity and delegates to no-replacement sampling.
- `src/app/canvas/page.tsx` changes operator wording/status for conditional-random copy pools.
- `.trellis/verification/canvas_scheduler_check.mjs:151` checks deterministic sampling, uniqueness, non-mutation, and insufficient capacity; lines 260-286 cover preflight failure, whole-batch refresh, and single-content frozen snapshots.

Dependencies: scheduler, UI wording, and focused assertions must land together. `src/lib/canvas/scheduler.ts` also contains run/retry reliability hunks, while `src/app/canvas/page.tsx` is a 3,160-line shared Canvas surface; both require hunk-level porting.

Evidence: `.trellis/spec/fluxpost/verification.md:43` records scheduler/copy checks, TypeScript, scoped lint, two builds, restart, and HTTP smoke without external calls. The full wrapper was blocked by the then-missing `check.mjs`, so the exact candidate must run the candidate's now-present baseline.

#### 4. Canvas queue concurrency

Owned hunks:

- `src/lib/concurrency.ts:10` adds `WORKER_CANVAS_RUN_CONCURRENCY` with default 8 and cap 20.
- `src/lib/canvas/runs.ts:405` fills missing worker slots with bounded short-lived consumers while retaining claim and heartbeat behavior.
- `.trellis/verification/concurrency_check.mjs:49` and `.trellis/verification/canvas_workflows_check.mjs:408` assert the capped config and worker state.

Dependencies: configuration, worker orchestration, and both checks land together. `src/lib/canvas/runs.ts` also contains a separate stale-error reliability fix, so wholesale copying would silently include more behavior.

Evidence: `.trellis/spec/fluxpost/status.md:38` records focused Canvas/concurrency checks, TypeScript, changed-file lint, and production build. The full wrapper was blocked and the local production restart was deliberately deferred, so the evidence is strong but incomplete for release.

#### 5. Canvas run/retry reliability

Owned hunks:

- `src/lib/canvas/runs.ts:525` clears a prior error when a run remains `running`, preventing stale failure text during provider polling.
- `src/lib/canvas/scheduler.ts:400` orders latest node attempts by execution steps before choosing the retry target, preventing a downstream display failure from hiding the earliest actionable failure.
- The scheduler reconciliation hunk stores child errors only for terminal runs, rather than surfacing transient/nonterminal errors.
- `.trellis/verification/canvas_workflows_check.mjs:410` asserts stale-error clearing; `.trellis/verification/canvas_scheduler_check.mjs:288` asserts execution-order retry selection and the following assertion covers terminal-only error projection.

Dependencies: port the three behavioral hunks with both assertions. These overlap the concurrency and random-copy files, so they should be applied after those groups or reviewed in one combined Canvas diff. No dedicated task artifact names this bundle, making ownership/evidence weaker than for the two adjacent Canvas tasks.

#### 6. VPS deployment wrapper

Root hunks include app-only RAM+swap admission (`scripts/deploy/vps-bootstrap.sh:135`), version-2 wrapper self-preservation (`vps-bootstrap.sh:198`, `vps-deploy.sh:350`), and exact-current-commit pinning when enabling a domain (`vps-enable-domain.sh:49`). Associated changes touch `docs/deployment/ubuntu-docker.md` and `.trellis/verification/vps_deployment_check.mjs`.

The candidate already supersedes this stack:

- Wrapper version 3 in `.tmp-release-candidate-20260729/scripts/deploy/vps-deploy.sh:4`.
- Cross-operation `flock` at candidate deploy lines 165-166.
- Installed `vps-verify-candidate.sh` management at candidate deploy line 362 and bootstrap line 197.
- Candidate-only `scripts/deploy/vps-verify-candidate.sh`.

Copying root scripts wholesale would downgrade v3 to v2 and remove operation locking/candidate verification. Even the useful root domain-pin and low-memory hunks are outside the approved candidate scope and should not be mixed into this release without a separate design review.

#### 7. Feishu/table-id/media and library follow-ups

Independent subgroups are currently mixed in the dirty inventory:

- Table IDs: root-only `src/lib/feishu-table-id.ts:1` strips pasted `?view=`/`&view=` suffixes; `src/lib/config.ts:96` and line 99 apply it to publish/import table IDs. Deterministic assertions exist in `feishu_vehicle_options_check.mjs:77` and `feishu_content_import_check.mjs:32`.
- CLI compatibility: `src/lib/feishu-cli.ts` removes `--format json` from record-upsert/batch-update calls; `feishu_publish_resume_check.mjs:51` asserts the unsupported flag is absent.
- Media upload consolidation: `src/lib/review-image-upload.ts:1` delegates validation/persistence to `runtime-image-upload.ts`; checks exist at `review_desk_workflow_check.mjs:407` and `tos_runtime_media_check.mjs:118`.
- Library role/tag fixes: `src/lib/library-assets.ts:326` introduces an explicit `removeRole` patch; `src/app/library/page.tsx:338` uses it, rejects role-less edits at line 468, and starts tag suggestions unselected at line 514. Checks exist at `library_assets_check.mjs:101` and `vehicle_library_check.mjs:245`.

These are not one dependency unit. Table normalization requires helper + config + two checks; CLI format removal requires the CLI hunk + resume check; review upload consolidation requires the shared runtime upload implementation already present in the codebase + review/TOS checks; role/tag fixes require server/page/check hunks. None is required by the already integrated member-upload queue-id fix. Keep the candidate versions for this release and split follow-ups rather than copying `config.ts`, `feishu-cli.ts`, `library-assets.ts`, or `library/page.tsx` wholesale.

#### 8. Verification/spec-only migration

The root contains broad Trellis platform/spec/verification drift, including generated agent/skill files, archived disabled-harness mirrors, task histories, status/progress changes for excluded work, Python caches, and a wrapper that delegates to an absent `.trellis/verification/check.mjs`. The candidate contains `check.mjs`, candidate release artifacts, and `07-29-integrate-verify-production-release/browser-check.mjs`.

Keep the candidate migration state. Only port focused checks that correspond exactly to selected code hunks, then update candidate facts after fresh verification. Whole-directory copying would reintroduce the missing-wrapper state, overwrite candidate release evidence, and mix excluded task histories.

#### 9. Excluded debug/runtime artifacts

Never copy or stage `.env.local`, any `.env*` secret/config file, `data/`, `public/generated/`, `public/media/`, `.next/`, `test-artifacts/`, `.tmp-*`, task screenshots/browser artifacts, `tsconfig.tsbuildinfo`, `.trellis/.runtime/`, `.trellis/.developer`, or `__pycache__/`. These are local state or generated artifacts under the project boundary rules.

### Safe integration order if scope expands

1. Keep candidate deployment, Docker verification stage, Trellis baseline, shared-library helpers, and member-upload files unchanged.
2. Port Canvas random-copy scheduler/UI/check hunks.
3. Port Canvas concurrency config/worker/check hunks.
4. Decide separately whether the three run/retry reliability hunks are required integration fixes; add their assertions if selected.
5. Run focused Canvas checks, TypeScript, lint, build, browser verification, and the complete candidate baseline on the resulting exact commit.
6. Do not port legacy retirement, local-build slimming, VPS v2, Feishu/media/library follow-ups, or broad spec migration without explicit scope expansion and fresh task-level verification.

## Files Found

- `.trellis/tasks/07-29-integrate-verify-production-release/{prd.md,design.md,implement.md}`: authoritative candidate scope, selective-porting rule, gates, and stop conditions.
- `.trellis/tasks/07-29-integrate-verify-production-release/research/release-evidence.md`: lineage, approved inventory, and known overlap hazards.
- `.trellis/tasks/07-29-{remove-legacy-local-materials,scheduler-random-copy-pool,restore-batch-production-concurrency}/`: ownership and acceptance criteria for three major dirty groups.
- `.trellis/tasks/07-15-slim-local-next-build/`: ownership and focused acceptance evidence for conditional standalone builds.
- `.trellis/spec/fluxpost/{status.md,verification.md,handoff.md,progress.md}`: recent focused verification and known missing-wrapper limitations.
- `src/lib/canvas/{runs.ts,scheduler.ts}`: mixed Canvas concurrency, random-copy, and retry-reliability implementation.
- `scripts/deploy/{vps-bootstrap.sh,vps-deploy.sh,vps-enable-domain.sh}` and candidate `vps-verify-candidate.sh`: conflicting root v2 versus candidate v3 deployment contracts.
- `src/lib/{config.ts,feishu-cli.ts,feishu-table-id.ts,review-image-upload.ts,library-assets.ts}` and `src/app/library/page.tsx`: independent Feishu/media/library follow-up hunks.

## Code Patterns

- Existing-file changes require hunk review; new helpers may be copied only when every export belongs to approved scope (`design.md`, Selective Porting).
- Durable Canvas workers use queue claim + heartbeat + delayed requeue, while provider calls remain bounded by shared pools (`src/lib/canvas/runs.ts:419`).
- Scheduler previews freeze source snapshots; launch/finalization must not reread mutable libraries (`07-29-scheduler-random-copy-pool/design.md`, Data Flow).
- Deployment must preserve exact-SHA identity and candidate verification; candidate v3 serializes deploy/verify operations with a lock (`.tmp-release-candidate-20260729/scripts/deploy/vps-deploy.sh:165`).
- Feishu table-id normalization belongs at the configuration boundary (`src/lib/config.ts:96`), while attachment persistence belongs at the shared runtime upload boundary (`src/lib/review-image-upload.ts:10`).

## External References

- None. This comparison used repository files, task evidence, and filesystem content only; no external documentation or service was consulted.

## Related Specs

- `.trellis/spec/fluxpost/rules.md`: context, evidence, and no-invention rules.
- `.trellis/spec/fluxpost/verification.md`: deterministic baseline and candidate release gates.
- `.trellis/spec/fluxpost/architecture_rules.md`: Canvas snapshots/queues, media boundaries, and exact-SHA deployment.
- `.trellis/spec/fluxpost/pitfalls.md`: dirty-worktree, named-volume, queue, and runtime-media hazards.
- `.trellis/spec/fluxpost/project_brief.md`: source/runtime/deployment boundaries.

## Caveats / Not Found

- `python ./.trellis/scripts/task.py current --source` returned `Current task: (none)`. The coordinating request explicitly supplied `.trellis/tasks/07-29-integrate-verify-production-release`, so this report uses that path; the missing session pointer should be repaired before normal Trellis lifecycle commands.
- The researcher role forbids Git operations. Branch/SHA/divergence/dirty counts came from the coordinating agent; candidate presence was checked through normalized filesystem comparison, not independent Git history inspection.
- No tests were run for this read-only mapping. Evidence assessments describe existing recorded results and executable assertions, not fresh results on candidate `3a8b9e0`.
- Some source files contain mojibake when printed through the current PowerShell encoding. Structural comparisons and ASCII identifiers were still readable, but user-facing Chinese text should be reviewed in a UTF-8-capable editor during hunk porting.
