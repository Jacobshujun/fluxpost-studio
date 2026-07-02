import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const globals = readFileSync(path.join(projectRoot, "src/app/globals.css"), "utf8");

function assertContains(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

assertContains(
  globals,
  /\.review-frame\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;[\s\S]*gap:\s*12px;/,
  "Review frame should own its column layout instead of depending only on utility classes.",
);

assertContains(
  globals,
  /\.review-header\s*\{[\s\S]*overflow:\s*visible;/,
  "Review header should keep top navigation actions visible instead of clipping the return button.",
);

assertContains(
  globals,
  /\.review-header-actions > \*\s*\{[\s\S]*min-width:\s*max-content;[\s\S]*white-space:\s*nowrap;/,
  "Review header action buttons should keep their labels visible on desktop.",
);

assertContains(
  globals,
  /@media \(max-width:\s*760px\)[\s\S]*\.review-header-actions > \*,[\s\S]*\.review-action-strip > \*\s*\{[\s\S]*flex:\s*1 1 140px;[\s\S]*min-width:\s*0;/,
  "Review header action buttons should switch to responsive full-row behavior on mobile.",
);

assertContains(
  globals,
  /@media \(min-width:\s*1120px\)[\s\S]*\.review-frame\s*\{[\s\S]*height:\s*100vh;[\s\S]*height:\s*100dvh;[\s\S]*overflow:\s*hidden;/,
  "Desktop review frame should be viewport-bounded so child panels can scroll internally.",
);

assertContains(
  globals,
  /@media \(min-width:\s*1120px\)[\s\S]*\.review-workspace\s*\{[\s\S]*flex:\s*1 1 auto;[\s\S]*grid-template-columns:[\s\S]*overflow:\s*hidden;/,
  "Desktop review workspace should fill remaining height and hide outer overflow.",
);

assertContains(
  globals,
  /@media \(min-width:\s*1120px\)[\s\S]*\.review-main\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto auto;[\s\S]*overflow:\s*hidden;/,
  "Desktop review main panel should reserve visible rows for title, actions, and AI edit controls.",
);

assertContains(
  globals,
  /@media \(min-width:\s*1120px\)[\s\S]*\.review-editor-grid\s*\{[\s\S]*min-height:\s*0;[\s\S]*overflow:\s*hidden;/,
  "Desktop review editor grid should not expand the review panel when many images are present.",
);

assertContains(
  globals,
  /@media \(min-width:\s*1120px\)[\s\S]*\.review-gallery,[\s\S]*\.review-editor-fields\s*\{[\s\S]*min-height:\s*0;[\s\S]*overflow-y:\s*auto;/,
  "Desktop review image and text columns should scroll independently so action buttons remain reachable.",
);

console.log("Review desk scroll layout check passed.");
