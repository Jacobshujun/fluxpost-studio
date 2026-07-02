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
  /export const imageGenerationSizeOptions[\s\S]*auto[\s\S]*1024x1024[\s\S]*1024x1536[\s\S]*1536x1024[\s\S]*2048x2048[\s\S]*2048x1152[\s\S]*1152x2048[\s\S]*3840x2160[\s\S]*2160x3840/,
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

assertContains(
  page,
  /function ImageSizeInput[\s\S]*<input[\s\S]*list=\{listId\}[\s\S]*<datalist id=\{listId\}[\s\S]*imageGenerationSizeOptions\.map/,
  "Image size controls should support manual input while still exposing shared GPT request-size presets.",
);

assertContains(
  imageSizeOptions,
  /function normalizeValidImageGenerationSize[\s\S]*\^\\d\{2,5\}x\\d\{2,5\}\$[\s\S]*width < 64[\s\S]*width > 8192[\s\S]*return `\$\{width\}x\$\{height\}`/,
  "Backend image size normalization should accept validated manual widthxheight values without folding them to presets.",
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
  /const allowed = \["auto", "1024x1024", "1024x1536", "1536x1024", "2048x2048", "2048x1152", "1152x2048", "3840x2160", "2160x3840"\]/,
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
  /const taskPrompt = buildSingleImageTaskPrompt\(prompt, task\)[\s\S]*callImagesApi\(taskPrompt, 1, imageOptions, getTaskReferenceImages\(task\)\)/,
  "Selected image tasks, including viral replication slots, must send their per-task prompt and task reference images through Images API edits.",
);

assertContains(
  imageGeneration,
  /function getTaskReferenceImages\(task: SourceImageTask\)[\s\S]*task\.url[\s\S]*task\.referenceUrls/,
  "Selected image tasks should include the primary reference and any ordered additional reference URLs.",
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
  /const preparedReferences = await prepareReferenceImages\(referenceImages,\s*options\.size\)/,
  "Image edit references should be prepared against the same requested size before calling gpt-image-2.",
);

assertContains(
  imageGeneration,
  /form\.append\("size", options\.size\)/,
  "Image edits should send the user-requested size parameter to gpt-image-2.",
);

assertContains(
  imageGeneration,
  /const sizeConstrainedPrompt = buildImageSizeConstrainedPrompt\(prompt,\s*options\.size\)/,
  "Image requests should add an explicit prompt-side size constraint before calling gpt-image-2.",
);

assertContains(
  imageGeneration,
  /function normalizeReferenceImageFile\(filePath: string,\s*requestedSize: ImageGenerationOptions\["size"\]\)[\s\S]*parseRequestedPixelSize\(requestedSize\)[\s\S]*runImageResize\(filePath,\s*outputFile,\s*target\)/,
  "Reference images should be normalized to the requested edit canvas before upload.",
);

assertContains(
  imageGeneration,
  /force_original_aspect_ratio=decrease,pad=\$\{target\.width\}:\$\{target\.height\}/,
  "Reference image preparation should pad input material to the requested GPT image size before images/edits upload.",
);

assertContains(
  imageGeneration,
  /Generated image saved from provider output without local resizing/,
  "Generated image save logs should state that provider outputs are saved directly.",
);

assertContains(
  imageGeneration,
  /const imageUrls = \[\.\.\.\(await saveBase64Images\(base64Images\)\), \.\.\.\(await materializeGeneratedImageUrls\(remoteUrls\)\)\]\.slice\(0, count\)/,
  "Images API URL outputs must be downloaded into local generated files before being persisted on posts.",
);

assertContains(
  imageGeneration,
  /async function materializeGeneratedImageUrls\(remoteUrls: string\[\]\)/,
  "Image generation must have a local materialization path for provider-returned remote URLs.",
);

assertContains(
  imageGeneration,
  /imageUrls\.push\(await downloadGeneratedImageUrl\(remoteUrl,\s*index\)\)/,
  "Image generation must download each provider-returned remote URL before returning it.",
);

assertNotContains(
  imageGeneration,
  /saveBase64Images\(base64Images,\s*options\.size\)|normalizeGeneratedImageOutput|runGeneratedImageResize|Generated image normalized|Generated image saved and normalized|,\s*\.\.\.remoteUrls\]\.slice\(0, count\)/,
  "Provider-returned images must not be resized locally after gpt-image-2 returns.",
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
  /if \(isImageTaskSourceFallbackError\(error\)\) \{[\s\S]*const fallbackUrl = await resolveDirectSourceImageUrl\(task\.url\)[\s\S]*Image task failed; using source image[\s\S]*fallbackUrl: task\.url[\s\S]*outputUrl: fallbackUrl[\s\S]*imageUrls: \[fallbackUrl\]/,
  "Recoverable selected image task failures should return the direct source image URL after WebP-to-JPG normalization.",
);

assertContains(
  imageGeneration,
  /if \(task\.mode === "keep"\) \{[\s\S]*const sourceImageUrl = await resolveDirectSourceImageUrl\(task\.url\)[\s\S]*imageUrls: \[sourceImageUrl\]/,
  "Keep-mode image tasks should route direct source images through WebP-to-JPG normalization.",
);

assertContains(
  imageGeneration,
  /function isWebpImageReference\(value: string\)[\s\S]*\.webp[\s\S]*format[\s\S]*webp/,
  "Direct source-image normalization should detect WebP URLs before returning keep/fallback images.",
);

assertContains(
  imageGeneration,
  /function runImageTranscodeToJpeg\(inputFile: string,\s*outputFile: string\)[\s\S]*execFile\([\s\S]*"ffmpeg"[\s\S]*"-q:v"[\s\S]*"2"/,
  "Direct WebP source images should be converted to JPG with ffmpeg.",
);

assertContains(
  imageGeneration,
  /action: "Image task failed"[\s\S]*failedTask: `\$\{task\.label\}: \$\{message\}`/,
  "Non-recoverable image task failures should still be reported instead of being silently swallowed.",
);

console.log("Image task fallback check passed.");
