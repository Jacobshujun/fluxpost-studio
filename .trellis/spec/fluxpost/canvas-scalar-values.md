# Canvas Scalar Values

## Scope

Canvas batch text parameters support multiline prompts without treating each
line as a task. This is editor syntax; the scheduler still consumes values arrays.

## Signatures

- `CanvasScheduleParameterSource` fixed/manual-list branches accept optional
  `listSeparator: "line" | "delimiter"` for text parameters.
- `src/lib/canvas/scalar-values.ts` exports `parseCanvasScheduleScalarValues`
  and `formatCanvasScheduleScalarValues` for the editor and deterministic checks.
- Existing schedule PATCH save/preflight routes remain unchanged.

## Contract

- Missing separator means legacy line splitting. Explicit line mode trims and
  removes empty lines. Non-text scalar parsing is unchanged.
- Delimiter mode recognizes a line containing exactly `---`, with optional
  spaces/tabs around it. CRLF/CR are normalized to LF. Blocks are trimmed and
  empty blocks ignored; internal blank lines, indentation and inline markers
  remain. Empty drafts retain the existing `[""]` representation.
- Fixed text preserves the entire raw string, including whitespace/newlines.
- Save normalization persists metadata and strings; preflight validates the
  preference. Expansion and graph injection never split stored strings again.
- A delimiter change reparses the current raw draft in the same event. External
  updates reformat using the stored preference. Fixed/each switches retain it;
  multiline fixed values select delimiter mode when converted to lists.

## Validation

| Input | Result |
| --- | --- |
| Missing separator | Legacy line mode |
| Text with line/delimiter | Accepted |
| Unknown/null separator | Preflight error |
| Non-text with separator metadata | Preflight error |

Draft save permits incomplete definitions as before; execution readiness is
checked at preflight. No database migration is required.

## Examples

- `A\n\nB\n---\nC` in delimiter mode yields `["A\n\nB", "C"]`.
- `A --- B` and `----` are literal text, not separators.
- `---\n---` has no nonempty blocks and uses the existing empty draft value.

## Tests

- `canvas_prompt_separator_check.mjs`: parser/formatter, whitespace, reserved
  marker, CRLF, fixed text and legacy scalar semantics; included in baseline.
- `canvas_scheduler_check.mjs`: metadata save, validation, two-task expansion and
  byte-equivalent multiline graph injection without provider calls.
- `canvas_prompt_separator_browser_check.py`: keyboard edits, mode switches,
  fixed/preflight, persisted reload, contextual note and 1440px/390px layout.
  Run with BROWSER_BASE_URL on a worker-disabled loopback smoke server; it rejects
  port 3001 and intercepts all APIs. Mobile scheduler testing starts the graph on
  desktop then resizes the dialog, not an initial mobile graph load test.

## Avoid

Do not split multiline `source.values` during scheduling, or rebuild the editing
textarea from trimmed values after each keystroke. Keep raw drafts separate and
use the persisted separator to serialize values on reopen.
