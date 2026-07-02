import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assertContains(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

const page = read("src/app/page.tsx");
const route = read("src/app/api/simple/runs/route.ts");
const simpleRuns = read("src/lib/simple-runs.ts");
const sourceLinkImport = read("src/lib/source-link-import.ts");
const types = read("src/lib/types.ts");
const checkPs1 = read("scripts/harness/check.ps1");

assertContains(types, /sourceMode\?:\s*"keyword"\s*\|\s*"links"\s*\|\s*"feishu"/, "SimpleRunInput must persist keyword/link/Feishu source mode.");
assertContains(types, /links\?:\s*string\[\]/, "SimpleRunInput must persist source links for link-mode simple runs.");
assertContains(types, /videoFrameOriginalReference\?:\s*boolean/, "SimpleRunInput must persist the video-frame original-reference switch.");
assertContains(types, /useComfyUiKlein\?:\s*boolean/, "SimpleRunInput must persist the Klein routing switch.");
assertContains(types, /directOriginalReference\?:\s*boolean/, "SimpleRunInput must persist the direct-original switch.");
assertContains(types, /enableVideoTranscription\?:\s*boolean/, "SimpleRunInput must persist the video transcription switch.");
assertContains(types, /cookie\?:\s*string/, "SimpleRunInput must persist request-only link-mode cookies.");
assertContains(types, /linkResults\?:\s*SimpleRunLinkResult\[\]/, "SimpleRun should persist per-link results.");

assertContains(sourceLinkImport, /export async function resolveSourceLinks/, "Source-link import should expose a reusable resolver for simple runs.");

assertContains(route, /sourceMode\?:\s*"keyword"\s*\|\s*"links"\s*\|\s*"feishu"/, "Simple run API should accept sourceMode.");
assertContains(route, /links\?:\s*string\[\]\s*\|\s*string/, "Simple run API should accept batch links.");
assertContains(route, /videoFrameOriginalReference\?:\s*boolean/, "Simple run API should accept the video-frame original-reference switch.");
assertContains(route, /useComfyUiKlein\?:\s*boolean/, "Simple run API should accept the Klein routing switch.");
assertContains(route, /directOriginalReference\?:\s*boolean/, "Simple run API should accept the direct-original switch.");
assertContains(route, /enableVideoTranscription\?:\s*boolean/, "Simple run API should accept the video transcription switch.");
assertContains(route, /cookie\?:\s*string/, "Simple run API should accept a request-only link cookie.");
assertContains(route, /baseSourceMode\s*=\s*body\.sourceMode === "feishu" \? "feishu" : body\.sourceMode === "links" \? "links" : "keyword"/, "Simple run API must preserve link-mode source mapping.");
assertContains(route, /sourceMode:\s*body\.sourceMode === "original" \? "original" : body\.sourceMode === "viral" \? "viral" : baseSourceMode/, "Simple run API must forward the resolved source mode.");
assertContains(route, /links:\s*body\.links/, "Simple run API must forward source links.");
assertContains(route, /videoFrameOriginalReference:\s*body\.videoFrameOriginalReference !== false/, "Simple run API must default the video-frame original-reference switch on.");
assertContains(route, /useComfyUiKlein:\s*body\.useComfyUiKlein === true/, "Simple run API must default Klein routing off unless explicitly enabled.");
assertContains(route, /directOriginalReference:\s*body\.directOriginalReference === true/, "Simple run API must default direct-original off unless explicitly enabled.");
assertContains(route, /enableVideoTranscription:\s*body\.enableVideoTranscription === true/, "Simple run API must default video transcription off.");
assertContains(route, /cookie:\s*body\.cookie/, "Simple run API must forward the request-only link cookie.");

assertContains(simpleRuns, /isSimpleRunLinkMode\(normalizedInput\)[\s\S]*collectSimpleLinkItems/, "Simple run workflow must branch into link collection.");
assertContains(simpleRuns, /resolveSourceLinks\(\{[\s\S]*links,[\s\S]*platform:/, "Link-mode simple runs must reuse the source-link resolver.");
assertContains(simpleRuns, /videoFrameOriginalReference:\s*normalizedInput\.videoFrameOriginalReference !== false/, "Link-mode simple runs must forward the video-frame original-reference switch to source-link resolution.");
assertContains(simpleRuns, /useComfyUiKlein:\s*input\.useComfyUiKlein === true/, "Simple runs must normalize the Klein routing switch.");
assertContains(simpleRuns, /directOriginalReference:\s*sourceMode === "viral" \? undefined : input\.directOriginalReference === true/, "Simple runs must normalize direct-original only for non-viral runs.");
assertContains(simpleRuns, /buildDefaultImageTasks\(source,\s*settings\.imageStrategyPrompts,\s*\{[\s\S]*useComfyUiKlein:\s*input\.useComfyUiKlein === true && isComfyUiKleinConfigured\(\)[\s\S]*directOriginalReference:\s*input\.directOriginalReference === true/, "Simple production image tasks must use persisted image policy switches.");
assertContains(simpleRuns, /enableVideoTranscription:\s*normalizedInput\.enableVideoTranscription === true/, "Simple runs must forward explicit video transcription opt-in to collection.");
assertContains(simpleRuns, /cookie:\s*normalizedInput\.cookie/, "Link-mode simple runs must forward request-only cookies to source-link resolution.");
assertContains(simpleRuns, /cookie:\s*sourceMode === "links" \? normalizeRequestCookie\(input\.cookie\) : undefined/, "Simple runs must normalize cookies only for link mode.");
assertContains(simpleRuns, /hasCookie:\s*Boolean\(normalizedInput\.cookie\)/, "Simple-run logs may record cookie presence but must not record cookie content.");
assertContains(simpleRuns, /sourceMode === "links" && !links\.length/, "Link-mode input validation must require source links.");
assertContains(simpleRuns, /sourceMode === "keyword" && !platforms\.length/, "Keyword-mode input validation must keep requiring platforms.");
assertContains(simpleRuns, /sourceMode === "feishu"[\s\S]*Math\.min\(targetCount,\s*feishuTaskNumbers\.length\)[\s\S]*sourceMode === "links"[\s\S]*Math\.min\(targetCount,\s*links\.length\)/, "Link-mode target count should be bounded by link count.");
assertContains(simpleRuns, /applyUnsafeFilterLinkResults/, "Simple link results should reflect source-safety filtering.");

assertContains(page, /type SimpleSourceMode = "keyword" \| "links" \| "feishu"/, "Simple UI should define keyword/link/Feishu modes.");
assertContains(page, /simpleSourceMode/, "Simple UI should keep source mode state.");
assertContains(page, /simpleLinkText/, "Simple UI should keep controlled source-link textarea state.");
assertContains(page, /simpleVideoFrameOriginalReference/, "Simple UI should keep controlled video-frame original-reference switch state.");
assertContains(page, /simpleUseComfyUiKlein/, "Simple UI should keep controlled Klein routing switch state.");
assertContains(page, /simpleDirectOriginalReference/, "Simple UI should keep controlled direct-original switch state.");
assertContains(page, /simpleEnableVideoTranscription/, "Simple UI should keep controlled video transcription switch state.");
assertContains(page, /批量导入链接/, "Simple and compact UI should expose the batch-link entry.");
assertContains(page, /sourceMode,\s*\n\s*keyword:/, "Simple start request must send source mode and keyword.");
assertContains(page, /links:\s*sourceMode === "links" \? links : undefined/, "Simple start request must send link-mode payload.");
assertContains(page, /videoFrameOriginalReference:\s*sourceMode === "links" \? simpleVideoFrameOriginalReference : undefined/, "Simple start request must send the video-frame original-reference switch for link mode.");
assertContains(page, /useComfyUiKlein:\s*simpleUseComfyUiKlein/, "Simple start request must send the Klein routing switch.");
assertContains(page, /directOriginalReference:\s*sourceMode === "viral" \|\| sourceMode === "original" \? undefined : simpleDirectOriginalReference/, "Simple start request must send the direct-original switch for non-viral/original runs.");
assertContains(page, /enableVideoTranscription:\s*simpleEnableVideoTranscription/, "Simple start request must send the video transcription switch.");
assertContains(page, /cookie:\s*sourceMode === "links" && simpleLinkPlatform === "dongchedi" \? cookie : undefined/, "Simple start request must send Cookie only for Dongchedi link mode.");
assertContains(page, /\(linkImportPlatform === "douyin" \|\| linkImportPlatform === "dongchedi"\)/, "Advanced source-link import should expose Cookie for Douyin and Dongchedi.");
assertContains(page, /cookie:\s*linkImportPlatform === "douyin" \|\| linkImportPlatform === "dongchedi" \? cookie : undefined/, "Advanced source-link import must send Cookie for Douyin and Dongchedi.");
assertContains(page, /linkPlatform === "dongchedi"[\s\S]*<FieldLabel label="Cookie" \/>/, "Simple and compact link-mode UI should expose Cookie for Dongchedi.");
assertContains(page, /variant=\{workspaceMode === "compact" \? "compact" : "standard"\}[\s\S]*sourceMode=\{simpleSourceMode\}[\s\S]*linkText=\{simpleLinkText\}/, "Compact and simple variants must share the link-mode props.");

assertContains(checkPs1, /Simple link run check/, "Harness baseline must include the simple link run check.");

console.log("Simple link run check passed.");
