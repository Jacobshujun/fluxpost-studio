# Requested Feishu copy synchronization

Runtime data operation only: synchronize the user's attached list into the local
copy library, using the already authorized Feishu bot identity and configured Base.

- Read exact requested record numbers, titles, bodies and vehicle fields.
- Reuse identical team-visible entries and merge vehicle tags; preserve old content.
- New entries are team-visible, with the same owner as the preceding import.
- Do not silently truncate content or invent missing fields.
- Verify saved titles, bodies, tags and visibility after committing local writes.
- Keep all source records, identifiers and import reports under ignored `data/`.
- No application code changes, remote writes, publishing or restart required.

Acceptance: every requested number has a verified result or an explicit exception.
