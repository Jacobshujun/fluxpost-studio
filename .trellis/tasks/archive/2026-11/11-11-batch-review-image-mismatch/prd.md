# Batch review image mismatch diagnosis

## Scope

Explain the operator-reported image mismatch in the local V2 batch ending in
`20261111-115020`, using frozen schedule, node execution, and review records.
Application changes, task mutation, provider replay, and publishing are outside
this diagnostic scope.

## Acceptance

- Trace selected parameters through child execution and final composition.
- Compare both generated-post image arrays with their original projections.
- Inspect the saved image bytes to distinguish image selection from display order.
- Explain confirmed causes and identify a suitable correction direction.
- Run the documented deterministic baseline and preserve bounded evidence.
