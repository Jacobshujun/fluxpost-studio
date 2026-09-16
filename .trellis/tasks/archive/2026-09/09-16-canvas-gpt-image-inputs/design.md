# Design

Keep the readable V2 schema and register optional image_1 through image_16 inputs with one connection each. Preserve references as a legacy multiple input. Derive visible inputs from connections, retaining holes and one trailing empty input. React Flow subscriptions update handle geometry after input changes. Use the same visible-input helper for nested connection selectors and quick-add.

Use shared registry helpers for numeric reference aggregation and bypass required-input selection. Legacy direct uploads and references retain precedence; numbered inputs follow in numeric order. Preserve original numbered inputs in resolved run snapshots to avoid introducing synthetic references that would change ordering or fingerprints on resume.

Reuse CanvasNodeFields for inline controls and its atomic transparent/PNG patch. Display existing ratio-to-pixel conversion without changing provider configuration or claiming live custom-size acceptance.
