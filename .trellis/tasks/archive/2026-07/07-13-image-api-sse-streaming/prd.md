# ComfyUI custom GPT Image API node

## Goal

Provide a reusable ComfyUI custom node that reproduces the useful inputs of the official OpenAI GPT Image 2 partner node while allowing users to supply their own OpenAI-compatible image API URL and API key. Publish the implementation to `Jacobshujun/gpt2-image-API`.

## Background

- FluxPost's existing image module uses the OpenAI Images API contract.
- Text-to-image calls use JSON `POST /images/generations`.
- Calls with reference images use multipart `POST /images/edits`.
- Existing providers may return standard JSON or SSE `data:` events and may expose either base URLs or complete endpoint URLs.
- ComfyUI `IMAGE` values are batched RGB tensors in BHWC layout with float values in `[0, 1]`.

## Requirements

- Deliver an independent custom-node repository that can be copied or cloned into `ComfyUI/custom_nodes`.
- Expose optional `image_1`, `image_2`, `image_3`, and `mask` inputs plus prompt, model, size, custom width/height, background, quality, image count, and seed controls.
- Add editable `api_key` and `request_url` fields. A blank API key must fall back to an environment variable so secrets do not have to be saved in workflow JSON.
- Authenticate with an HTTP bearer token and never log the API key.
- Accept a base API URL or a complete `/images/generations` or `/images/edits` URL and resolve the correct route from whether reference images are supplied.
- Send text-to-image requests as JSON and reference-image/mask requests as multipart form data, following the FluxPost/OpenAI Images API shape.
- Read generated images from `b64_json`, data URLs, or HTTP(S) URLs in JSON responses and SSE `data:` events.
- Return all generated images as one ComfyUI `IMAGE` batch, normalizing differing dimensions when necessary.
- Surface HTTP, API, timeout, malformed-response, invalid-image, mask-without-image, and empty-result failures as actionable node errors.
- Include installation, configuration, security, request-contract, and troubleshooting documentation.
- Include deterministic tests that mock HTTP traffic and do not call production image services.
- Push the completed source to `https://github.com/Jacobshujun/gpt2-image-API` without committing credentials, generated media, or local configuration.

## Out Of Scope

- Modifying FluxPost runtime behavior or configuration.
- Reverse engineering or copying proprietary official ComfyUI partner-node source code.
- Supporting provider-specific protocols that are not OpenAI Images API compatible and cannot be represented by JSON or SSE Images API responses.
- Making a paid/live image-generation call during baseline verification.
- Installing into an unknown local ComfyUI directory as part of this task.

## Acceptance Criteria

- [x] The repository imports successfully in a normal ComfyUI Python environment and registers the custom node.
- [x] The node exposes the requested reference-image, mask, generation, API key, and request URL controls.
- [x] Unit tests prove route selection, JSON generation requests, multipart edit requests, JSON result parsing, SSE result parsing, key redaction, and output image decoding without live services.
- [x] README instructions explain Windows portable and virtual-environment installation and warn that widget API keys are serialized into workflows.
- [x] The repository contains no API key, provider credential, generated image, or FluxPost local data.
- [x] The final commit is available on `Jacobshujun/gpt2-image-API`.

## Notes

- The node is an interoperability implementation based on the documented OpenAI Images API shape already used by FluxPost, not a derivative of the proprietary partner node.
- Verification evidence: 17 mocked/local unit tests passed; plugin registration and BHWC float32 output were verified with `D:\Comfyui\ComfyUI_env\python.exe` using torch `2.8.0+cu128`; remote `main` resolves to `dfd22a27f0212ebe80a73ce900a38c82e3175a92`; the FluxPost Trellis baseline passed on port `45678` without external provider calls.
