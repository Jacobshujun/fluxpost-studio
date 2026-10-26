# Qwen Node Design

## Provider And UI

- Register `model.qwen-image` in Canvas types, registry and executors. Reuse image artifacts, preview and downstream save/review.
- Add a separate native adapter instead of changing GPT image-generation behavior. No Qwen settings in appConfig or Advanced Configuration.
- Node controls: full endpoint, password editor with save/replace/remove, local prompt and prompt extension. Document deterministic composition of local/upstream text.
- One synchronous request; no polling, automatic retry or unsupported GPT fields. Confirm successful response shape in official documentation, validate images and persist through existing runtime storage. Honor cancellation.

## Proposed Credential Lifecycle

- No keys, ciphertext or bearer-capable references in graph config. Preserve `stripCanvasConfigSecrets`.
- Separate server-side credential storage keyed by workflow owner, workflow ID and node identity, including unambiguous iteration child identity. Save workflow before credentials.
- Authenticated routes set/remove credentials and return only configured state. Resolve authoritative workflow/node ownership server-side. Executors use trusted workflow/run identity, not caller-provided owner IDs.
- Encrypt values via existing metadata adapters for SQLite/PostgreSQL. Automatically initialize a server runtime encryption key outside Git and Advanced Configuration. Initialization is exclusive across workers; missing/corrupt keys fail explicitly, never overwrite existing encrypted data. Do not reuse Dongchedi's provider-specific key. POSIX permissions are restricted; Windows uses the runtime directory's inherited ACL, which operators must protect.
- Back up the runtime encryption key with data; losing it requires key re-entry.
- Bind credentials to validated endpoints. Endpoint changes require explicit key re-entry. Require HTTPS without embedded credentials/query/fragment; reject placeholders and redirects. Confirm supported Aliyun hosts to prevent private-network requests and credential forwarding.
- Imports, templates and copied/shared workflows do not inherit credentials. Queued runs must match frozen endpoint bindings. Rotation uses the latest authorized key for that endpoint; deletion/mismatch requires configuration.
- Redact safe error messages; never log raw headers/bodies. Image downloads never receive the provider Bearer header.

## Expected Changes

- Canvas types/registry/executors/iteration and node controls in `src/app/canvas/page.tsx` or a focused component.
- New Qwen contract/provider, node credential service/routes, and additive database storage using existing SQLite/PostgreSQL migration conventions.
- Run/scheduler identity propagation only where needed; no broad refactor.
- Deterministic provider/credential/export tests and mocked browser tests under `.trellis/verification/`; preserve pending OSS baseline edits.

## Compatibility

Existing GPT versions/settings stay unchanged. No graph migration for existing nodes. Keep port 3001 untouched. Rollback must not delete runtime keys or user data without explicit approval.

## Confirmed Tutorial And Reuse Refinement

- Implement ordered 0-3 references, one text part after image parts, native synchronous response output.choices[].message.content[].image. Use direct prompt extension, never agent for I2I.
- Reference input limits: <=10MB, 1-8000px each side, aspect <=10:1. Validate local/public/data images before constructing inline data; no silent resize.
- Reuse existing readAppMetaValue/writeAppMetaValue for encrypted records in SQLite/PostgreSQL; no new schema is needed. Namespaced keys are not exposed by graph APIs. Encryption master key stays in runtime data with a stored fingerprint detecting loss/replacement.
