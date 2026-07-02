# Quality Guidelines

## Required Verification

For code changes, use the baseline documented in `.trellis/spec/fluxpost/verification.md`:

```powershell
powershell -ExecutionPolicy Bypass -File .trellis/verification/check.ps1
```

Focused checks can be run first, but the full baseline is the completion gate unless it is explicitly blocked and explained.

## Baseline Expectations

The baseline covers:

- Trellis context existence, budgets, and latest-marker checks.
- Project JSON parsing.
- Static domain checks in `.trellis/verification/*.mjs`.
- `npm run lint`.
- `npx --no-install tsc --noEmit`.
- `npm run build`.
- Local production HTTP smoke.
- SQLite store validation.

Default checks must not call live TikHub, OpenAI-compatible text/image providers, ComfyUI, Feishu writes, Lark replies, or simple-run production workflows.

## UI Review

- Preserve dense operational layouts that support scanning, selection, comparison, and repeated action.
- Reuse existing button, field, badge, panel, and grid classes from `src/app/globals.css`.
- Check responsive behavior when changing fixed panels, grid tracks, galleries, sidebars, or toolbars.
- Text must fit inside controls on mobile and desktop.

## Error Handling

- Surface API errors to the user with useful messages.
- Do not add broad catch blocks that hide provider, queue, auth, or database failures.
- Do not convert unknown behavior into silent fallbacks; identify and verify the cause.

## Review Checklist

- Changed routes still require workspace sign-in where existing behavior requires it.
- Owner-scoped records are filtered through existing access helpers.
- New or changed API responses are reflected in UI types and state handling.
- New checks are deterministic, local, and do not mutate production/runtime data.
- Old disabled Harness paths are not used as active verification or context.
