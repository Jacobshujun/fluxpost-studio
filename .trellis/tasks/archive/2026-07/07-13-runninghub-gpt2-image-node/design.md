# Design: RunningHub GPT2 Image Node

## Boundary

The implementation lives in the separate `gpt2-image-run` repository. It does not change FluxPost or the previously published OpenAI-compatible node.

## Package Shape

```text
gpt2-image-run/
  __init__.py
  gpt2_image_run/
    api_client.py
    image_utils.py
    nodes.py
  tests/
  README.md
  requirements.txt
```

## Data Flow

```text
ComfyUI widgets
  -> normalize prompt, URL list, enums, API key and endpoint
  -> POST RunningHub JSON with Bearer auth
  -> validate HTTP and RunningHub status
  -> extract results[].url
  -> download image bytes without auth forwarding
  -> decode/normalize RGB BHWC float32 batch
  -> ComfyUI IMAGE
```

## Input Contract

- `image_urls` accepts a JSON array or one URL per line. Empty entries are removed and order is preserved.
- Every source URL must be absolute HTTP(S). The value is sent only in the request body and is excluded from diagnostic messages.
- `seed` changes ComfyUI cache behavior but is not sent because it is absent from the supplied RunningHub contract.
- `request_url` must be an absolute HTTP(S) URL and defaults to the exact supplied endpoint.

## Response Contract

- HTTP non-2xx is a request failure. HTTP 524 becomes a concise RunningHub upstream-timeout diagnostic.
- HTTP 2xx still requires a JSON object with `status="SUCCESS"`.
- `results` must contain at least one absolute HTTP(S) URL.
- Result downloads never inherit the RunningHub Authorization header, preventing credential disclosure to Tencent COS or another output host.
- All returned images are decoded as RGB. Images after the first are resized to the first image's dimensions before batching.

## Security

- API key lookup order: widget value, then `RUNNINGHUB_API_KEY`.
- Exceptions redact exact API keys and Bearer values.
- Source/output URLs are not included in errors because they may contain signed query parameters.
- Tests use only `example.test` URLs and in-memory PNGs.

## Compatibility And Rollback

Use legacy ComfyUI `NODE_CLASS_MAPPINGS` registration for compatibility with the user's ComfyUI 0.24.1 runtime. Removing the plugin directory and restarting ComfyUI fully rolls back the node.
