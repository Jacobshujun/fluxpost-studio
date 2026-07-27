# Canvas Common Nodes

## Goal

Extend the existing infinite canvas with eight composable, production-ready nodes for a text-and-image-first social-content workflow, plus ComfyUI-style desktop node search and compatible-port insertion.

## Background

- Canvas already supports typed `text`, `images`, `videos`, `socialPost`, and `publishJobRef` artifacts, immutable DAG runs, versioned node definitions, local previews, and paid-action confirmation.
- Existing nodes cover literal text/image/video input, GPT text, GPT-Image-2, Seedance, image preview, social-post composition, and Feishu publishing.
- Content-pool and library services already enforce workspace ownership and expose stable read APIs.
- Existing runtime media storage and ffmpeg boundaries must be reused; live model, Seedance, and Feishu calls remain outside baseline checks.

## Requirements

- Add `input.content-pool`, `input.library-images`, `utility.prompt-template`, `utility.text-split`, `model.gpt-vision`, `utility.image-select`, `utility.image-transform`, and `utility.video-frames` as version-1 registered node types.
- Keep new configuration values flat scalars or string arrays and reuse current artifact kinds; do not add database tables or migrate stored workflows.
- Content-pool input emits title, body, source URL, images, and videos from a selection-time snapshot. Library input emits an ordered image snapshot. Neither executor reads live source/library state; the inspector provides explicit refresh.
- Prompt templates support custom, title, body rewrite, image-prompt, and video-storyboard presets plus `{{input}}` and ordered `{{input1}}` placeholders.
- Text split supports first-line and custom-delimiter modes and emits `head` and `tail`, failing clearly when the requested split cannot produce both values.
- GPT vision accepts up to eight images and optional text instructions, provides describe, selling-points, composition, OCR, and image-prompt presets, uses existing OpenAI-compatible Responses/Chat configuration and concurrency, and participates in text-model confirmation.
- Image selection accepts ordered 1-based comma-separated indices, preserves metadata/order, removes repeated indices after their first occurrence, and rejects invalid or out-of-range selections.
- Image transform accepts at most 20 images, each at most 30 MB, supports Xiaohongshu 3:4, square, landscape, and custom dimensions, `cover`/`contain`, JPEG/PNG/WebP, and quality. Persist outputs through runtime media storage.
- Video frames accepts at most four videos and 20 total frames, supports cover, even, and explicit timestamp modes, uses allow-listed ffmpeg/ffprobe arguments, and persists JPEG frames through runtime media storage.
- Image selection and transform declare image passthrough bypass mappings. Cross-kind nodes do not support bypass.
- On editable desktop canvas, right-click or Tab opens searchable grouped node insertion. Dangling connections filter by compatible port kind; one match connects automatically and ambiguous matches expose port choices.
- Quick-add keyboard handling must not intercept editable controls. Existing palette remains available, and mobile structural editing behavior remains unchanged.

## Acceptance Criteria

- [ ] All eight nodes round-trip through workflow save, clipboard, validation, immutable runs, isolated reuse, and typed edge checks without changing existing node behavior.
- [ ] Content and library snapshots keep running after source metadata changes and update only through an explicit inspector refresh.
- [ ] Template substitution, text splitting, image ordering, bounds, media limits, transformation dimensions/formats, and frame timestamp planning have deterministic coverage.
- [ ] GPT vision covers mocked Responses and Chat requests, missing configuration, eight-image limit, and paid confirmation without live provider calls.
- [ ] Desktop quick-add covers mouse, keyboard, focus guards, compatible filtering, ambiguous ports, and auto-created edges; responsive layout has no overlap or horizontal overflow.
- [ ] Media outputs use durable URLs/metadata and never place binary/base64 data into workflow JSON.
- [ ] Focused canvas checks, TypeScript, lint, build, full Trellis baseline, local restart, and mocked desktop/mobile browser checks pass.

## Out Of Scope

- Conditions, loops, schedules, webhooks, dynamic ports, user plugins, arbitrary code, or arbitrary shell execution.
- AI-driven crop, smart frame selection, video editing, or live external verification.
- Automatic live refresh of content-pool or library selections.
