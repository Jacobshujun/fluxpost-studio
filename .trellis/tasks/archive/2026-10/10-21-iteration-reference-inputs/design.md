# Design

## Evidence

- registry.ts defines iteration v1 references as a multiple port. GPT-Image-2 v2 already defines image_1 through image_16 and dynamic visibility in getCanvasVisibleInputPorts.
- CanvasFlowNode consumes that helper and updates handle positions when visible IDs change. Connection controls enforce the multiple property.
- iteration-runtime.ts currently reads only inputs.references into each child iterationInput.references.
- Serialization validates port IDs against the registry. The iteration contract check asserts the old exact list.

## Changes

1. Extend iteration v1 with numbered image ports using Chinese shared-reference labels. Retain references for saved workflows and run snapshots; no data migration.
2. Reuse numbered visibility: through highest connected index plus one, capped at sixteen. Keep images/text visible. Show legacy references only when connected and label its priority.
3. Reuse ordered-input behavior: legacy references first, then image_1 through image_16. Preserve artifact/item order and duplicate URLs.
4. Pass ordered references to each child; keep inner references output, retry guards and fingerprints unchanged.
5. Add concise node guidance about input-group order and legacy priority using existing styling.

## Risks And Boundaries

- Sixteen ports mirror the requested interface, not a new total-image cap.
- Old multi-input order is not guessed or migrated: users can explicitly reconnect to numbered ports.
- Initialize shared constants before registry definitions consume them; verify actual module initialization across registry/iteration cross-imports.
- If runtime gains an import, adapt its isolated loader without mocking away ordering logic.
- No schema, provider payload or deployment changes.

## Rollback

Revert the focused source patch before activation. Once numbered workflows are saved, old code cannot validate their IDs; do not silently downgrade those workflows.
