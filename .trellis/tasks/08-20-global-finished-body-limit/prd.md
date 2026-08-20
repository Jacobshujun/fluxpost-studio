# Global finished-body character limit

## Goal

Keep every new or body-edited finished post at or below 1,000 Unicode code points while targeting about 800 code points for AI-written bodies, without truncating harvested source content or retroactively modifying historical records.

## Requirements

- Apply the policy to generated posts, review edits, Canvas-composed posts, original and viral production, original batches, and copy-library bodies.
- Preserve harvested `NormalizedSourceItem.contentText`, prompts, material notes, and image copy without this limit.
- Count the trimmed body with Unicode code points. Whitespace, line breaks, punctuation, and emoji count.
- Prompt AI finished-body generation toward 800 characters. If a result exceeds 1,000, make at most one compression request; if it still exceeds the limit or repair fails, keep the last complete sentence within 1,000 or hard-truncate when no sentence boundary exists.
- Mark governed records with additive `bodyPolicyVersion: 1` metadata stored in existing JSON/JSONB data.
- Treat unmarked records as historical. Permit unchanged historical bodies, including publishing; when the body changes, apply and mark the new policy. Title, media, visibility, status, and publish-only changes must not promote an unchanged historical body.
- Clamp manual review and copy-library input to 1,000 Unicode code points and show a character count. Canvas composition applies deterministic sentence-aware truncation.
- Feishu text/full preflight must reject corrupt versioned posts over the limit. Media-only publishing does not inspect body length.

## Acceptance Criteria

- [x] Pure policy checks cover CJK, ASCII, whitespace, line breaks, emoji, exactly 1,000 code points, sentence-aware truncation, and hard truncation.
- [x] Mocked AI checks prove the 800 target, at most one repair request, and a final body at or below 1,000 without live provider calls.
- [x] Every finished-post creation/edit path returns and persists a compliant, versioned body.
- [x] Unmarked historical bodies remain unchanged for non-body edits and publishing; the first body change applies version 1.
- [x] Review and copy-library editors clamp pasted/typed input by Unicode code point and display the count.
- [x] Canvas composition and Feishu preflight enforce the agreed boundaries.
- [x] The focused deterministic check and complete Trellis baseline pass.

## Out Of Scope

- Truncating harvested source text or prompt/material fields.
- Rewriting or migrating existing runtime rows.
- Calling live AI or Feishu services in baseline verification.
