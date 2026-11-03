# Design

PATCH /api/content/items accepts manualEdit=true and changed fields. Server-owned manualEditedFields tracks title/contentText/images; recrawl and raw Douyin repair preserve those fields. Image replacement resets stale downloads and media references, remaps visual tags by URL, preserves video/frame references. Upload endpoint authenticates and checks source ownership before saveRuntimeImageUpload in content-uploads. Existing source IDs/owners/raw and generated posts stay unchanged.

Present title/body and full image gallery first, metadata below. Stage edits/uploads until explicit save, guard sample/filter/navigation changes, retain drafts on failure. Use existing runtime storage and isolated SQLite/browser fixtures. No new tables, no paid providers, no production changes. Commit verified tree before managed 3001 activation, preserving current binding.
