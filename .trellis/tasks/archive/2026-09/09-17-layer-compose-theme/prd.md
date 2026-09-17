# Fix portal theme contrast

The layer dialog is portaled to body, outside .canvas-shell. Its canvas-panel
variable is undefined there, causing white fallback surfaces with creator-theme
white text. Use the global panel-solid token for editor surfaces and controls.
Keep the white output canvas independent of UI theme. Verify computed text contrast
in professional/editorial/creator, live switching, and 1440/390 interactions.
Run full offline baseline, commit, and reactivate the authorized local candidate.
