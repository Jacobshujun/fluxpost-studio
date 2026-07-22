import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assertContains(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

const types = read("src/lib/types.ts");
const route = read("src/app/api/simple/runs/route.ts");
const simpleRuns = read("src/lib/simple-runs.ts");
const page = read("src/app/page.tsx");
const creationControls = read("src/lib/creation-controls.ts");
const checkPs1 = read(".trellis/verification/check.ps1");

assertContains(types, /generateImages\?:\s*boolean/, "SimpleRunInput must persist the image-generation switch.");

assertContains(route, /generateImages\?:\s*boolean/, "Simple run API must accept generateImages.");
assertContains(route, /generateImages:\s*body\.generateImages !== false/, "Simple run API must default image generation on.");

assertContains(simpleRuns, /generateImages:\s*input\.generateImages !== false/, "Simple runs must normalize image generation as default-on.");
assertContains(simpleRuns, /function shouldGenerateImages\(input: SimpleRunInput\)/, "Simple runs must use one shared image-generation policy helper.");
assertContains(simpleRuns, /function makeImageGenerationSkippedResult\(/, "Simple runs must use a shared skipped-image result helper.");
assertContains(creationControls, /export function hasSelectedImageTask\(tasks\?: SourceImageTask\[\]\)/, "Image task selection must have a shared helper.");
assertContains(simpleRuns, /const generateImages = shouldGenerateImages\(normalizedInput\)/, "Keyword/link/Feishu production must read the image-generation policy.");
assertContains(simpleRuns, /const canRunImageTasks = generateImages && hasSelectedImageTask\(draft\.imageTasks\)/, "Keyword/link/Feishu production must require enabled image generation and a selected image task.");
assertContains(simpleRuns, /canRunImageTasks[\s\S]*generateImagesFromPrompt\(imagePrompt,\s*1,\s*draft\.imageTasks/, "Keyword/link/Feishu production must call the image provider only when an image task can run.");
assertContains(simpleRuns, /resolveSimpleImageSkipMessage\(generateImages,\s*"simple run"\)/, "Keyword/link/Feishu production must explicitly skip image generation when disabled or no task is selected.");
assertContains(simpleRuns, /selectSimpleProductionItems\(rankedProductionCandidates,\s*normalizedInput\.targetCount,[\s\S]*requireVisualSource:\s*generateImages/, "Simple production must not require visual media when image generation is disabled.");
assertContains(simpleRuns, /const generateImages = shouldGenerateImages\(normalizedInput\)[\s\S]*const imitateImages = generateImages && normalizedInput\.viralImitateImages === true/, "Viral workflow must disable image imitation when image generation is off.");
assertContains(simpleRuns, /if \(sourceMode === "viral" && input\.generateImages !== false && input\.viralImitateImages === true/, "Viral validation must require material images only when image generation is enabled.");
assertContains(simpleRuns, /const imageResult = generateImages[\s\S]*generateImagesFromPromptList\(draft\.imagePrompts/, "Original workflow must call prompt-list image generation only when enabled.");
assertContains(simpleRuns, /makeImageGenerationSkippedResult\("Image generation is disabled for this original run\."\)/, "Original workflow must explicitly skip images when disabled.");

assertContains(types, /export const defaultSimpleRunMediaSettings:[\s\S]*generateImages:\s*true/, "Shared simple media defaults must keep image generation on.");
assertContains(page, /const \[simpleGenerateImages,\s*setSimpleGenerateImages\] = useState\(defaultSimpleRunMediaSettings\.generateImages\)/, "Simple UI must initialize image generation from shared defaults.");
assertContains(page, /generateImages:\s*simpleGenerateImages/, "Simple start request must send the image-generation switch.");
assertContains(page, /sourceMode === "viral" && simpleGenerateImages && simpleViralImitateImages/, "Simple UI must require viral material images only when image generation is enabled.");
assertContains(page, /generateImages=\{simpleGenerateImages\}/, "Simple workspace must receive the simple image-generation state.");
assertContains(page, /onGenerateImagesChange=\{\(value\) => updateSimpleRunMediaSettingsDraft\(\{\s*generateImages:\s*value\s*\}\)\}/, "Simple workspace must update the shared simple image-generation setting.");
assertContains(page, /checked=\{generateImages\}/, "Simple workspace checkbox must be bound to its image-generation prop.");
assertContains(page, /simpleGenerateImages \? normalizeImageSizeInput\(workspaceSettings\.imageSize\) : defaultImageGenerationSize/, "Simple UI must not validate image size when image generation is disabled.");

assertContains(checkPs1, /Image generation toggle check/, "Trellis baseline must include the image-generation toggle check.");

console.log("Image generation toggle check passed.");
