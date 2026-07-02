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
  /<div className="review-preview-backdrop" role="dialog" aria-modal="true">[\s\S]*<div className="review-preview-panel">[\s\S]*<div className="review-preview-stage">[\s\S]*<img alt="" src=\{toDisplayImageSrc\(image\)\}/,
  "Review page should render clicked images inside the preview dialog stage.",
);

assertContains(
  globals,
  /\.review-preview-panel\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto;/,
  "Review preview panel should reserve flexible remaining space for the image stage.",
);

assertContains(
  globals,
  /\.review-preview-stage\s*\{[\s\S]*min-height:\s*0;[\s\S]*height:\s*auto;[\s\S]*overflow:\s*hidden;/,
  "Review preview stage should shrink within the modal instead of forcing the panel taller than the viewport.",
);

assertContains(
  globals,
  /\.review-preview-stage img\s*\{[\s\S]*max-width:\s*100%;[\s\S]*max-height:\s*100%;[\s\S]*width:\s*auto;[\s\S]*height:\s*auto;[\s\S]*object-fit:\s*contain;/,
  "Review preview images should keep their intrinsic aspect ratio and fit fully inside the stage.",
);

console.log("Review preview layout check passed.");
