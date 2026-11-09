# Fitted image previews and resizable dialogs

User approved implementation on 2026-11-09. Content pool and review must open images fully visible, preserve aspect ratio, display the real pixel scale, offer original 100%, wheel/button zoom, bounded captured mouse pan and fit reset. Eight desktop resize handles preserve the opposite edge and stay within the browser. Navigation preserves dialog dimensions but resets image view; reopening resets both. Small screens fit the browser. Retain existing business actions, videos and content details. No backend/provider/production changes.

Acceptance: long/wide/portrait/square/small images; real mouse eight-direction resizing, viewport limits, pan release and image corners; all themes, desktop/short/mobile. Existing content editor/library and review regressions plus complete deterministic baseline pass. Commit and activate clean HEAD on existing LAN port 3001, verify version identity.
