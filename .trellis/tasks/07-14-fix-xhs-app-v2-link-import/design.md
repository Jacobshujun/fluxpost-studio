# Design

## Data flow

TikHub HTTP response -> provider business-envelope validation -> Xiaohongshu App V2 detail normalization -> media cache -> source-link/simple-run workflow.

## Provider paths

- Keep App V2 search on `search_notes`.
- Add App V2 image and video detail path builders. Each builder accepts either a locally extracted `note_id` or the original copied link as `share_text`.
- Use one detail resolver for source-link import and search-result enrichment. Try the image detail contract first and then the video detail contract when the first endpoint fails or returns no usable note.
- When both detail contracts fail, throw one explicit error that preserves endpoint/type context without including authorization data or full provider payloads.

## Business envelope validation

Parse JSON once inside `tikhubRequest`. Reject provider-declared failures before returning payloads to normalizers. Treat explicit `ok: false`, failing nested HTTP-style status values, and non-success top-level business codes as errors while allowing absent envelope fields.

## Compatibility

No changes to public FluxPost request types or UI. Other platform import paths continue to use the same generic request boundary and gain explicit TikHub business-failure handling.

## Rollback

Revert the scoped commit and redeploy the previous release. Runtime database/config volumes are not changed.
