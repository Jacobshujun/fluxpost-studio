import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const tempDir = path.join(projectRoot, "test-artifacts", "gpt-image-size-request");
const inputFile = path.join(tempDir, "input-16x9.png");
const outputFile = path.join(tempDir, "reference-1200x1600.jpg");
const imageGeneration = read("src/lib/image-generation.ts");

assertContains(
  imageGeneration,
  /const preparedReferences = await prepareReferenceImages\(referenceImages,\s*options\.size\)/,
  "Image edit references must be prepared with the same requested size sent to gpt-image-2.",
);

assertContains(
  imageGeneration,
  /async function normalizeReferenceImageFile\(filePath: string,\s*requestedSize: ImageGenerationOptions\["size"\]\)/,
  "Reference image normalization must receive the requested GPT image size.",
);

assertContains(
  imageGeneration,
  /force_original_aspect_ratio=decrease,pad=\$\{target\.width\}:\$\{target\.height\}/,
  "Reference images must be padded to the requested GPT image size before images/edits upload.",
);

assertContains(
  imageGeneration,
  /form\.append\("size", options\.size\)/,
  "Images edits requests must still send the user-requested size parameter to gpt-image-2.",
);

assertContains(
  imageGeneration,
  /const sizeConstrainedPrompt = buildImageSizeConstrainedPrompt\(prompt,\s*options\.size\)/,
  "Images API requests must add an explicit prompt-side size constraint before calling gpt-image-2.",
);

assertContains(
  imageGeneration,
  /type:\s*"image_generation",\s*model:\s*appConfig\.openaiImageModel,\s*size:\s*options\.size/,
  "Responses image_generation tool requests must pass the user-requested size as a structured tool option.",
);

assertContains(
  imageGeneration,
  /请严格按照用户指定尺寸输出：\$\{target\.width\}x\$\{target\.height\} 像素/,
  "The model prompt must explicitly tell gpt-image-2 to output the requested pixel size.",
);

assertContains(
  imageGeneration,
  /不要沿用参考图、视频帧或素材图的原始横竖比例/,
  "The model prompt must explicitly prevent source video frames from controlling the output aspect ratio.",
);

assertNotContains(
  imageGeneration,
  /normalizeGeneratedImageOutput|runGeneratedImageResize|Generated image normalized|Generated image saved and normalized/,
  "Generated outputs must not be resized locally after gpt-image-2 returns.",
);

rmSync(tempDir, { recursive: true, force: true });
mkdirSync(tempDir, { recursive: true });

try {
  execFileSync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=1672x941:d=0.1",
    "-frames:v",
    "1",
    inputFile,
  ]);

  execFileSync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    inputFile,
    "-vf",
    "scale=1200:1600:force_original_aspect_ratio=decrease,pad=1200:1600:(ow-iw)/2:(oh-ih)/2:color=white",
    "-frames:v",
    "1",
    "-q:v",
    "2",
    outputFile,
  ]);

  const dimensions = execFileSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=s=x:p=0",
    outputFile,
  ])
    .toString("utf8")
    .trim();

  if (dimensions !== "1200x1600") {
    throw new Error(`Expected model reference smoke output to be 1200x1600, got ${dimensions || "unknown"}.`);
  }
} finally {
  if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
}

console.log("GPT image size request check passed.");

function read(relativePath) {
  return execFileSync("node", ["-e", `process.stdout.write(require("node:fs").readFileSync(${JSON.stringify(path.join(projectRoot, relativePath))}, "utf8"))`], {
    encoding: "utf8",
  });
}

function assertContains(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function assertNotContains(source, pattern, message) {
  if (pattern.test(source)) throw new Error(message);
}
