# Layer composition rerun source binding

## Problem
Saved layers identify generated inputs by their previous content URL/hash. A fresh
upstream result makes an unchanged workflow report missing media.

## Acceptance
- Selecting a single-item upstream image/video output binds the layer to that node
  and port, so a later output replaces its media without changing layout or crop.
- Multiple-item outputs stay content-bound; missing, disconnected or ambiguous
  bindings fail explicitly instead of choosing an arbitrary item.
- Existing URL/hash layers remain readable and can be rebound once in the editor.
- Copy/paste remaps bindings when the upstream node is copied with the composition.
- Isolated rerun/render/browser regressions and the complete baseline pass.
- No live model, publishing, runtime-workflow mutation or remote deployment.
