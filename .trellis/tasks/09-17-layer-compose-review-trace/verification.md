# Review delivery diagnosis - 2026-09-17

- Local candidate is `5c3f07fbf40dd39d96baf5da4934e62111713f4c`.
- Read-only runtime inspection found a full run started at 14:21:57 UTC and
  completed at 14:25:48 UTC. Its layer output URL exactly matches the downstream
  composition input and videoUrls in both generated_posts and runtime_posts.
- Its post was created at 14:25:47 UTC. Actual remote video frame at two seconds
  shows the original landscape footage centered in a portrait white canvas, with
  one caption above and one below. It is visibly different from the source video.
- A separate isolated run started at 14:24:16 UTC and completed at 14:24:59 UTC.
  It reused an earlier generated image and rendered both captions near the top.
  The persisted run plan contains no compose.social-post or publish.feishu step;
  this isolated result was never delivered to a post.
- Local debug frames: test-artifacts/compose-review-frame.png,
  compose-isolated-frame.png, compose-source-frame.png, compose-overlay-frame.png.
  Remote access was read-only FFmpeg media inspection. No provider, publish, row
  mutation, or workflow replay was initiated by the diagnosis.
- Review JSX renders the saved post.videoUrls directly. Exact operator-selected
  post and observed mismatch remain pending confirmation; no UI defect established.
- Offline baseline passed with exit 0, including all domain checks, lint,
  TypeScript, build, HTTP smoke and SQLite on worker-disabled port 45680.
  Log: test-artifacts/layer-compose-review-trace-baseline.log.
- Investigation remains open for the operator to identify the exact post or
  distinguish missing captions from a layout mismatch. No application changes.
