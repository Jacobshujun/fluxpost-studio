# Implementation Plan

1. Inspect the destination GitHub repository and preserve any existing project history or files.
2. Add the isolated ComfyUI registration module, request client, and tensor/image conversion helpers.
3. Add mocked unit tests for URL selection, request modes, JSON/SSE decoding, authentication behavior, and image conversion.
4. Add Windows-focused installation and usage documentation, including the workflow-secret warning.
5. Run Python unit tests and syntax compilation without calling external image services.
6. Review the destination repository for credentials and generated artifacts.
7. Commit and push to `Jacobshujun/gpt2-image-API`.
8. Run the FluxPost Trellis baseline only if the parent repository changed beyond task artifacts; otherwise validate task artifacts and record the isolated external-repository checks.

## Risk Points

- Provider response formats vary. Parsing must be strict enough to avoid treating arbitrary strings as images while supporting standard JSON and SSE envelopes.
- ComfyUI may not be importable in the test environment. Keep pure request/response helpers testable independently and use minimal dependency stubs only at the registration boundary.
- Widget API keys are persisted by ComfyUI. Preserve the requested field but document environment-variable use as the safe default.
- Never overwrite remote history. Inspect and pull before committing; push only a fast-forward commit.

## Validation

```powershell
python -m unittest discover -s tests -v
python -m compileall -q .
git status --short
git diff --check
```

No validation step may call a paid image-generation endpoint.
