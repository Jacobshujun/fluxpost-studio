# Technical Design

## Boundaries

- `src/lib/tikhub.ts` owns provider-to-`NormalizedSourceItem` title/body semantics.
- `src/lib/openai.ts` owns field-presence-aware text generation and title repair.
- `src/lib/mock-data.ts` owns no-key local generation behavior.
- `src/lib/simple-runs.ts` owns generic image Prompt fallback wording.
- Existing `GeneratedPost.title`/`body` string fields remain compatible; empty strings represent missing generated fields.

## Data Flow

Provider record -> platform-aware title/body extraction -> source item -> `generatePost` presence policy -> persisted draft -> review -> Feishu preflight.

The task keyword/vehicle remains metadata and is not added to ordinary rewrite Prompt context. Explicit user/viral instructions remain authoritative.

## Behavior

- Present title: ask for and validate a title; absent title: force title to empty and skip title repair.
- Present body: ask for and normalize a body without padding missing facts; absent body: force body to empty.
- Both absent: return a draft without calling the text provider and record an actionable `aiNotes` warning.
- Failed title repair returns the normalized original title, never a synthetic vehicle title.
- Text-only publish continues to require both non-empty fields.
