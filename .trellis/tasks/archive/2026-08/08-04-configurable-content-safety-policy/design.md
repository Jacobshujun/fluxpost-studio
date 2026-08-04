# Configurable content safety policy design

## Domain And Storage

- Add a `ContentSafetyPolicy` domain with revision metadata, categories, ordered local rules, and model settings. Persist one normalized JSON document under `content_safety_policy_v1` in `app_meta`.
- Use the shipped default when the row or a historical task snapshot is absent. Saving and reset increment the revision and stamp the administrator.
- Validate unique ids, references, match groups, scopes, actions, prompt requirements, and `0 <= reviewThreshold < filterThreshold <= 100`. Bound category/rule/term/prompt/sample sizes.

## Evaluation

- Normalize candidate text case-insensitively and remove whitespace, matching substrings without regex.
- Evaluate enabled rules in array order; condition groups are AND-ed and each group applies `any`, `all`, or `at_least` to its terms.
- Preserve the current `SourceSafetyAssessment` contract and add optional `riskScore`, `matchedRuleId`, and `policyRevision`; categories become configured string ids.
- The server appends an immutable JSON schema/category appendix to the administrator prompt. Unknown categories are dropped and an invalid score/output is a model failure.

## API And UI

- `GET|PUT /api/content-safety-policy` reads or replaces the whole policy; PUT requires admin plus `expectedRevision`.
- `POST /api/content-safety-policy/test` validates a draft and evaluates a sample; `runModel` is explicit and admin-only. `POST /api/content-safety-policy/reset` restores defaults.
- `/config` loads the policy beside the existing advanced snapshot and renders a special database-backed `content-safety` navigation panel. Policy saves do not submit or rewrite `.env.local` fields.

## Workflow Snapshots

- Simple runs store the normalized policy on `SimpleRun` at creation and reconstruct it from the run in the worker.
- Advanced crawl jobs store the policy on `CrawlJob` before provider work. Link-import routes pass one request-start snapshot into domain logic.
- Execution logs include policy revision, matched rule id, counts, thresholds, and actor metadata only.

## Compatibility And Rollback

- No database schema migration. Existing stored items and jobs remain readable because new fields are optional.
- Rollback is code-only: old releases ignore the extra JSON fields and `app_meta` key. The policy row can remain in place.
