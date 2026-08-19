import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const read = (relative) => readFileSync(path.join(root, relative), "utf8");

function loadAssistantModule() {
  const relative = "src/lib/canvas/seedance-prompt-assistant.ts";
  const output = ts.transpileModule(read(relative), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: relative,
  }).outputText;
  const cjsModule = { exports: {} };
  vm.runInNewContext(output, {
    module: cjsModule,
    exports: cjsModule.exports,
    console,
    Set,
    Map,
    JSON,
    Number,
    Array,
    Object,
    RegExp,
    Error,
  }, { filename: relative });
  return cjsModule.exports;
}

const assistant = loadAssistantModule();
const loadSkill = () => ({ content: "runtime skill marker", metadata: { source: "configured-file", version: "runtime-hash", updatedAt: "2026-08-19T00:00:00.000Z" } });
const baseInput = {
  action: "generate",
  mode: "auto",
  intent: "汽车冲出雨幕，开头要有冲击",
  existingPrompt: "",
  duration: 8,
  ratio: "9:16",
  references: [],
};

const validCandidates = (parts = [{ type: "text", value: "开场第一秒，汽车突然冲出雨幕；随后镜头低位跟随，水花撞向镜头，最后车灯熄灭。" }]) => JSON.stringify({
  candidates: [
    { title: "雨幕突围", promptParts: parts, duration: 8, ratio: "9:16", complianceRisk: "low", warnings: [] },
    { title: "水花撞镜", promptParts: [{ type: "text", value: "前2秒水花瞬间覆盖画面，汽车破水出现；固定低机位轻微后退，尾灯在雨中收束。" }], duration: 8, ratio: "9:16", complianceRisk: "low", warnings: [] },
  ],
});

let textCalls = 0;
let visionCalls = 0;
const textResult = await assistant.createSeedancePromptCandidates(baseInput, {
  loadSkill,
  generateText: async (prompt) => {
    textCalls += 1;
    assert.match(prompt, /runtime skill marker/);
    assert.ok(prompt.indexOf("runtime skill marker") < prompt.indexOf("FluxPost hard contract \(immutable\)"));
    assert.match(prompt, /前2秒出现核心视觉 Hook/);
    assert.match(prompt, /恰好返回 2 个 candidates/);
    return validCandidates();
  },
  generateVision: async () => {
    visionCalls += 1;
    return validCandidates();
  },
});
assert.equal(textResult.resolvedMode, "text");
assert.equal(textResult.candidates.length, 2);
assert.equal(textCalls, 1);
assert.equal(visionCalls, 0);
assert.equal(textResult.candidates[0].checks.hookPresent, true);
assert.equal(textResult.skill.source, "configured-file");

const imageInput = {
  ...baseInput,
  references: [{ id: "assistant-ref-1", number: 1, url: "https://example.test/car.jpg", name: "汽车" }],
};
const imageResult = await assistant.createSeedancePromptCandidates(imageInput, {
  loadSkill,
  generateText: async () => {
    textCalls += 1;
    return validCandidates();
  },
  generateVision: async (prompt, urls) => {
    visionCalls += 1;
    assert.deepEqual(urls, ["https://example.test/car.jpg"]);
    assert.match(prompt, /assistant-ref-1: @图片1/);
    return validCandidates([
      { type: "image", referenceId: "assistant-ref-1" },
      { type: "text", value: "为首帧，开场第一秒车灯突然点亮，镜头低位后退，雨水向两侧飞散。" },
    ]);
  },
});
assert.equal(imageResult.resolvedMode, "image");
assert.equal(visionCalls, 1);
assert.equal(assistant.serializeSeedanceAssistantPrompt(imageResult.candidates[0].promptParts, imageInput.references), "图片1为首帧，开场第一秒车灯突然点亮，镜头低位后退，雨水向两侧飞散。");

assert.equal(assistant.resolveSeedanceAssistantMode({ ...imageInput, references: Array.from({ length: 4 }, (_, index) => ({ id: `ref-${index}`, number: index + 1, url: `https://example.test/${index}.jpg` })) }), "storyboard");
assert.equal(assistant.resolveSeedanceAssistantMode({ ...baseInput, existingPrompt: "旧 Prompt" }), "rewrite");
assert.throws(() => assistant.normalizeSeedancePromptAssistantRequest({ ...baseInput, duration: 16 }), /4-15/);
assert.throws(() => assistant.normalizeSeedancePromptAssistantRequest({ ...baseInput, intent: "", existingPrompt: "" }), /创意需求/);
assert.throws(() => assistant.normalizeSeedancePromptAssistantRequest({ ...baseInput, intent: "字".repeat(4001) }), /不能超过 4000/);
assert.throws(() => assistant.normalizeSeedancePromptAssistantRequest({ ...imageInput, references: [{ ...imageInput.references[0], url: "/local.jpg" }] }), /HTTP\(S\)/);

assert.throws(() => assistant.parseSeedanceAssistantModelResponse(JSON.stringify({ candidates: [] }), baseInput), /两套候选/);
assert.throws(() => assistant.parseSeedanceAssistantModelResponse(validCandidates([{ type: "text", value: "使用图片1作为首帧" }]), imageInput), /结构化图片引用/);
assert.throws(() => assistant.parseSeedanceAssistantModelResponse(validCandidates([{ type: "image", referenceId: "missing" }]), imageInput), /不存在的参考图/);
assert.throws(() => assistant.parseSeedanceAssistantModelResponse(validCandidates([{ type: "text", value: "开场" + "字".repeat(2000) }]), baseInput), /2000 字符/);

const audited = assistant.parseSeedanceAssistantModelResponse(JSON.stringify({ candidates: [
  {
    title: "冲突运镜",
    promptParts: [{ type: "text", value: "开场0-3秒：近景360度环绕，镜头同时推进、升高并旋转；3-7秒：继续；7-15秒：收束。" }],
    duration: 15,
    ratio: "9:16",
    complianceRisk: "low",
    warnings: [],
  },
  {
    title: "风险场景",
    promptParts: [{ type: "text", value: "前2秒进入KTV包间，随后固定机位拍摄。" }],
    duration: 8,
    ratio: "9:16",
    complianceRisk: "low",
    warnings: [],
  },
] }), baseInput);
assert.equal(audited[0].checks.cameraConflict, true);
assert.equal(audited[0].checks.timelineComplete, true);
assert.ok(audited[0].warnings.some((warning) => warning.includes("简化运镜")));
assert.equal(audited[1].complianceRisk, "medium");

const route = read("src/app/api/canvas/seedance/prompt-assist/route.ts");
assert.match(route, /await requireWorkspaceAccount\(request\)/);
assert.match(route, /createSeedancePromptCandidates\(input/);
assert.match(route, /callOpenAIForVisionText/);
assert.match(route, /loadSkill: loadSeedancePromptSkill/);
assert.match(route, /SeedancePromptAssistantInputError \|\| error instanceof SyntaxError \? 400/);

const page = read("src/app/canvas/page.tsx");
for (const snippet of [
  'AI 优化',
  '"/api/canvas/seedance/prompt-assist"',
  "serializeSeedanceAssistantPrompt",
  "candidate.complianceRisk === \"high\"",
  "请先断开外部提示词连接",
  "seedanceMentionMarker(id)",
  "snapshot.url",
  "response.skill.source",
]) assert.ok(page.includes(snippet), `Canvas Seedance assistant UI is missing ${snippet}`);

const css = read("src/app/globals.css");
for (const selector of [".canvas-seedance-assistant", ".canvas-seedance-candidate", ".canvas-seedance-assistant-error"]) {
  assert.ok(css.includes(selector), `Seedance assistant styles are missing ${selector}`);
}

console.log("Seedance prompt assistant check passed.");
