# Missing batch reference image investigation

## Scope

Explain why the operator-reported local Canvas V2 batch sent only one reference image. This task is diagnostic only: no application changes, runtime writes, retries, provider calls, or listener replacement.

## Acceptance

- Compare the frozen graph with persisted child-node inputs and failures using a read-only local database transaction.
- Identify the image-processing limit and executor behavior responsible for the missing reference.
- Report affected counts, consequences, and repair directions without copying private media, credentials, prompts, or runtime payloads into Trellis.
- Run the existing deterministic baseline and record its result.
