import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const page = read("src/app/canvas/page.tsx");
const css = read("src/app/globals.css");

assert.match(page, /const \[paletteVisible, setPaletteVisible\] = useState\(false\);/, "Canvas palette must start collapsed");
assert.match(page, /panOnDrag=\{true\}/, "Canvas pane must pan on blank-area drag");
assert.match(page, /selectionOnDrag=\{!isMobile\}/, "Desktop selection drag must remain enabled");
assert.match(page, /selectionKeyCode="Alt"/, "Alt must be the selection-box activation key");
assert.match(page, /multiSelectionKeyCode=\{null\}/, "Ctrl/Meta click multi-select must be disabled");
assert.doesNotMatch(page, /panOnDrag=\{isMobile\}/, "Canvas must not keep the old desktop non-pan mode");
assert.match(css, /\.canvas-stage \.react-flow__pane\.draggable \{[^}]*cursor: grab;/s, "Idle pan cursor must remain grab");
assert.match(css, /\.canvas-stage \.react-flow__pane\.dragging \{[^}]*cursor: grabbing;/s, "Active pan cursor must remain grabbing");
assert.match(css, /\.canvas-stage \.react-flow__pane\.selection \{[^}]*cursor: crosshair;/s, "Alt selection cursor must be crosshair");
assert.match(css, /\.canvas-palette-group button \{[^}]*display: grid;[^}]*grid-template-columns: 25px minmax\(0, 1fr\);/s, "Palette buttons must keep every label aligned to the same fixed icon column");
assert.match(css, /\.canvas-palette-group button strong \{[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/s, "Palette labels must not resize their aligned button columns");

console.log("Canvas interaction source contract checks passed.");
