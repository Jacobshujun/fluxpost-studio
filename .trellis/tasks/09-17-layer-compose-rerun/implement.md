# Implementation

1. Extend shared source contract and annotate editor/runtime input boundaries.
2. Save bindings from editor selections, preserve replacement crop, remap copies.
3. Add isolated tests for changed media URLs/bytes, ambiguous/disconnected inputs,
   same-content separate upstream nodes, legacy config and clipboard persistence.
4. Run layer composition focused and mocked browser checks plus full baseline.
5. Record verified contract/evidence, commit the fix and activate the clean local
   candidate if no active operator work would be interrupted.
