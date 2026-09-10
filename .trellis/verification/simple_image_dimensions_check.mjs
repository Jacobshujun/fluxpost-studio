import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const contracts = load("src/lib/image-providers/contracts.ts");
const toApis = load("src/lib/toapis-image-api.ts", { "./image-providers/contracts": contracts });
const dimensions = load("src/lib/gpt-image-dimensions.ts", { "./toapis-image-api": toApis });
const imageSizes = load("src/lib/image-size-options.ts");
const types = load("src/lib/types.ts");
let stored = JSON.stringify({ imageSize: "1200x1600" });
let writes = 0;
const prompts = { carExterior: "car", textImage: "text", peopleWithCar: "people" };
const workspace = load("src/lib/workspace-settings.ts", {
  "./creation-controls": { defaultImageStrategyPrompts: prompts, defaultImageWashPrompt: "wash", resolveImageStrategyPrompts: (value) => ({ ...prompts, ...value }) },
  "./database": { readAppMetaValue: async () => stored, writeAppMetaValue: async (_key, value) => { stored = value; writes++; } },
  "./distribution-check-prompt": { defaultDistributionCheckPrompt: "distribution" },
  "./image-size-options": imageSizes,
  "./gpt-image-dimensions": dimensions,
  "./types": types,
});

const legacy = await workspace.getWorkspacePromptSettings();
assert.equal(legacy.imageSize, "1200x1600");
assert.equal(legacy.imageRatio, undefined, "Old exact pixels must not silently become ratio mode");
assert.equal(legacy.imageResolution, undefined);
assert.equal(legacy.imageQuality, "medium");
assert.equal(legacy.imageBackground, "auto");
assert.throws(() => dimensions.resolveGptImageDimensionSettings(legacy), /请选择/);
assert.equal(writes, 0, "Reading legacy settings must not migrate runtime data");

for (const resolution of toApis.toApisImageResolutions) {
  for (const ratio of toApis.toApisImageRatios) {
    const allowed = resolution !== "4k" || toApis.toApis4kImageRatios.includes(ratio);
    if (!allowed) {
      const previous = stored;
      await assert.rejects(workspace.saveWorkspacePromptSettings({ imageRatio: ratio, imageResolution: resolution }), /4K does not support/);
      assert.equal(stored, previous);
      continue;
    }
    const selection = dimensions.resolveGptImageDimensionSettings({ imageRatio: ratio, imageResolution: resolution });
    const saved = await workspace.saveWorkspacePromptSettings(selection);
    const restored = await workspace.getWorkspacePromptSettings();
    assert.equal(restored.imageRatio, ratio);
    assert.equal(restored.imageResolution, resolution);
    assert.equal(restored.imageSize, saved.imageSize);
    const body = toApis.buildToApisGenerationBody({ model: "fixture", prompt: "fixture", requestedSize: restored.imageSize, ratio: restored.imageRatio, resolution: restored.imageResolution });
    assert.equal(body.size, ratio);
    assert.equal(body.resolution, resolution);
  }
}
await assert.rejects(workspace.saveWorkspacePromptSettings({ imageRatio: "custom", imageResolution: "2k" }), /ratio is invalid/);
await assert.rejects(workspace.saveWorkspacePromptSettings({ imageRatio: "3:4", imageResolution: "8k" }), /resolution is invalid/);
assert.throws(() => dimensions.resolveGptImageDimensionSettings({ imageRatio: "3:4" }), /请选择/);
assert.equal(dimensions.pixelSizeForRatio("3:4", "2k"), "1536x2048");

const simple = readFileSync("src/lib/simple-runs.ts", "utf8");
const ast = ts.createSourceFile("simple-runs.ts", simple, ts.ScriptTarget.Latest, true);
const names = ["makeInitialRun", "settingsFromRun"];
const declarations = names.map((name) => {
  const declaration = ast.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert.ok(declaration);
  return declaration.getText(ast);
}).join("\n");
const compiled = ts.transpileModule(declarations, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const snapshots = new Function("defaultWorkspacePromptSettings", "stageTitles", `${compiled}\nreturn { ${names.join(",")} };`)(workspace.defaultWorkspacePromptSettings, {});
for (const imageQuality of ["low", "medium", "high"]) {
  for (const imageBackground of ["auto", "transparent", "opaque"]) {
    await workspace.saveWorkspacePromptSettings({ imageQuality, imageBackground });
    const restored = await workspace.getWorkspacePromptSettings();
    assert.equal(restored.imageQuality, imageQuality);
    assert.equal(restored.imageBackground, imageBackground);
  }
}
for (const imageBackground of ["invalid", "", null, 1]) {
  const previous = stored;
  await assert.rejects(workspace.saveWorkspacePromptSettings({ imageBackground }), /图片背景无效/);
  assert.equal(stored, previous, "Invalid background must not overwrite saved settings");
}
const chosen = await workspace.saveWorkspacePromptSettings({ imageRatio: "3:4", imageResolution: "2k", imageQuality: "high", imageBackground: "transparent" });
const run = JSON.parse(JSON.stringify(snapshots.makeInitialRun({ sourceMode: "links" }, chosen, {})));
await workspace.saveWorkspacePromptSettings({ imageRatio: "16:9", imageResolution: "4k", imageQuality: "low", imageBackground: "opaque" });
const resumed = snapshots.settingsFromRun(run);
assert.equal(resumed.imageRatio, "3:4");
assert.equal(resumed.imageResolution, "2k");
assert.equal(resumed.imageQuality, "high");
assert.equal(resumed.imageBackground, "transparent");
assert.equal(snapshots.settingsFromRun({ ...run, imageBackground: undefined }).imageBackground, "auto");
assert.equal(resumed.imageSize, "1536x2048", "Resuming must use the frozen task selection, not newer settings");
assert.equal(snapshots.settingsFromRun({ ...run, imageRatio: undefined, imageResolution: undefined, imageSize: "1200x1600" }).imageRatio, undefined);

const route = load("src/app/api/simple/runs/route.ts", {
  "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
  "@/lib/activity-log": { compactError: String, recordExecutionLog: async () => {} },
  "@/lib/config": { appConfig: {} },
  "@/lib/library-assets": { resolveLibraryAssetSelections: async () => [] },
  "@/lib/feishu-publish-mode": { normalizeFeishuPublishMode: () => "full" },
  "@/lib/workspace-accounts": { requireWorkspaceAccount: async () => ({ id: "fixture", displayName: "fixture" }) },
  "@/lib/simple-runs": { startSimpleRun: async (input) => snapshots.makeInitialRun(input, await workspace.saveWorkspacePromptSettings(input.settings), {}) },
});
const request = (settings) => new Request("http://fixture.invalid/api/simple/runs", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceMode: "links", settings }),
});
const accepted = await route.POST(request(chosen));
assert.equal(accepted.status, 200);
const submitted = (await accepted.json()).run;
assert.equal(submitted.imageQuality, "high");
assert.equal(submitted.imageBackground, "transparent");
const previous = stored;
const rejected = await route.POST(request({ imageBackground: "invalid" }));
assert.equal(rejected.status, 400);
assert.match((await rejected.json()).error, /图片背景无效/);
assert.equal(stored, previous);

const forwarded = simple.match(/size: settings\.imageSize,\s*ratio: settings\.imageRatio,\s*resolution: settings\.imageResolution,/g) || [];
assert.equal(forwarded.length, 3, "Reference, viral and original image calls must all forward the selection");
assert.equal((simple.match(/quality: settings\.imageQuality,\s*background: settings\.imageBackground,/g) || []).length, 3);
const page = readFileSync("src/app/page.tsx", "utf8");
assert.match(page, /<select[^>]*aria-label="图片比例"/);
assert.match(page, /<select[^>]*aria-label="图片分辨率"/);
assert.match(page, /<select[^\r\n]*aria-label="图片质量"[^\r\n]*disabled=\{disabled\}/);
assert.match(page, /<select[^\r\n]*aria-label="图片背景"[^\r\n]*disabled=\{disabled\}/);
assert.match(page, /toApisImageRatios\.map/);
assert.match(page, /toApisImageResolutions\.map/);
assert.match(page, /disabled=\{resolution === "4k" && !allows4k\}/);
assert.match(page, /resolveGptImageDimensionSettings\(workspaceSettings\)/);
assert.match(page, /\.\.\.selectedDimensions,/);
assert.doesNotMatch(page, /ImageSizeInput|compact-image-size-presets|normalizeImageSizeInput/);
const registry = readFileSync("src/lib/canvas/registry.ts", "utf8");
assert.match(registry, /options: toApisImageResolutions\.map/);
assert.match(readFileSync("src/lib/canvas/executors.ts", "utf8"), /import \{ pixelSizeForRatio \} from "\.\.\/gpt-image-dimensions"/);
console.log("Simple image selects, settings persistence, frozen resume and API dimension checks passed.");

function load(file, dependencies = {}) {
  const output = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", output)((name) => {
    assert.ok(dependencies[name], `Unexpected dependency ${name}`);
    return dependencies[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}
