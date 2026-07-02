# Type Safety

## Shared Types

- Use domain types from `src/lib/types.ts` for content items, generated posts, material entries, simple runs, publish jobs, and shared payload shapes.
- Keep route-local request body shapes explicit near the route handler when they are not shared elsewhere.
- If a new shape crosses API/UI/lib boundaries, add or update a shared type instead of copying object literals across files.

## API Payloads

Route handlers should parse request bodies into explicit TypeScript shapes before validation. Examples:

- `src/app/api/simple/runs/route.ts` parses source mode, keyword/link inputs, and owner attribution before queueing.
- `src/app/api/distribution-check/route.ts` accepts record numbers and prompt text, then queues an owner-scoped job.
- `src/app/api/generate/route.ts` validates source item presence before generating a post.

Return JSON objects with stable top-level fields such as `{ error }`, `{ run }`, `{ job }`, `{ post }`, or `{ entries }`.

## Config Types

- Environment-derived values live in `src/lib/config.ts`.
- Parse booleans, numbers, optional base URLs, and field maps explicitly.
- Do not read secrets into docs, final answers, or Trellis context.

## Validation

- Validate platform names, source modes, required ids, required prompts, and non-empty arrays at API/domain boundaries.
- Return HTTP 400 for invalid caller input, 401 for sign-in requirements, 404 for missing owner-accessible records, and 500 only for unexpected server/provider failures.
- Preserve existing `isWorkspaceSignInError(...)` handling where routes already use it.

## Avoid

- Do not introduce `any` or unchecked casts to bypass contract changes.
- Do not duplicate large request/response types in both frontend and backend files.
- Do not add default values that make invalid payloads look valid. Reject uncertain input clearly.
