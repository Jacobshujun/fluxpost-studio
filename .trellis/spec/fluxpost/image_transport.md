# Image Transport Contract

## 1. Scope / Trigger

- Applies to every remote HTTP request owned by `src/lib/image-generation.ts`: provider submission, reference upload/download, ToAPIs status query, and generated-result download.
- Does not apply to text models, Feishu, databases, ComfyUI, or loopback image URLs.

## 2. Signatures

- `fetchImageTransport(url, init?)`: image-only fetch using the explicit proxy dispatcher for non-loopback URLs.
- `checkImageTransportHealth(timeoutMs?)`: free proxy listener plus credential-free route-origin HEAD checks.
- `GET /api/config/image-transport-health`: admin-only `{ health }` response; returns `503` when the transport is unhealthy.

## 3. Contracts

- Windows default: `OPENAI_IMAGE_PROXY_URL=http://127.0.0.1:10808`; non-Windows has no implicit local proxy.
- Proxy URLs must use HTTP(S), contain no credentials, and never disable TLS certificate verification.
- Do not inherit Windows system proxy settings, `HTTP_PROXY`, `HTTPS_PROXY`, or `NODE_USE_ENV_PROXY` for image traffic.
- Network-unavailable Canvas image nodes remain `running`, persist `waitReason="等待图片网络恢复"`, and requeue the same run after 30 seconds.
- A persisted ToAPIs task id is resumed with status GET requests only; never submit a replacement POST automatically.

## 4. Validation & Error Matrix

- Proxy listener refused, DNS failure, connect/reset/socket timeout -> typed retryable image-network error; Canvas waits.
- HTTP provider response, invalid parameters, safety rejection, authentication rejection, or explicit terminal provider status -> existing provider policy; no network-wait conversion.
- Missing admin session -> `401`; non-admin health request -> `403`; unhealthy transport -> `503` with credential-free health state.
- Primary/backup origins equal, or either configured route is unreachable -> health `ok=false`.

## 5. Good / Base / Bad Cases

- Good: remote provider traffic crosses Xray, accepted task ids resume, and a temporary outage preserves completed upstream nodes.
- Base: `localhost`, `127.0.0.0/8`, and `::1` image URLs fetch directly; text and ComfyUI modules do not import image transport.
- Bad: global proxy environment variables route unrelated integrations, TLS validation is disabled, or an accepted task is resubmitted after a network failure.

## 6. Tests Required

- `.trellis/verification/image_transport_check.mjs`: explicit proxy usage, loopback bypass, closed-port classification, free health checks, Canvas wait/requeue, and text/ComfyUI isolation.
- `.trellis/verification/toapis_image_api_check.mjs`: accepted task GET-only resume.
- Canvas focused checks plus the complete offline baseline must pass without provider credentials or paid calls.

## 7. Wrong vs Correct

Wrong:

```typescript
await fetch(providerUrl); // depends on ambient machine proxy state
```

Correct:

```typescript
await fetchImageTransport(providerUrl, request);
```
