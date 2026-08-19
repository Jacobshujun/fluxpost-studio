# Seedance Prompt Assistant

## Goal

Reduce Seedance prompt-writing complexity inside the infinite canvas by turning a short brief, optional reference images, or an existing prompt into two reviewable production-ready prompt candidates without changing the existing Seedance submission flow.

## Background

- `model.seedance@1` already supports 4-15 second generation, stable image mentions, fixed reference ordering, provider-facing input freezing, and deterministic validation.
- The canvas already has GPT text and vision provider helpers, but composing those nodes manually does not provide a focused Seedance editing experience and cannot safely write stable local mention markers.
- Codex `SKILL.md` files are agent instructions, not application runtime modules. The relevant Seedance rules must be represented as versioned application prompt policy plus deterministic validation.

## Requirements

- Add an `AI 优化` command next to the Seedance Prompt editor and a compact assistant panel in the existing inspector.
- Support `auto`, `text`, `image`, `storyboard`, and `rewrite` modes plus `generate`, `rewrite`, `shorten`, `hook`, and `repair` actions.
- Accept a concise user brief, the existing node prompt, duration, ratio, and the node's ordered fixed reference images.
- Return exactly two structured candidates containing a title, prompt parts, suggested duration/ratio, compliance risk, warnings, and deterministic checks.
- Represent image mentions by stable reference ids in the API contract. Only the client may serialize those ids into the existing internal Seedance mention markers.
- Require an authenticated workspace account at the API boundary.
- Never submit Seedance, mutate a run, or automatically overwrite the current prompt. Applying a candidate is an explicit local graph edit.
- Enforce prompt length, valid references, media limits, duration, ratio, camera-conflict warnings, hook presence, and compliance-risk normalization independently of model claims.
- Surface provider and validation failures in the assistant panel without silent fallback content.
- Keep default verification offline by injecting or mocking model output.

## Acceptance Criteria

- [ ] A signed-in operator can open the assistant from a Seedance node, enter a short brief, request candidates, compare two results, and apply one.
- [ ] Applying a candidate preserves reference identity across image reorder by using the existing mention marker/binding contract.
- [ ] Invalid payloads return HTTP 400, unauthenticated requests return HTTP 401, and provider/config failures remain visible.
- [ ] Candidates over 2000 characters, with missing references, invalid duration/ratio, or malformed response structure are rejected or normalized by the domain boundary before reaching the UI.
- [ ] High-risk candidates cannot be applied; medium-risk candidates remain reviewable with warnings.
- [ ] Focused domain/API/UI checks, lint, TypeScript, build, and the FluxPost offline baseline pass without external provider calls.

## Out Of Scope

- Arbitrary runtime installation or execution of local `SKILL.md` files.
- Long-video multi-run orchestration, automatic storyboard asset generation, or paid Seedance submission.
- Persistence of prompt-assistant history outside the existing canvas graph.
