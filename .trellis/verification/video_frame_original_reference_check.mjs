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
const sourceLinkImport = read("src/lib/source-link-import.ts");
const creationControls = read("src/lib/creation-controls.ts");
const crawlLinksRoute = read("src/app/api/crawl/links/route.ts");
const page = read("src/app/page.tsx");
const checkPs1 = read(".trellis/verification/check.ps1");

assertContains(types, /NormalizedSourceItem[\s\S]*videoFrameOriginalReference\?:\s*boolean/, "NormalizedSourceItem must persist the video-frame original-reference import preference.");
assertContains(sourceLinkImport, /videoFrameOriginalReference\?:\s*boolean/, "Source-link import inputs must accept the video-frame original-reference switch.");
assertContains(sourceLinkImport, /applyVideoFrameOriginalReferencePreference/, "Source-link import must explicitly apply the video-frame original-reference preference.");
assertContains(sourceLinkImport, /input\.videoFrameOriginalReference !== false/, "Source-link import must default the video-frame original-reference switch on.");
assertContains(sourceLinkImport, /item\.mediaType === "video"[\s\S]*item\.mediaType === "mixed"[\s\S]*item\.videoUrl[\s\S]*item\.downloadedVideoUrl[\s\S]*item\.videoFrames\?\.length/, "Source-link import must limit the preference to video-like imported sources.");

assertContains(creationControls, /source\.videoFrameOriginalReference === true/, "Video frame task construction must require an explicit source preference before forcing keep mode.");
assertContains(creationControls, /kind:\s*"video_frame" as const/, "Video frame original-reference behavior must apply to video frame tasks.");
assertContains(creationControls, /mode:\s*source\.videoFrameOriginalReference === true \? "keep" : "wash"/, "Video frame original-reference tasks must keep the source frame when the switch is enabled.");
assertContains(creationControls, /prompt:\s*source\.videoFrameOriginalReference === true \? "" : prompt/, "Video frame original-reference tasks must clear the image prompt when the switch is enabled.");
assertContains(creationControls, /return frameTasks\.slice\(0,\s*maxVideoHighlightFrames\)/, "Video frame original-reference behavior must keep the shared highlight-frame cap.");

assertContains(crawlLinksRoute, /videoFrameOriginalReference\?:\s*boolean/, "Advanced source-link API must accept the video-frame original-reference switch.");
assertContains(crawlLinksRoute, /videoFrameOriginalReference:\s*body\.videoFrameOriginalReference !== false/, "Advanced source-link API must default the video-frame original-reference switch on.");
assertContains(page, /linkImportVideoFrameOriginalReference/, "Advanced source-link UI must expose the video-frame original-reference switch state.");
assertContains(page, /videoFrameOriginalReference:\s*linkImportVideoFrameOriginalReference/, "Advanced source-link request payload must send the video-frame original-reference switch.");

assertContains(checkPs1, /Video frame original-reference check/, "Trellis baseline must include the video-frame original-reference check.");

console.log("Video frame original-reference check passed.");
