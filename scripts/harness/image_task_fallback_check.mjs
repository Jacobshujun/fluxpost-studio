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
const imageSizeOptions = read("src/lib/image-size-options.ts");
const page = read("src/app/page.tsx");
const workspaceSettings = read("src/lib/workspace-settings.ts");
const config = read("src/lib/config.ts");
const generateRoute = read("src/app/api/generate/route.ts");
const imagesRoute = read("src/app/api/images/route.ts");

assertContains(
  config,
  /openaiImageRequestTimeoutMs:\s*numberOrDefault\(process\.env\.OPENAI_IMAGE_REQUEST_TIMEOUT_MS,\s*180_000\)/,
  "Generic image request timeout must be configurable through OPENAI_IMAGE_REQUEST_TIMEOUT_MS.",
);

assertContains(
  config,
  /openaiImageApiKey:\s*process\.env\.OPENAI_IMAGE_API_KEY\s*\|\|\s*process\.env\.OPENAI_API_KEY\s*\|\|\s*""/,
  "Image API key must be configurable through OPENAI_IMAGE_API_KEY with OPENAI_API_KEY fallback.",
);

assertContains(
  config,
  /openaiImageBackupBaseUrl:\s*normalizeOptionalBaseUrl\(process\.env\.OPENAI_IMAGE_BACKUP_BASE_URL\s*\|\|\s*""\)/,
  "Backup image API base URL must be configurable through OPENAI_IMAGE_BACKUP_BASE_URL.",
);

assertContains(
  config,
  /openaiImageBackupApiKey:\s*process\.env\.OPENAI_IMAGE_BACKUP_API_KEY\s*\|\|\s*""/,
  "Backup image API key must be configurable through OPENAI_IMAGE_BACKUP_API_KEY.",
);

assertContains(
  config,
  /openaiImageEndpoint:\s*normalizeImageEndpoint\(process\.env\.OPENAI_IMAGE_ENDPOINT\s*\|\|\s*"responses"\)/,
  "Image endpoint should be normalized so stale provider values cannot dispatch unsupported providers.",
);

assertContains(
  imageGeneration,
  /const imageRequestTimeoutMs = appConfig\.openaiImageRequestTimeoutMs;/,
  "Image generation should use the configured OpenAI-compatible image request timeout.",
);

assertContains(
  imageSizeOptions,
  /export const imageGenerationSizeOptions[\s\S]*1024x1536[\s\S]*1536x1024[\s\S]*1024x1024[\s\S]*1536x864[\s\S]*3840x2160/,
  "GPT image generation sizes must be exposed as actual request-size options.",
);

assertContains(
  workspaceSettings,
  /imageSize:\s*defaultImageGenerationSize/,
  "Workspace image-size defaults should use the shared GPT image size option.",
);

assertContains(
  page,
  /imageGenerationSizeOptions\.map/,
  "The frontend should render global image size controls from the shared GPT request-size options.",
);

assertNotContains(
  page,
  /image-size-presets|placeholder="1200x1600"|list="image-size-presets"/,
  "Image size controls should not use the old free-form 1200x1600 preset input.",
);

assertContains(
  imageGeneration,
  /size:\s*normalizeImageGenerationSize\(options\?\.size\)/,
  "Backend image generation should normalize request size through the shared GPT image size options.",
);

assertContains(
  generateRoute,
  /const imageSize = normalizeImageGenerationSize\(body\.imageSize\)[\s\S]*size:\s*imageSize/,
  "The generate API should normalize the requested GPT image size before dispatch.",
);

assertContains(
  imagesRoute,
  /const imageSize = normalizeImageGenerationSize\(body\.size\)[\s\S]*size:\s*imageSize/,
  "The manual images API should normalize the requested GPT image size before dispatch.",
);

assertNotContains(
  `${generateRoute}\n${imagesRoute}`,
  /1200x1600/,
  "Image API routes should not keep the old 1200x1600 fallback size.",
);

assertNotContains(
  imageGeneration,
  /const allowed = \["1024x1024", "1536x1024", "1024x1536", "1536x864", "3840x2160"\]/,
  "Backend image size options should not maintain a separate hard-coded allowed list.",
);

assertContains(
  imageGeneration,
  /openaiImageUrl\(endpointPath,\s*route\)[\s\S]*buildStandardImagesApiRequest\(route,/,
  "Images provider requests should use the active primary/backup image API route.",
);

assertContains(
  imageGeneration,
  /const endpointPath = referenceImages\.files\.length \? "images\/edits" : "images\/generations"/,
  "Reference-image tasks should use images/edits while text-to-image uses images/generations.",
);

assertContains(
  imageGeneration,
  /new FormData\(\)[\s\S]*form\.append\("image"[\s\S]*openaiImageHeaders\(false,\s*route\)/,
  "Image edits should use multipart/form-data with binary image upload and the active route key.",
);

assertContains(
  imageGeneration,
  /function buildStandardImagesGenerationBody[\s\S]*n:\s*1[\s\S]*output_format:\s*"png"[\s\S]*response_format:\s*"b64_json"/,
  "Text-to-image requests should use the standard gpt-image-2 Images API body with n fixed to 1.",
);

assertContains(
  imageGeneration,
  /for \(let index = 0; index < Math\.max\(1,\s*Math\.floor\(count\)\); index \+= 1\)/,
  "Multiple requested images should be generated through repeated n=1 requests.",
);

assertContains(
  imageGeneration,
  /function isImageProviderConfigured\(\) \{[\s\S]*isStandardImagesApiRouteConfigured\("primary"\)[\s\S]*isStandardImagesApiRouteConfigured\("backup"\)/,
  "Images provider configuration should accept a configured primary or backup image API route.",
);

assertContains(
  imageGeneration,
  /let activeStandardImagesApiRoute:\s*OpenaiImageApiRoute\s*=\s*"primary"/,
  "Images API failover should keep an in-process active primary/backup route.",
);

assertContains(
  imageGeneration,
  /resolveNextStandardImagesApiRoute[\s\S]*currentRoute === "primary" \? "backup" : "primary"/,
  "Images API failover should switch from primary to backup and from backup to primary.",
);

assertContains(
  imageGeneration,
  /restorePrimaryStandardImagesApiRouteAfterBackupFailure[\s\S]*route === "backup"[\s\S]*activeStandardImagesApiRoute = "primary"/,
  "Backup image API failure should restore the active route to primary.",
);

assertContains(
  imageGeneration,
  /isStandardImagesApiRouteConfigured\(route: OpenaiImageApiRoute\)[\s\S]*route === "backup"[\s\S]*openaiImageBackupBaseUrl[\s\S]*openaiImageBackupApiKey/,
  "Backup image API route should require both backup base URL and backup API key.",
);

assertContains(
  imageGeneration,
  /function openaiImageHeaders\(json = true,\s*route: OpenaiImageApiRoute = "primary"\)[\s\S]*openaiImageApiKey\(route\)/,
  "Image request headers should use the active route API key.",
);

assertNotContains(
  imageGeneration,
  /callRunningHubImageApi|runningHubUrl|RUNNINGHUB_|appConfig\.runningHub/,
  "Image generation must not contain RunningHub request paths or credentials.",
);

assertNotContains(
  config,
  /RUNNINGHUB_|runningHub/,
  "Runtime config must not expose or depend on RunningHub image settings.",
);

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
