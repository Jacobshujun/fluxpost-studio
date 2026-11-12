# Design

The importer already extracts all eight tokens. Every CLI call downloads one file into a shared directory with `--overwrite`; the actual record has eight files named asset.png. Each call overwrites the previous file before enumeration/persistence. Runtime has two matching imported items with one image each.

Keep the task directory, add a hashed record directory and a hashed attachment directory. Download each token into its own existing directory and enumerate only that token's files. Accumulate token results in the original field order, never enumerate/sort the whole task directory. This excludes obsolete attachments and separates records sharing a displayed number. Preserve public extension/name inside the token directory. Empty or unsupported downloads fail explicitly for that token.

Test the real importer with mocked CLI identity/exec and object storage, real isolated filesystem and a shared filename. Exercise actual token extraction, CLI args, persistence, ordering and failure paths. No database/provider calls in tests. Existing importer consumers need no contract changes.
