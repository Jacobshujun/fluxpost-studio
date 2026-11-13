# Cross-account content-library imports

The local content desk rejects collection into another account's library with “只能采集到当前账号自己的内容库。” Allow every signed-in workspace member to contribute by collection/import into an existing content library.

Acceptance:
- Keyword, link, Feishu and manual ingest share the existing target-access boundary.
- Selected-library projects and items belong to the destination library owner, including when another member imports. Default-library ingest keeps the initiating account owner.
- Recrawl preserves manual edits and existing membership; identical source IDs under different owners remain isolated.
- Show all destination library names and owner display names in the capture selector. Keep this list separate from browsing/management collections and do not expose other owners' existing content/counts/tags.
- Missing targets fail before writes. Library browsing, direct editing, deletion and membership management retain owner/admin boundaries.
- Existing deterministic collection checks and full baseline pass. Deliver the verified commit through the primary-worktree local candidate on port 3001.
