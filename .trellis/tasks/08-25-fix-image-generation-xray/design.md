# Design

## Boundaries

- Add an image-only transport module backed by Undici `ProxyAgent`; the proxy URI is explicit app configuration and defaults to loopback port 10808.
- Keep all image HTTP operations behind the existing `fetchWithTimeout` boundary so provider profiles and accepted-task semantics remain unchanged.
- Represent an unavailable image network as a typed retryable error. Canvas node execution persists that node as running with a wait reason; the existing durable run queue requeues it after 30 seconds.
- Add a read-only admin endpoint for health. It checks the local proxy TCP listener and performs bounded credential-free HEAD requests to configured route origins through the image dispatcher.

## Data And Compatibility

- Add `OPENAI_IMAGE_PROXY_URL`; absence resolves to `http://127.0.0.1:10808`. An explicit empty value disables the proxy only if represented by a documented sentinel; normal configuration stays proxied.
- Add optional `waitReason` to Canvas node/run response state without a database migration because Canvas state is persisted as JSONB/JSON.
- Existing runs with provider task ids retain current recovery behavior. Existing runs without the new field load unchanged.

## Failure Rules

- Connection refusal, connect timeout, DNS failure, reset before response, and proxy failure before provider acceptance become image-network unavailable.
- HTTP responses are provider responses and retain current terminal/retry/failover rules.
- Ambiguous post-submission failures without a provider task id are not silently replayed beyond the existing provider attempt contract.
- Health checks never include authorization or request bodies and never call generation endpoints.

## Operations

- Keep one scheduled task invoking the valid v2rayN executable at interactive logon with highest privileges and restart-on-failure settings.
- Rollback is the feature commit plus restoration of the prior scheduled-task XML if necessary; secrets and v2rayN node configuration are never added to Git.
