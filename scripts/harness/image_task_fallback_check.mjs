import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assertContains(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

const imageGeneration = read("src/lib/image-generation.ts");

assertContains(
  imageGeneration,
  /function isImageTaskSourceFallbackError\(error: unknown\)[\s\S]*isImageTaskTimeoutError\(error\)/,
  "Selected source-image tasks should share one fallback predicate that includes timeout errors.",
);

assertContains(
  imageGeneration,
  /function isImageTaskSourceFallbackError\(error: unknown\)[\s\S]*Gateway Time-\?out/,
  "Selected source-image tasks should treat gateway timeouts as source-image fallback cases.",
);

assertContains(
  imageGeneration,
  /function isImageTaskSourceFallbackError\(error: unknown\)[\s\S]*50\[0234\]/,
  "Selected source-image tasks should treat transient 5xx provider failures as source-image fallback cases.",
);

assertContains(
  imageGeneration,
  /if \(isImageTaskSourceFallbackError\(error\)\) \{[\s\S]*Image task failed; using source image[\s\S]*fallbackUrl: task\.url[\s\S]*imageUrls: \[task\.url\]/,
  "Recoverable selected image task failures should return the original source image for that slot.",
);

assertContains(
  imageGeneration,
  /action: "Image task failed"[\s\S]*failedTask: `\$\{task\.label\}: \$\{message\}`/,
  "Non-recoverable image task failures should still be reported instead of being silently swallowed.",
);

console.log("Image task fallback check passed.");
