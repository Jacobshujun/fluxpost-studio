import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assertContains(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function assertNotContains(source, pattern, message) {
  if (pattern.test(source)) throw new Error(message);
}

const imageGeneration = read("src/lib/image-generation.ts");
const simpleRuns = read("src/lib/simple-runs.ts");
const creationControls = read("src/lib/creation-controls.ts");

assertContains(
  imageGeneration,
  /const providerPrompt = normalizeProviderPrompt\(prompt\)/,
  "Image generation should normalize the caller prompt before provider dispatch.",
);
assertContains(
  imageGeneration,
  /if \(!providerPrompt\) \{[\s\S]*Image generation skipped[\s\S]*imageUrls:\s*\[\]/,
  "Image generation should skip locally when the no-task provider prompt is empty.",
);
assertContains(
  imageGeneration,
  /callRunningHubImageApi\(providerPrompt,\s*count,\s*imageOptions\)/,
  "RunningHub no-task generation should receive the normalized non-empty provider prompt.",
);
assertNotContains(
  imageGeneration,
  /callRunningHubImageApi\(prompt,\s*count,\s*imageOptions\)/,
  "RunningHub no-task generation must not receive the raw caller prompt.",
);

assertContains(
  simpleRuns,
  /const imagePrompt = resolveSimpleImagePrompt\(draft,\s*source\)/,
  "Simple-mode production should resolve a fallback image prompt before image generation.",
);
assertContains(
  simpleRuns,
  /function resolveSimpleImagePrompt\(draft: GeneratedPost,\s*source: NormalizedSourceItem\)/,
  "Simple-mode fallback image prompt helper should be defined.",
);
assertContains(
  simpleRuns,
  /source\.title[\s\S]*source\.contentText[\s\S]*不要添加文字/,
  "Simple-mode fallback image prompt should use source context and forbid extra text.",
);

assertContains(
  creationControls,
  /typeof task\.prompt === "string" \? task\.prompt\.trim\(\) : ""/,
  "Single image task prompt construction should tolerate missing prompt fields from runtime data.",
);

console.log("Image prompt guard check passed.");
