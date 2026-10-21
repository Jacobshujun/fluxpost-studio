# 逐图迭代共享参考图编号输入

## Goal

Make iteration shared-reference order visible and predictable, matching GPT-Image-2 numbered inputs.

## Requirements

- Keep per-image sources and shared text unchanged.
- Expose shared reference 1 through 16, one connection per port. Initially show the first port; reveal the next after connection and preserve gaps/high connected ports.
- Order child references by port number, independent of connection creation order. Preserve multiple images within a source and duplicate URLs. Numbers identify input groups, not flattened image positions.
- Retain legacy references connections without rewriting user data. Show that port only when connected, label its legacy/first priority, and place its contents before numbered inputs in their existing order.
- Add brief ordering guidance. No uploader, drag sorting, inner reference splitting or changes to the separate image-each node.
- Keep the inner references output contract and model-specific image limits unchanged. Sixteen ports do not impose a new total-image cap.
- No paid calls, user-data writes, automatic commit or port-3001 replacement.

## Acceptance Criteria

- [x] Empty node shows source images, shared text and first numbered reference only.
- [x] Connect/disconnect, sparse and highest-number ports work; GPT-Image-2 behavior is unchanged.
- [x] Numbered ports reject multiple edges; legacy multiple edges still load and execute first.
- [x] Reversed input insertion yields numbered child references; multi-image sources, duplicates and empty references work.
- [x] Source image/text are unchanged; save/load, clipboard and workflow files preserve connections.
- [x] Focused contract/runtime checks pass; baseline results are recorded honestly; isolated UI checks cover handles and readable guidance.

## Notes

- 2026-10-21: user approved planning, implementation, then commit and 3001/LAN activation. Implementation complete; unrelated untracked Gemini task records block clean-tree activation. See verification.md.
