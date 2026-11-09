# Design

Shared ImagePreview measures its bounded viewport with ResizeObserver and reads natural image dimensions on load. Pixel-sized absolutely positioned image avoids Grid intrinsic-size expansion. Fit is min(1, viewport/image dimensions); manual scale is clamped between min(.1, fit) and 5. Pan is bounded to half of the excess dimensions; fit centers. Pointer-anchored wheel and capture are shared by both callers. Each caller keys the viewer by media identity.

Shared ResizablePreviewPanel owns a viewport-clamped rectangle, initially centered at caller width and at most 900px tall. Eight pointer handles change rectangle edges while fixing the opposite edges, min 360x320 and 14px screen margin. Under 640px it fits the viewport without handles. Image fit follows stage resize; manual scale remains intact. Header, viewer tools and page actions occupy independent grid tracks. Content supplemental media/text/links scroll separately.

No API/schema change. Keep media URL conversion and review business callbacks in pages. Scope CSS to the new components; remove obsolete content viewer. Tests use isolated intercepted APIs/media. LAN startup requires clean committed primary worktree.
