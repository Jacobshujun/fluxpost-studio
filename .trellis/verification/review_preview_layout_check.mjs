import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assertContains(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

const reviewPage = read("src/app/review/page.tsx");
const globals = read("src/app/globals.css");

assertContains(
  reviewPage,
  /<div className="review-preview-backdrop" role="dialog" aria-modal="true">[\s\S]*<div className="review-preview-panel">[\s\S]*<div className="review-preview-stage">[\s\S]*<video src=\{url\} controls preload="metadata" \/>[\s\S]*<img alt="" src=\{toDisplayImageSrc\(url\)\}/,
  "Review page should render clicked images and videos inside the preview dialog stage.",
);

assertContains(
  reviewPage,
  /<PreviewDialog[\s\S]*onRemove=\{\(kind, index\) => \(kind === "video" \? removeDraftVideo\(index\) : removeDraftImage\(index\)\)\}[\s\S]*onRegenerate=\{\(index\) => void regenerateDraftImage\(index\)\}/,
  "Review preview dialog should receive delete and prompt-regenerate handlers from the review page.",
);

assertContains(
  reviewPage,
  /function PreviewDialog\(\{[\s\S]*imageBusyKey[\s\S]*onRemove[\s\S]*onRegenerate[\s\S]*\}/,
  "Review preview dialog should accept busy state plus delete and prompt-regenerate callbacks.",
);

assertContains(
  reviewPage,
  /className="review-preview-actions"[\s\S]*kind === "image"[\s\S]*onClick=\{\(\) => onRegenerate\(index\)\}[\s\S]*Wand2[\s\S]*Prompt[\s\S]*onClick=\{\(\) => onRemove\(kind, index\)\}[\s\S]*Trash2/,
  "Review preview dialog should render visible Prompt generation for images and deletion buttons for image/video media.",
);

assertContains(
  globals,
  /\.review-preview-panel\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto;/,
  "Review preview panel should reserve flexible remaining space for the image stage.",
);

assertContains(
  globals,
  /\.review-preview-panel\s*\{[\s\S]*background:\s*color-mix\(in srgb,\s*var\(--panel-strong\)[\s\S]*color:\s*var\(--foreground\);/,
  "Review preview panel should use the active app theme variables instead of a fixed dark theme.",
);

assertContains(
  globals,
  /\.review-preview-stage\s*\{[\s\S]*min-height:\s*0;[\s\S]*height:\s*auto;[\s\S]*overflow:\s*hidden;/,
  "Review preview stage should shrink within the modal instead of forcing the panel taller than the viewport.",
);

assertContains(
  globals,
  /\.review-preview-stage img,\s*\.review-preview-stage video\s*\{[\s\S]*display:\s*block;[\s\S]*width:\s*100%;[\s\S]*height:\s*100%;[\s\S]*min-width:\s*0;[\s\S]*min-height:\s*0;[\s\S]*object-fit:\s*contain;/,
  "Review preview media should fill the stage box and use object-fit: contain so large media are scaled down instead of clipped.",
);

assertContains(
  globals,
  /\.review-preview-actions\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:[\s\S]*gap:\s*8px;/,
  "Review preview actions should use a stable responsive grid so buttons stay visible.",
);

console.log("Review preview layout check passed.");
