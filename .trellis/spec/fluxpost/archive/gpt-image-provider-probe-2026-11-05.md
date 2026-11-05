# GPT-Image-2 provider format probe — 2026-11-05

Explicitly authorized live diagnostic using the operator-supplied credential file.
Test window: 11:22–11:25 Asia/Shanghai. No application code, configuration,
runtime records, local listener, or deployment changed. Credentials were read
in memory and were not printed or copied into repository context.

## Endpoint and recommendation

Tested provider: `https://zx1.deepwl.net/v1` with model `gpt-image-2`.
Use the existing `openai_json` profile for this provider. This is a small
live sample, not a provider reliability or concurrency acceptance result.

For application configuration, the base URL is `https://zx1.deepwl.net/v1`,
not the complete `/images/generations` endpoint. The application appends
`images/generations` or `images/edits` itself.

## Results

| Request | HTTP | Duration | Result |
| --- | --- | --- | --- |
| Generation, `openai_json` | 200 | 25.795 s | Actual application JSON parser accepted; downloaded PNG, 1024×1536, 963,628 bytes. |
| Generation, `openai_sse` | 200 | 28.918 s | Actual application SSE parser rejected: stream ended before `[DONE]`. Raw response was not retained; final image payload was not independently verified. |
| Edit, `openai_json`, binary `image[]` | 200 | 26.200 s | Actual application JSON parser accepted; downloaded PNG, 1024×1536, 799,112 bytes. Visual inspection confirmed blue circle changed to red. |
| Edit, `openai_sse`, `input_fidelity=high` | 400 | 4.806 s | `invalid_input_fidelity_model`: provider says this model does not support `input_fidelity`. |
| Edit, `openai_sse`, no `input_fidelity` | 200 | 23.963 s | Image present and independently decoded offline: PNG, 1024×1536, 813,349 bytes. Application SSE parser rejects missing `[DONE]`; event/type is `image_edit.completed`, while current decoder handles `image_generation.completed`. |

Exactly five provider POSTs were made. No automatic provider retries or backup
route calls were used. Edit probes used an artificial local blue-circle PNG,
not user materials. JSON response URLs were downloaded without forwarding
the API credential. Image dimensions/format were verified with Sharp.
Initial generation probes inherited disabled TLS verification from the host
environment; all three subsequent edit probes explicitly enabled TLS verification.

## Successful request shape

Generation: `POST /v1/images/generations`, JSON:

```json
{
  "model": "gpt-image-2",
  "prompt": "Create a simple flat illustration of one blue circle centered on a plain white background. No text.",
  "n": 1,
  "size": "1024x1536",
  "quality": "medium"
}
```

Edit: `POST /v1/images/edits`, multipart fields `model`, `prompt`, `n`,
`size`, `quality` with those same model/count/size/quality values and binary
PNG field `image[]`. Prompt: change the blue circle to red, preserving the
white background. Let the HTTP client generate the multipart boundary.

Neither successful format supplied `stream`, `response_format`,
`output_format`, or `input_fidelity`. Responses used JSON `data[].url`.
Bodies match `buildOpenAiJsonGenerationBody` and `buildOpenAiJsonRequest`
in the current application. SSE request fields match
`buildStandardImagesApiRequest`; response decoding used the existing
`decodeOpenAiImageSseChunks` directly. This was a direct provider test,
not an authenticated application workflow or persistence acceptance.

## Evidence and verification

Ignored local artifacts: `data/gpt-image-probe/` contains probe script,
five sanitized JSON summaries, generated PNGs, edit SSE responses, and
`baseline.log`. These are local test artifacts, not committed context.

Existing deterministic baseline passed:

```powershell
$env:TRELLIS_SMOKE_PORT = '45678'
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```

The baseline used the isolated smoke port and did not call this provider.
No global feature acceptance state changed.

## Follow-up: GPT-Image-2.5 model support

The operator explicitly requested testing 2.5 model support. Follow-up window:
11:54–11:57 Asia/Shanghai. Same supplied endpoint and credential; TLS
verification enabled for every follow-up request. No application code,
configuration, runtime records, or listener changed.

`GET /v1/models` returned HTTP 200 with five IDs: `gpt-image-2`,
`gpt-image-2.5-flare`, `gpt-image-2.5-sunburst`, `gpt-image-2.6-flare`, and
`gpt-image-2.6-sunburst`. The list is provider-advertised availability;
2.6 models were not generation-tested.

Exactly three additional provider POSTs were made, without automatic retries:

| Model and request | HTTP | Duration | Verified image |
| --- | --- | --- | --- |
| `gpt-image-2.5-sunburst`, JSON generation | 200 | 13.773 s | PNG, 1024×1536, 960,565 bytes |
| `gpt-image-2.5-flare`, JSON generation | 200 | 13.382 s | PNG, 1024×1536, 976,334 bytes |
| `gpt-image-2.5-sunburst`, multipart reference edit | 200 | 56.111 s | PNG, 1024×1536, 936,582 bytes; visual inspection confirmed blue circle changed to red |

All three responses passed the existing application JSON response parser and
returned downloadable `data[].url` images, validated with Sharp. The request
fields were identical to the earlier successful JSON generation/multipart
edit requests except for the model ID: `n=1`, `size=1024x1536`,
`quality=medium`, no streaming or extra format/fidelity parameters.

Recommendation: node model may be `gpt-image-2.5-sunburst` (also verified
with a reference) or `gpt-image-2.5-flare` (generation verified), with
channel profile `openai_json`, node ToAPIs format inherited/ignored,
ratio 2:3, resolution 1K, medium quality, count 1, default background, PNG.
The current application JSON size guard still rejects 1536×2048 (3:4/2K),
regardless of model. At this stage provider 2K/3:4 support, multiple
references, VIP/Official IDs, and actual backend model identity were
unverified; see the later size test below.

Local follow-up summaries and images are in the same ignored artifact
directory, with names containing `gpt-image-2.5`; model listing is
`models.json`, and the follow-up baseline log is `model25-baseline.log`.
The initial follow-up baseline exposed this report's earlier status entry
exceeding the typical context budget by 280 bytes. Compressing that newly
added status entry restored the budget without changing its limit or
unrelated status entries.
The full existing deterministic baseline then passed, including the context
budget, offline contracts, lint, TypeScript, isolated HTTP smoke, and SQLite
store checks. Secret-content scan of the report, summaries, script, and logs
found no supplied credential.

## Follow-up: 3:4 / 2K with GPT-Image-2.5 Sunburst

Explicit operator request to test 3:4 / 2K. Test window: 12:01–12:02
Asia/Shanghai. Exactly two additional POSTs used the same supplied endpoint
and credential with TLS verification enabled; no retries or failover.

Both used `model=gpt-image-2.5-sunburst`, `size=1536x2048`, `quality=medium`,
`n=1`, and non-stream JSON responses. Generation sent a JSON body to
`/v1/images/generations`; edit sent multipart to `/v1/images/edits` with a
1536×2048 artificial blue-circle PNG in `image[]`.

| Request | HTTP | Duration | Actual downloaded output |
| --- | --- | --- | --- |
| Generation | 200 | 14.633 s | PNG, **1536×2048**, 1,640,361 bytes |
| Reference edit | 200 | 16.491 s | PNG, **1536×2048**, 1,331,870 bytes |

Both responses passed the application's existing JSON response parser.
Sharp confirmed the actual output dimensions exactly matched the request;
no resizing was performed. Visual inspection of the edit output confirmed
the blue circle became red.

The standalone probe changed only the requested `size` from the successful
1K request and bypassed the **application request-builder size guard**.
The application itself was not changed: `assertOpenAiJsonSize` still allows
only `auto`, `1024x1024`, `1024x1536`, and `1536x1024`. Therefore this test
establishes provider support for non-stream 3:4 / 2K generation and editing,
but the current Canvas node cannot submit that size using `openai_json`
until a separately scoped application change is made. No provider-specific
compatibility branches, configuration, or listener changes were added.

The later authorized `11-05-image-size-validation` implementation removes
that JSON allow-list and the legacy 4K ratio block. Earlier statements above
describe the application at the time of the direct provider tests.

Ignored local summaries/images contain `gpt-image-2.5-sunburst-1536x2048`
in their filenames. The deterministic baseline log for this test is
`data/gpt-image-probe/model25-3x4-2k-baseline.log`.
The full existing deterministic baseline passed. `git diff --check` passed;
the report, local JSON summaries, script, and logs contained no supplied key.
