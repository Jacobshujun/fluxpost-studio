# Design: ComfyUI custom GPT Image API node

## Boundary

The deliverable lives in the separate `gpt2-image-API` repository. FluxPost is used only as the confirmed request-contract reference and is not modified.

## Package Shape

```text
gpt2-image-API/
  __init__.py
  gpt2_image_api/
    nodes.py
    api_client.py
    image_utils.py
  requirements.txt
  README.md
  tests/
```

`nodes.py` owns the ComfyUI schema and tensor boundary. `api_client.py` owns URL resolution, request construction, HTTP execution, JSON/SSE parsing, and error normalization. `image_utils.py` owns tensor-to-PNG and returned-image-to-tensor conversion. Keeping the HTTP and image boundaries separate allows tests to run with lightweight stubs when ComfyUI's full runtime is unavailable.

## Data Flow

```text
ComfyUI widgets/sockets
  -> validate and normalize node inputs
  -> encode optional IMAGE/MASK tensors as PNG
  -> choose generations or edits URL
  -> JSON or multipart HTTP request with Bearer auth
  -> JSON/SSE event extraction
  -> decode base64/data URL or download HTTP image
  -> RGB float32 BHWC batch
  -> ComfyUI IMAGE output
```

## URL Contract

- A URL ending at a version/base path receives `/images/generations` or `/images/edits`.
- A URL ending in either Images API endpoint is switched to the route required by current inputs.
- Query strings are preserved.
- Other full paths are treated as explicit custom endpoints and left unchanged, allowing gateway-specific routing.

## Request Contract

- Generation: JSON fields `model`, `prompt`, `n`, `size`, `quality`, `background`, `output_format=png`, and `response_format=b64_json`.
- Edit: equivalent multipart fields plus up to three repeated `image` files and optional `mask` PNG.
- Custom width/height are serialized as `<width>x<height>` when size is `custom`.
- `seed` participates in ComfyUI cache invalidation. It is not sent because the OpenAI Images API contract does not define it.

## Response Contract

The decoder accepts standard `{data: [{b64_json|url}]}` JSON and scans JSON objects from SSE `data:` events. It also recognizes common nested image result containers without accepting arbitrary non-image strings. Remote image downloads use the same timeout and bounded response-size policy as API requests.

## Security

- `api_key` is never included in exception text or logs.
- Blank widget value reads `GPT_IMAGE_API_KEY`, then `OPENAI_IMAGE_API_KEY`, then `OPENAI_API_KEY`.
- Documentation states that a nonblank widget key is serialized in ComfyUI workflow JSON and recommends environment variables for shared workflows.
- No live API is used by automated tests.

## Compatibility

The implementation targets modern ComfyUI legacy custom-node registration (`NODE_CLASS_MAPPINGS`) and standard Python dependencies already present in ComfyUI. It does not depend on FluxPost or its Node.js runtime.

## Rollback

The plugin is isolated. Removing its directory from `custom_nodes` and restarting ComfyUI fully rolls it back.
