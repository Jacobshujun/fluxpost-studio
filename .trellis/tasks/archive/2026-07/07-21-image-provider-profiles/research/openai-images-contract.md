# OpenAI Images Contract Research

Source checked on 2026-07-21: https://developers.openai.com/api/docs/guides/image-generation

- The official GPT Image generation example uses `POST /v1/images/generations` with JSON `model` and `prompt`, and reads `data[0].b64_json`.
- The official edit examples use `POST /v1/images/edits` with multipart model, prompt, and input images.
- Streaming is optional and demonstrated separately with `stream: true`; it is not required for ordinary JSON generation.
- The guide states that `gpt-image-2` must omit `input_fidelity` because the model always processes image inputs at high fidelity.
- Therefore FluxPost's official profile must be non-streaming and minimal. Relay-specific streaming and asynchronous fields remain isolated in separate profiles.
