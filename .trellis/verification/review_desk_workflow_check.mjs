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

const reviewPage = read("src/app/review/page.tsx");
const reviewRoute = read("src/app/api/review/route.ts");
const reviewImageRoute = read("src/app/api/review/images/route.ts");
const reviewImageUpload = read("src/lib/review-image-upload.ts");
const mainPage = read("src/app/page.tsx");
const rootLayout = read("src/app/layout.tsx");
const themeHelper = read("src/lib/theme.ts");
const simpleRoute = read("src/app/api/simple/runs/route.ts");
const simpleRuns = read("src/lib/simple-runs.ts");
const types = read("src/lib/types.ts");
const globals = read("src/app/globals.css");
const approveDraftSource = reviewPage.match(/async function approveDraft\(\) \{[\s\S]*?\n  \}/)?.[0];
const uploadAdditionSource = reviewPage.match(/async function uploadDraftImageAddition\(file: File\) \{[\s\S]*?\n  \}/)?.[0];
const addTileSource = reviewPage.match(/function ReviewImageAddTile\([\s\S]*?\n}\n\nfunction /)?.[0];
const uploadPanelSource = reviewPage.match(/function ReviewImageUploadPanel\([\s\S]*?\n}\n\nfunction /)?.[0];

if (!approveDraftSource) {
  throw new Error("Review desk should define an approveDraft action.");
}

if (!uploadAdditionSource) {
  throw new Error("Review desk should define an uploadDraftImageAddition action.");
}

if (!addTileSource) {
  throw new Error("Review desk should define a ReviewImageAddTile trigger.");
}

if (!uploadPanelSource) {
  throw new Error("Review desk should define a ReviewImageUploadPanel dialog.");
}

assertContains(
  mainPage,
  /const \[simpleWriteFeishu,\s*setSimpleWriteFeishu\] = useState\(false\)/,
  "Compact/simple workflow should expose an auto-write Feishu switch that defaults off.",
);

assertContains(
  themeHelper,
  /export type ThemeMode = "professional" \| "editorial" \| "creator"/,
  "Theme helper should expose the same theme modes used by the main workspace and review desk.",
);

assertContains(
  themeHelper,
  /export const themeStorageKey = "fluxpost-theme"/,
  "Theme helper should keep the existing fluxpost-theme localStorage key.",
);

assertContains(
  mainPage,
  /from "@\/lib\/theme"/,
  "Main workspace should use the shared theme helper instead of route-local theme state.",
);

assertContains(
  rootLayout,
  /themeStorageKey[\s\S]*document\.documentElement\.dataset\.theme = theme/,
  "Root layout should apply the stored theme before route content renders.",
);

assertContains(
  reviewPage,
  /useSyncExternalStore\(subscribeTheme,\s*getStoredTheme[\s\S]*theme-switcher review-theme-switcher[\s\S]*setStoredTheme\(option\.value\)/,
  "Review desk should sync and expose the same theme switcher as the main workspace.",
);

assertContains(
  mainPage,
  /写入飞书[\s\S]*type="checkbox"[\s\S]*checked=\{writeFeishu\}/,
  "Compact/simple workflow should render a real checkbox switch for auto-writing Feishu.",
);

assertContains(
  mainPage,
  /writeFeishu:\s*simpleWriteFeishu/,
  "Compact/simple workflow should send the writeFeishu switch value to the simple-run API.",
);

assertContains(
  types,
  /writeFeishu\?:\s*boolean/,
  "SimpleRunInput should persist whether the run should write Feishu automatically.",
);

assertContains(
  simpleRoute,
  /writeFeishu:\s*body\.writeFeishu === true/,
  "Simple run API should default writeFeishu off unless explicitly enabled.",
);

assertContains(
  simpleRuns,
  /if \(!normalizedInput\.writeFeishu\)/,
  "Simple-run publish stage should skip Feishu enqueue when writeFeishu is false.",
);

assertNotContains(
  approveDraftSource,
  /window\.confirm\(/,
  "Approve action should pass review immediately without a confirmation dialog.",
);

assertContains(
  reviewPage,
  /function findNextUnreviewedPostId\(/,
  "Approve action should locate the next unreviewed generated post.",
);

assertContains(
  reviewPage,
  /const nextSelectedId = options\?\.nextPostId \|\| data\.post\.id;[\s\S]*await loadPosts\(nextSelectedId\)/,
  "Approve action should refresh and jump to the next unreviewed post after saving.",
);

assertContains(
  reviewPage,
  /await saveDraft\(\{ status: "approved" \}, undefined, \{ nextPostId \}\)/,
  "Approve action should save approval and pass the next unreviewed post id to the refresh step.",
);

assertContains(
  reviewPage,
  /timeFilter[\s\S]*keywordFilter[\s\S]*authorFilter[\s\S]*platformFilter/,
  "Review sidebar should keep separate filters for time, keyword, content author, and platform.",
);

assertContains(
  reviewPage,
  /onClick=\{\(\) => moveDraftImage\(index,\s*-1\)\}/,
  "Generated images should support moving earlier in the order.",
);

assertContains(
  reviewPage,
  /onClick=\{\(\) => removeDraftImage\(index\)\}/,
  "Generated images should support deletion before review approval.",
);

assertContains(
  reviewPage,
  /imagePromptByIndex/,
  "Review desk should keep editable per-image prompts for second-pass image regeneration.",
);

assertNotContains(
  reviewPage,
  /<FieldLabel label="图片 Prompt" \/>[\s\S]*value=\{draft\.imagePrompt\}[\s\S]*setDraft\(\{ \.\.\.draft,\s*imagePrompt:/,
  "Review desk should not render a redundant post-level image Prompt editor when per-image Prompt editing is available.",
);

assertContains(
  reviewPage,
  /regenerateDraftImage\(index\)/,
  "Each generated image should support prompt-driven regeneration from the review desk.",
);

assertContains(
  reviewPage,
  /onPaste=\{\(event\) => handleDraftImagePaste\(event,\s*index\)\}/,
  "Each generated image should accept pasted clipboard images for manual replacement.",
);

assertContains(
  reviewPage,
  /uploadDraftImageReplacement\(file,\s*index\)/,
  "Manual image replacement should upload a file before replacing the draft image URL.",
);

assertContains(
  reviewPage,
  /appendDraftImage\(data\.imageUrl/,
  "Manual image addition should append the uploaded image URL to the draft image list.",
);

assertContains(
  reviewPage,
  /form\.append\("mode",\s*"append"\)/,
  "Manual image addition should call the review image upload API in append mode.",
);

assertContains(
  uploadAdditionSource,
  /getPersistedPostImageCount\(posts,\s*draft\.id,\s*draft\.imageUrls\.length\)/,
  "Manual image addition should validate append uploads against the last persisted post image count, not unsaved draft additions.",
);

assertContains(
  uploadAdditionSource,
  /const displayImageIndex = draft\.imageUrls\.length/,
  "Manual image addition should still display the new local draft image position to the reviewer.",
);

assertContains(
  uploadAdditionSource,
  /form\.append\("imageIndex",\s*String\(uploadImageIndex\)\)/,
  "Manual image addition should send the persisted upload index to the review image upload API.",
);

assertContains(
  reviewPage,
  /const \[imageUploadPanelOpen,\s*setImageUploadPanelOpen\] = useState\(false\)/,
  "Review gallery should keep explicit state for the add-image upload panel.",
);

assertContains(
  reviewPage,
  /<ReviewImageAddTile[\s\S]*onOpen=\{\(\) => setImageUploadPanelOpen\(true\)\}/,
  "Review gallery add tile should open the upload panel instead of directly selecting a file.",
);

assertNotContains(
  addTileSource,
  /type="file"/,
  "Review image add tile should be a panel trigger, not a hidden file input.",
);

assertContains(
  reviewPage,
  /<ReviewImageUploadPanel[\s\S]*open=\{imageUploadPanelOpen\}[\s\S]*onClose=\{\(\) => setImageUploadPanelOpen\(false\)\}[\s\S]*onChange=\{handleDraftImageAddFileChange\}[\s\S]*onPaste=\{handleDraftImageAddPaste\}[\s\S]*onDrop=\{handleDraftImageAddDrop\}/,
  "Review image upload panel should receive local-file, paste, and drop handlers.",
);

assertContains(
  reviewPage,
  /function handleDraftImageAddDrop\(event: DragEvent<HTMLElement>\)[\s\S]*getDataTransferImageFile\(event\.dataTransfer\)[\s\S]*uploadDraftImageAddition\(file\)/,
  "Review image upload panel should support adding an image by drag-and-drop.",
);

assertContains(
  uploadPanelSource,
  /role="dialog"[\s\S]*aria-modal="true"/,
  "Review image upload panel should render as an accessible dialog.",
);

assertContains(
  uploadPanelSource,
  /type="file"[\s\S]*onChange=\{\(event\) => onChange\(event\)\}/,
  "Review image upload panel should include local file import.",
);

assertContains(
  uploadPanelSource,
  /onPaste=\{onPaste\}[\s\S]*onDragOver=\{handleDragOver\}[\s\S]*onDrop=\{onDrop\}/,
  "Review image upload panel should expose paste and drag-drop import zones.",
);

assertContains(
  reviewPage,
  /Plus/,
  "Review gallery should use a visible plus icon for adding images.",
);

assertContains(
  reviewPage,
  /fetch\("\/api\/images"[\s\S]*body:\s*JSON\.stringify\(\{ prompt,\s*count:\s*1 \}\)/,
  "Per-image regeneration should reuse the existing image generation API with a single-image request.",
);

assertContains(
  reviewPage,
  /FormData[\s\S]*fetch\("\/api\/review\/images"/,
  "Manual image replacement should use the review image upload API with multipart form data.",
);

assertContains(
  reviewPage,
  /value=\{draft\.feishuVehicle \?\? draft\.taskKeyword \?\? ""\}/,
  "Feishu vehicle selection should default to the draft keyword while preserving manual selection.",
);

assertContains(
  reviewRoute,
  /"imageUrls" \| "imageTasks" \| "feishuVehicle"/,
  "Review API should continue allowing image order/deletion and Feishu vehicle updates.",
);

assertContains(
  reviewImageRoute,
  /requireWorkspaceAccount\(request\)/,
  "Review image upload API should require a signed-in workspace account before accepting files.",
);

assertContains(
  reviewImageRoute,
  /saveReviewImageUpload\(file\)/,
  "Review image upload API should delegate local media persistence to the review image helper.",
);

assertContains(
  reviewImageRoute,
  /mode\s*===\s*"append"/,
  "Review image upload API should accept append mode for adding a new image to a post.",
);

assertContains(
  reviewImageRoute,
  /imageIndex >= post\.imageUrls\.length\) && mode !== "append"/,
  "Review image upload API should keep replacement index validation while allowing append uploads without an existing slot.",
);

assertContains(
  reviewImageRoute,
  /mode === "append" && imageIndex !== post\.imageUrls\.length/,
  "Review image upload API should only accept append uploads at the current end-of-list image index.",
);

assertContains(
  reviewImageUpload,
  /sniffImageFormat\(buffer\)/,
  "Review image upload helper should sniff image bytes before writing browser-visible media.",
);

assertContains(
  reviewImageUpload,
  /public",\s*"generated",\s*"review-uploads"/,
  "Review image uploads should be written under public/generated/review-uploads.",
);

assertContains(
  globals,
  /\.simple-write-feishu-row\s*\{/,
  "Simple auto-write switch should have a compact simple-write-feishu-row style.",
);

assertContains(
  globals,
  /\.review-gallery-tools\s*\{/,
  "Review image ordering/deletion controls should have stable gallery tool styling.",
);

assertContains(
  globals,
  /\.review-upload-backdrop\s*\{/,
  "Review image upload panel should have a modal backdrop style.",
);

assertContains(
  globals,
  /\.review-upload-dropzone\s*\{/,
  "Review image upload panel should style a stable drag-and-drop import zone.",
);

assertContains(
  globals,
  /@media \(min-width:\s*1120px\)[\s\S]*\.review-main\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto auto;[\s\S]*overflow:\s*hidden;/,
  "Desktop review panel should reserve visible rows for title/actions while the editor content scrolls internally.",
);

assertContains(
  globals,
  /@media \(min-width:\s*1120px\)[\s\S]*\.review-editor-grid\s*\{[\s\S]*min-height:\s*0;[\s\S]*overflow:\s*hidden;/,
  "Desktop review editor grid should not expand the review panel when many images are present.",
);

assertContains(
  globals,
  /@media \(min-width:\s*1120px\)[\s\S]*\.review-gallery,[\s\S]*\.review-editor-fields\s*\{[\s\S]*min-height:\s*0;[\s\S]*overflow-y:\s*auto;/,
  "Desktop review image and text columns should scroll independently so action buttons remain reachable.",
);

console.log("Review desk workflow check passed.");
