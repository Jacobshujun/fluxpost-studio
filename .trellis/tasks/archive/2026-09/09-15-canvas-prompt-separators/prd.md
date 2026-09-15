# Multiline Batch Prompts

User approved a text manual-list separator option and a note beside the input.

- Default/legacy lists remain one value per line.
- Text lists can select a standalone `---` delimiter. Preserve internal newlines
  and blank lines; remove delimiter lines and ignore empty blocks.
- Fixed text preserves the whole multiline value.
- Persist the selected separator through save/reopen/preview. Switching the
  separator reparses the visible draft. Switching fixed/each retains formatting.
- Note beside the input explains standalone delimiters and preserved newlines.
- Verify parser, API normalization, expansion/injection and mocked desktop/mobile
  editing and reopen. Full offline baseline required; no real generation.
- User can manually restart the clean committed local candidate after completion.
