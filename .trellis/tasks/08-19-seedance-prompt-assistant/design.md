# Design

## Architecture

- `src/lib/canvas/seedance-prompt-assistant.ts` owns the shared request/response contract, request normalization, skill policy prompt, provider response decoding, and deterministic candidate audit.
- `src/app/api/canvas/seedance/prompt-assist/route.ts` stays thin: authenticate, parse JSON, invoke the domain service with existing OpenAI text/vision helpers, and map input/auth errors to status codes.
- `src/app/canvas/page.tsx` owns the route-local assistant UI and serializes structured prompt parts through `seedanceMentionMarker(...)` before patching the selected node.
- `src/app/globals.css` extends the existing Seedance inspector styles with a compact unframed tool panel and candidate list.

## Data Flow

```text
Seedance node config/references + operator brief
  -> authenticated route
  -> normalized assistant input
  -> versioned Seedance skill policy
  -> text or vision model
  -> strict JSON decode
  -> deterministic audit
  -> two candidates
  -> explicit client apply
  -> existing prompt document + mention bindings
```

## Contract

- Prompt parts are a discriminated union: `{ type: "text", value }` or `{ type: "image", referenceId }`.
- Reference inputs contain stable id, display number, URL, and optional name. URLs are used for model vision only; model output must point back by id.
- Deterministic checks are computed by FluxPost and never trusted from model output.
- The provider is asked for JSON only. Fenced JSON is accepted, but malformed or incomplete responses fail explicitly.

## Compatibility And Rollback

- No database or graph schema migration is required. Assistant state is ephemeral; applied output uses existing Seedance config fields.
- Existing local/external prompt exclusivity remains unchanged. Applying a candidate writes a local prompt and removes no edges; the UI must block apply when an upstream prompt connection exists.
- Rollback consists of removing the assistant UI/route/domain module; existing Seedance nodes remain valid.
