# Design

Add optional `listSeparator: "line" | "delimiter"` to scalar parameter sources.
Absent means line. It is text-only and is retained on fixed text sources so a
fixed/each mode roundtrip keeps the editor preference. Server normalization
preserves the field; preflight validates it. Task expansion consumes the existing values
array, never splits strings. No schema migration or new endpoint is needed.

Move scalar parsing/formatting into a small Canvas helper for deterministic
testing. Raw UI draft remains separate from parsed values. Changing separator
reparses raw text in the same event. External props reformat stored values using
the persisted separator. Fixed-to-list multiline values select delimiter mode,
avoiding ambiguous serialization even after editing a previously single-line value.
