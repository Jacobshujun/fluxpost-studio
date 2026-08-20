# Implementation Plan

1. Add shared body-policy constants, Unicode helpers, historical transition logic, and model-assisted final-body normalization.
2. Add policy metadata to public types and enforce it at generated/runtime/copy-library persistence boundaries.
3. Apply the 800-character instruction and one-repair normalization to finished-body AI producers; apply deterministic truncation to Canvas composition.
4. Update review and copy-library editors with Unicode clamping and counters; add Feishu text/full preflight validation.
5. Add and register a deterministic focused check covering policy, persistence compatibility, UI wiring, Canvas, generation, and publishing.
6. Run the focused check and `$env:TRELLIS_SMOKE_PORT = "45678"; powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1`.
7. Update Trellis status/evidence only from verified results, then commit the scoped task.

## Rollback

The change is additive JSON metadata plus application validation. Rollback removes the policy code and optional fields; existing version markers remain harmless unknown JSON properties to older code.
