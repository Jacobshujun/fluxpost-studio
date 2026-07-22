import { existsSync, readFileSync } from "node:fs";
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

const contentPagePath = path.join(projectRoot, "src/app/content/page.tsx");
if (!existsSync(contentPagePath)) {
  throw new Error("/content page should exist at src/app/content/page.tsx.");
}

const contentPage = read("src/app/content/page.tsx");
const mainPage = read("src/app/page.tsx");
const globals = read("src/app/globals.css");
const types = read("src/lib/types.ts");
const simpleRoute = read("src/app/api/simple/runs/route.ts");
const simpleRuns = read("src/lib/simple-runs.ts");
const checkPs1 = read(".trellis/verification/check.ps1");

assertContains(contentPage, /fetch\(`?\/api\/content-pool/, "/content should read the owner-scoped content pool API.");
assertContains(contentPage, /fetch\("\/api\/crawl\/jobs"/, "/content should keep keyword crawl entry.");
assertContains(contentPage, /fetch\("\/api\/crawl\/links"/, "/content should keep source-link import entry.");
assertContains(contentPage, /fetch\("\/api\/simple\/runs"/, "/content should start simple-run secondary creation.");

assertContains(contentPage, /sourceMode:\s*"pool"/, "Content-pool secondary creation should send sourceMode=pool.");
assertContains(contentPage, /sourceItemIds:\s*selectedContentItemIds/, "Content-pool secondary creation should send selected source item ids.");
assertContains(contentPage, /writeFeishu:\s*false/, "Content-pool secondary creation must be review-first and not auto-write Feishu.");
assertContains(contentPage, /生成待审草稿[\s\S]*内容审查台/, "Content-pool secondary creation UI should explain review-desk flow.");
assertContains(contentPage, /formatSimpleRunSourceLabel[\s\S]*sourceMode === "pool"[\s\S]*内容池/, "/content run summaries should label pool sources as content-pool items.");

assertContains(types, /sourceMode\?:\s*"keyword"\s*\|\s*"links"\s*\|\s*"feishu"\s*\|\s*"viral"\s*\|\s*"original"\s*\|\s*"pool"/, "SimpleRunInput should include pool source mode.");
assertContains(types, /sourceItemIds\?:\s*string\[\]/, "SimpleRunInput should persist selected content-pool source item ids.");

assertContains(simpleRoute, /sourceMode\?:\s*"keyword"\s*\|\s*"links"\s*\|\s*"feishu"\s*\|\s*"viral"\s*\|\s*"original"\s*\|\s*"pool"/, "Simple-run route should accept pool source mode.");
assertContains(simpleRoute, /sourceItemIds\?:\s*string\[\]/, "Simple-run route should parse sourceItemIds.");
assertContains(simpleRoute, /sourceItemIds:\s*Array\.isArray\(body\.sourceItemIds\) \? body\.sourceItemIds : \[\]/, "Simple-run route should forward sourceItemIds through the thin route layer.");
assertContains(simpleRoute, /body\.sourceMode === "pool" \? "pool"/, "Simple-run route should preserve pool source mode mapping.");

assertContains(simpleRuns, /import \{ calculateHotScore,\s*getSourceItemsByIds,[\s\S]*\} from "\.\/content-pool"/, "Simple-run domain should load content-pool items through the content-pool domain.");
assertContains(simpleRuns, /function isSimpleRunPoolMode\(input: SimpleRunInput\)[\s\S]*input\.sourceMode === "pool"/, "Simple-run domain should identify pool mode.");
assertContains(simpleRuns, /collectSimplePoolItems\(run,\s*crawledItems,\s*normalizedInput\)/, "Simple-run workflow should branch to pool collection.");
assertContains(simpleRuns, /getSourceItemsByIds\(sourceItemIds,\s*simpleRunAccessActor\(normalizedInput\)\)/, "Pool collection should use owner-scoped content-pool reads.");
assertContains(simpleRuns, /sourceMode === "pool" && !sourceItemIds\.length/, "Pool mode should reject empty sourceItemIds.");
assertContains(simpleRuns, /sourceMode === "pool"\s*\?\s*false\s*:\s*input\.writeFeishu === true/, "Pool mode should force writeFeishu off.");
assertContains(simpleRuns, /sourceMode === "pool"[\s\S]*sourceItemIds\.length/, "Pool mode target count should be bounded by selected sourceItemIds.");
assertContains(simpleRuns, /makePoolStageTitles/, "Pool mode should use pool-specific stage titles.");
assertContains(simpleRuns, /message:\s*`内容池取样/, "Pool progress should not describe pool mode as keyword crawling.");

assertContains(mainPage, /href="\/content"/, "Main workspace should expose a /content entry.");
assertNotContains(mainPage, /ActiveModule|ProductionWorkspace|WorkspaceModeSwitcher/, "Main workspace should not retain removed mode or production modules.");
assertContains(contentPage, /type ContentDeskView = "content" \| "materials"/, "/content should own the content/material view switch.");
assertContains(contentPage, /function MaterialLibraryWorkspace\(/, "/content should own material-library management.");

assertContains(globals, /\.content-desk-shell\s*\{/, "Global CSS should define the /content shell.");
assertContains(globals, /\.content-desk-workspace\s*\{[\s\S]*display:\s*grid/, "Global CSS should define the /content workbench grid.");
assertContains(globals, /\.content-desk-material-workspace\s*\{[\s\S]*display:\s*grid/, "Global CSS should define the /content material workbench grid.");
assertContains(globals, /\.content-desk-source-card-active\s*\{/, "Global CSS should define selected content-pool card styling.");

assertContains(checkPs1, /Content desk check/, "Trellis baseline should include the content desk check.");

assertContains(contentPage, /poolGenerateImages,\s*setPoolGenerateImages/, "/content should expose a secondary-creation image-generation option.");
assertContains(contentPage, /poolUseComfyUiKlein,\s*setPoolUseComfyUiKlein/, "/content should expose the simple-run ComfyUI Klein option for pool secondary creation.");
assertContains(contentPage, /poolDirectOriginalReference,\s*setPoolDirectOriginalReference/, "/content should expose the simple-run direct original-reference option for pool secondary creation.");
assertContains(contentPage, /poolIncludeSourceVideo,\s*setPoolIncludeSourceVideo/, "/content should expose the simple-run source-video option for pool secondary creation.");
assertContains(contentPage, /poolEnableVideoTranscription,\s*setPoolEnableVideoTranscription/, "/content should expose the simple-run video-transcription option for pool secondary creation.");
assertContains(contentPage, /generateImages:\s*poolGenerateImages/, "Pool secondary creation should forward the image-generation toggle.");
assertContains(contentPage, /useComfyUiKlein:\s*poolUseComfyUiKlein/, "Pool secondary creation should forward the ComfyUI Klein toggle.");
assertContains(contentPage, /directOriginalReference:\s*poolDirectOriginalReference/, "Pool secondary creation should forward the direct original-reference toggle.");
assertContains(contentPage, /includeSourceVideo:\s*poolIncludeSourceVideo/, "Pool secondary creation should forward the source-video toggle.");
assertContains(contentPage, /enableVideoTranscription:\s*poolEnableVideoTranscription/, "Pool secondary creation should forward the video-transcription toggle.");
assertContains(contentPage, /settings:\s*workspaceSettings/, "Pool secondary creation should sync workspace prompt and image settings to the simple-run payload.");

console.log("Content desk check passed.");
