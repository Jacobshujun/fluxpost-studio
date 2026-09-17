# Layer composition persistence lifecycle

## Problem
The latest local video-processing run fails its layer composition node with
ENOENT for the rendered MP4. Persistence removes the local file after a verified
TOS upload, but the renderer then tries to read that file for its output digest.

## Requirements
- Return successful PNG/MP4 output metadata when persistence consumes its file.
- Preserve output-byte SHA-256, storage cleanup and existing rendering behavior.
- Diagnose with read-only runtime queries; do not replay user workflows or publish.

## Acceptance
- Existing isolated rendering checks pass for local persistence.
- A consuming-storage regression fails on the old code and passes for PNG and MP4
  after the fix, with SHA-256 matching the bytes handed to storage.
- Full offline baseline passes. Record the cross-layer contract and evidence.

This is a bounded backend fix; no UI, schema or workflow-data changes are needed.
