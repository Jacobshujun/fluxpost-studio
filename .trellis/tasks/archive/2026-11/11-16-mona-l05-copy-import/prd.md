# Import MONA L05 copies

## Request

Import exactly AI00042 through AI00230 (189 records) from the user-provided Feishu table/view into the local copy library with tag `小鹏MONA L05`.

## Constraints

- Local data operation only; no application code, runtime restart, deployment, or Feishu mutation.
- Preserve source titles and bodies, following existing library whitespace normalization; do not truncate content.
- Use stable source-record-derived IDs to prevent repeating this import; retain distinct source numbers even when their titles and bodies are identical. Preflight found no matching existing copies.
- Reuse the confirmed previous import owner; refuse missing/inactive ownership or non-loopback database targets.
- Keep source snapshots, backups, mapping and receipts in ignored local data; no user content or configuration in tracked artifacts.

## Acceptance

- Every requested number exists exactly once; all 189 titles/bodies meet library limits.
- Each source record maps to a saved, team-visible copy with the requested tag and identical normalized title/body.
- New/updated/unchanged counts and a local receipt are recorded; verify unrelated entries are unchanged.
- Local application remains available on port 3001; no restart is needed for database-backed reads.
