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
const contentPage = read("src/app/content/page.tsx");
const route = read("src/app/api/simple/runs/route.ts");
const simpleRuns = read("src/lib/simple-runs.ts");
const workspaceSettings = read("src/lib/workspace-settings.ts");
const types = read("src/lib/types.ts");

assertContains(
  page,
  /body:\s*JSON\.stringify\(\{[\s\S]*materialPaths:\s*materialLibraryAssetPaths[\s\S]*settings:\s*settingsForRun/,
  "Compact start request must include the current material-library paths.",
);

assertContains(
  page,
  /<ImageSizeInput[\s\S]*value=\{settings\.imageSize\}[\s\S]*onChange=\{\(value\) => props\.onSettingsChange\(\{\s*imageSize:\s*value\s*\}\)\}[\s\S]*ariaLabel="[^"]+"[\s\S]*listId="compact-image-size-presets"/,
  "Compact mode should expose a manual GPT image-size input and write into workspace settings.",
);

assertContains(
  route,
  /materialPaths\?:\s*string\[\]/,
  "Simple run API request body should accept materialPaths.",
);
assertContains(
  route,
  /materialPaths:\s*Array\.isArray\(body\.materialPaths\)\s*\?\s*body\.materialPaths\s*:\s*\[\]/,
  "Simple run API should pass materialPaths through to startSimpleRun.",
);

assertContains(
  types,
  /export type SimpleRunInput = \{[\s\S]*materialPaths:\s*string\[\]/,
  "SimpleRunInput should persist the material paths used by a simple run.",
);

assertContains(
  simpleRuns,
  /materialPaths:\s*normalizeMaterialPaths\(input\.materialPaths\)/,
  "Simple run input normalization should keep material paths.",
);
assertContains(
  simpleRuns,
  /materialPaths:\s*normalizedInput\.materialPaths/,
  "Simple-mode generatePost should receive normalized material paths.",
);
assertContains(
  simpleRuns,
  /materialCount:\s*normalizedInput\.materialPaths\.length/,
  "Simple run activity log should record material path count without exposing paths.",
);

assertContains(
  types,
  /export type SimpleRunMediaSettings = \{[\s\S]*generateImages:\s*boolean[\s\S]*useComfyUiKlein:\s*boolean[\s\S]*directOriginalReference:\s*boolean[\s\S]*includeSourceVideo:\s*boolean[\s\S]*enableVideoTranscription:\s*boolean[\s\S]*\}/,
  "Shared types should define the simple-run media option bundle.",
);
assertContains(
  types,
  /export const defaultSimpleRunMediaSettings:\s*SimpleRunMediaSettings = \{[\s\S]*generateImages:\s*true[\s\S]*useComfyUiKlein:\s*false[\s\S]*directOriginalReference:\s*false[\s\S]*includeSourceVideo:\s*false[\s\S]*enableVideoTranscription:\s*false[\s\S]*\}/,
  "Shared types should define default simple-run media options.",
);
assertContains(
  types,
  /export type WorkspacePromptSettings = \{[\s\S]*simpleRunMediaSettings:\s*SimpleRunMediaSettings/,
  "WorkspacePromptSettings should persist simple-run media option defaults.",
);
assertContains(
  workspaceSettings,
  /simpleRunMediaSettings:\s*defaultSimpleRunMediaSettings/,
  "Workspace prompt defaults should include simple-run media option defaults.",
);
assertContains(
  workspaceSettings,
  /function normalizeSimpleRunMediaSettings\(input: unknown\): SimpleRunMediaSettings[\s\S]*generateImages:\s*booleanOrDefault\(record\.generateImages,\s*defaultSimpleRunMediaSettings\.generateImages\)[\s\S]*useComfyUiKlein:\s*booleanOrDefault\(record\.useComfyUiKlein,\s*defaultSimpleRunMediaSettings\.useComfyUiKlein\)[\s\S]*directOriginalReference:\s*booleanOrDefault\(record\.directOriginalReference,\s*defaultSimpleRunMediaSettings\.directOriginalReference\)[\s\S]*includeSourceVideo:\s*booleanOrDefault\(record\.includeSourceVideo,\s*defaultSimpleRunMediaSettings\.includeSourceVideo\)[\s\S]*enableVideoTranscription:\s*booleanOrDefault\(record\.enableVideoTranscription,\s*defaultSimpleRunMediaSettings\.enableVideoTranscription\)/,
  "Workspace settings normalization should preserve all simple-run media options with safe defaults.",
);

assertContains(
  page,
  /function applySimpleRunMediaSettings\(mediaSettings: SimpleRunMediaSettings\)[\s\S]*setSimpleGenerateImages\(mediaSettings\.generateImages\)[\s\S]*setSimpleUseComfyUiKlein\(mediaSettings\.useComfyUiKlein\)[\s\S]*setSimpleDirectOriginalReference\(mediaSettings\.directOriginalReference\)[\s\S]*setSimpleIncludeSourceVideo\(mediaSettings\.includeSourceVideo\)[\s\S]*setSimpleEnableVideoTranscription\(mediaSettings\.enableVideoTranscription\)/,
  "Main simple workspace should apply saved simple-run media defaults when settings load.",
);
assertContains(
  page,
  /applySimpleRunMediaSettings\(data\.settings\.simpleRunMediaSettings\)/,
  "Main simple workspace should load saved media defaults from workspace settings.",
);
assertContains(
  page,
  /function updateSimpleRunMediaSettingsDraft\(patch: Partial<SimpleRunMediaSettings>\)[\s\S]*const simpleRunMediaSettings = \{ \.\.\.defaultSimpleRunMediaSettings, \.\.\.workspaceSettings\.simpleRunMediaSettings, \.\.\.patch \}[\s\S]*setWorkspaceSettings\(\(current\) => \(\{ \.\.\.current, simpleRunMediaSettings \}\)\)/,
  "Main simple workspace media toggles should update the shared workspace settings draft.",
);
assertContains(
  page,
  /const simpleRunMediaSettings: SimpleRunMediaSettings = \{[\s\S]*generateImages:\s*simpleGenerateImages[\s\S]*useComfyUiKlein:\s*simpleUseComfyUiKlein[\s\S]*directOriginalReference:\s*simpleDirectOriginalReference[\s\S]*includeSourceVideo:\s*simpleIncludeSourceVideo[\s\S]*enableVideoTranscription:\s*simpleEnableVideoTranscription[\s\S]*\}/,
  "Simple-run launch should persist the current media toggles into workspace settings.",
);
assertContains(
  page,
  /settingsForRun: WorkspacePromptSettings = \{[\s\S]*simpleRunMediaSettings,/,
  "Simple-run launch settings should include the current media option defaults.",
);
assertContains(
  page,
  /onUseComfyUiKleinChange=\{\(value\) => updateSimpleRunMediaSettingsDraft\(\{\s*useComfyUiKlein:\s*value\s*\}\)\}/,
  "Simple UI ComfyUI switch should write into shared media defaults.",
);
assertContains(
  page,
  /onDirectOriginalReferenceChange=\{\(value\) => updateSimpleRunMediaSettingsDraft\(\{\s*directOriginalReference:\s*value\s*\}\)\}/,
  "Simple UI direct original-reference switch should write into shared media defaults.",
);
assertContains(
  page,
  /onIncludeSourceVideoChange=\{\(value\) => updateSimpleRunMediaSettingsDraft\(\{\s*includeSourceVideo:\s*value\s*\}\)\}/,
  "Simple UI source-video switch should write into shared media defaults.",
);
assertContains(
  page,
  /onEnableVideoTranscriptionChange=\{\(value\) => updateSimpleRunMediaSettingsDraft\(\{\s*enableVideoTranscription:\s*value\s*\}\)\}/,
  "Simple UI video-transcription switch should write into shared media defaults.",
);
assertContains(
  page,
  /onGenerateImagesChange=\{\(value\) => updateSimpleRunMediaSettingsDraft\(\{\s*generateImages:\s*value\s*\}\)\}/,
  "Simple UI image-generation switch should write into shared media defaults.",
);

assertContains(
  contentPage,
  /function applyPoolSimpleRunMediaSettings\(mediaSettings: SimpleRunMediaSettings\)[\s\S]*setPoolGenerateImages\(mediaSettings\.generateImages\)[\s\S]*setPoolUseComfyUiKlein\(mediaSettings\.useComfyUiKlein\)[\s\S]*setPoolDirectOriginalReference\(mediaSettings\.directOriginalReference\)[\s\S]*setPoolIncludeSourceVideo\(mediaSettings\.includeSourceVideo\)[\s\S]*setPoolEnableVideoTranscription\(mediaSettings\.enableVideoTranscription\)/,
  "/content should apply shared simple-run media defaults to pool secondary creation.",
);
assertContains(
  contentPage,
  /applyPoolSimpleRunMediaSettings\(data\.settings\.simpleRunMediaSettings\)/,
  "/content should load saved simple-run media defaults from workspace settings.",
);
assertContains(
  contentPage,
  /const poolMediaSettings: SimpleRunMediaSettings = \{[\s\S]*generateImages:\s*poolGenerateImages[\s\S]*useComfyUiKlein:\s*poolUseComfyUiKlein[\s\S]*directOriginalReference:\s*poolDirectOriginalReference[\s\S]*includeSourceVideo:\s*poolIncludeSourceVideo[\s\S]*enableVideoTranscription:\s*poolEnableVideoTranscription[\s\S]*\}/,
  "/content pool secondary creation should include the current media switches in the workspace settings payload.",
);
assertContains(
  contentPage,
  /simpleRunMediaSettings:\s*poolMediaSettings/,
  "/content should forward pool media switches through settings so simple-run persistence stays in sync.",
);

console.log("Simple/advanced production config sync check passed.");
