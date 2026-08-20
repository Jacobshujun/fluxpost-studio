# Design

## Policy Boundary

Add a pure shared body-policy module with target `800`, maximum `1000`, policy version `1`, Unicode code-point counting, manual clamping, sentence-aware truncation, and previous-record-aware policy application.

AI-facing modules add the common target instruction. A shared model-assisted normalizer performs at most one JSON compression call only when the initial body exceeds 1,000, then delegates to deterministic truncation. Canvas composition delegates directly to deterministic truncation because it can combine manual inputs.

## Persistence And Compatibility

`GeneratedPost` and `CopyLibraryEntry` gain optional `bodyPolicyVersion?: 1`. New records are governed. Existing governed records stay governed. Existing unmarked records remain unmarked while their normalized body is unchanged; the first body change applies the policy and marker.

Generated and runtime post stores apply the same helper. Callers that maintain run snapshots use the normalized returned post. Existing JSON/JSONB persistence requires no SQL migration.

## Publishing And UI

Review and copy-library inputs use the shared code-point clamp and display `current/1000`. An unchanged legacy body can remain over limit until the operator changes that body. Feishu text/full validation rejects only marked over-limit posts, preserving explicit historical exemption.

## Failure Behavior

AI compression errors are non-fatal: deterministic sentence-aware truncation guarantees the hard limit. Empty bodies retain existing validation behavior. No retry loops or silent provider polling are introduced.
