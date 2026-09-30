# Save Canvas images to a local directory

Approved by the user on 2026-09-30, including implementation, commit and local activation.

Extend utility.save-images@1 with optional outputFolder. Nonempty folders trigger automatic server-side saving on node execution. Absolute paths and project-relative paths are supported; missing directories are created. Empty/missing folders preserve browser download behavior. Preserve bytes/real extension, prefix numbering, no overwrite, concurrent collision safety, 30 images and 30 MB per image. Display actual folder, counts and errors alongside browser downloads. Local environment enablement follows the existing directory feature. No new HTTP API/table, caption files, conversion or remote release.

Acceptance: isolated filesystem checks cover paths, collisions, failures/retry and unchanged bytes; workflow configuration round-trips and batch snapshots retain the folder; desktop/mobile mocked browser checks pass; full baseline passes or an unchanged blocker is documented. Commit verified changes before the primary-worktree clean-HEAD port-3001 activation.
