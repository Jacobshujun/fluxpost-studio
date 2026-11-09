# Design

Viewer owns a persistent Dialog, mutation busy state and details-panel visibility. The asset-specific editor is keyed inside that shell, preserving automatic draft/transform resets without remounting the dialog. Shell close and keyboard actions delegate to the active editor's guards.

Requested URL identity is separate from displayed asset. Fetch authorized detail, prepare its original with Image.decode, then commit asset/dimensions together. Attach that decoded element itself to the editor's empty image-surface ref in a layout effect; the effect exclusively manages the child and removes it on cleanup. A separate img with the same src was observed empty for one frame on mobile despite preload. Abort and identity checks discard stale work; failed loads retain the old asset with retry/cancel. Block metadata mutations during transitions while permitting guarded close/history navigation. Measure the new editor stage before paint so initialized natural dimensions do not render at a temporary incorrect fit.

No adjacent prefetch/cache, backend changes or shared preview refactor. Existing mutation APIs and permissions remain authoritative. Retain initial failure retry and native dialog focus behavior.
