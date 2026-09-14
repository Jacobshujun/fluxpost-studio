# Design

Apply the ordinary 2.5 request shape only to the exact flare/sunburst model names on the existing ToAPIs async adapter. Keep the older ToAPIs shape within the older-model branch; VIP and Official are separate contracts outside this change. Preserve submission/task ID/polling behavior. Reject unsupported multi-output ordinary 2.5 requests before reference upload with a non-retryable input error.

Remove provider-specific 4K restrictions from generic UI/selection validation. Keep the historical restriction scoped to older ToAPIs requests. Use documented pixel examples for 1:1, 3:2, 2:3, 16:9 and 9:16. Other pixel-route ratios use the same explicit tier budget with 16-pixel alignment and a 3840 edge cap. ToAPIs still receives ratio/tier and makes its own output-size decision.

Ordinary 2.5 requests omit undocumented output fields and persist returned bytes without format conversion; output-format/compression selections have no provider effect on this adapter. Preserve selected background through normalization, but forward transparent only on ordinary 2.5; other routes retain existing behavior. Reject transparent+JPEG selections explicitly.
