# Design

- Versioned composition config in existing Canvas node JSON. Stable media identity
  uses SHA-256 when supplied, otherwise URL; never bind by list position.
- Client-safe geometry/validation module shared by editor and renderers.
- Independent portal editor, applied atomically to graph; local bounded undo history.
- Authenticated metadata inspection materializes through existing media boundary.
- Sharp PNG composition and FFmpeg H.264/AAC composition use actual-byte cache keys,
  staged output, dimension/duration validation, and existing concurrency/storage.
- No database migration, new dependencies, timeline, animation, mixing or template batch.
