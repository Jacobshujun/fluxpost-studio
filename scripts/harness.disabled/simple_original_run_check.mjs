import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const read = (relativePath) => readFileSync(path.join(projectRoot, relativePath), "utf8");
const has = (source, pattern, message) => {
  if (!pattern.test(source)) throw new Error(message);
};

const types = read("src/lib/types.ts");
const route = read("src/app/api/simple/runs/route.ts");
const simpleRuns = read("src/lib/simple-runs.ts");
const original = read("src/lib/original-creation.ts");
const openai = read("src/lib/openai.ts");
const imageGeneration = read("src/lib/image-generation.ts");
const page = read("src/app/page.tsx");
const feishu = read("src/lib/feishu-cli.ts");
const check = read("scripts/harness/check.ps1");

has(types, /export type Platform = SourceLinkPlatform \| "feishu" \| "original"/, "Platform must include original.");
has(types, /openaiTextEndpoint:\s*string/, "ConfigStatus must expose the OpenAI text endpoint.");
has(types, /sourceMode\?:\s*"keyword"\s*\|\s*"links"\s*\|\s*"feishu"\s*\|\s*"viral"\s*\|\s*"original"/, "SimpleRunInput must persist original mode.");
has(types, /originalPrompt\?:\s*string/, "SimpleRunInput must persist original prompt.");
has(types, /originalUseWebSearch\?:\s*boolean/, "SimpleRunInput must persist original web-search switch.");
has(types, /export type SimpleRunOriginalResult/, "SimpleRunOriginalResult type is missing.");
has(types, /originalResult\?:\s*SimpleRunOriginalResult/, "SimpleRun must persist original result metadata.");

has(route, /originalPrompt\?:\s*string/, "Simple run API must accept originalPrompt.");
has(route, /originalUseWebSearch\?:\s*boolean/, "Simple run API must accept originalUseWebSearch.");
has(route, /import \{ appConfig \} from "@\/lib\/config"/, "Simple run API must read server text-endpoint config for original web-search validation.");
has(route, /sourceMode:\s*body\.sourceMode === "original" \? "original" : body\.sourceMode === "viral" \? "viral" : baseSourceMode/, "Simple run API must forward original source mode.");
has(route, /originalPrompt:\s*body\.originalPrompt/, "Simple run API must forward originalPrompt.");
has(route, /originalUseWebSearch:\s*body\.originalUseWebSearch === true/, "Simple run API must default original web search off.");
has(route, /if \(body\.sourceMode === "original" && body\.originalUseWebSearch === true && appConfig\.openaiTextEndpoint !== "responses"\)[\s\S]*Original-mode web search requires OPENAI_TEXT_ENDPOINT=responses/, "Simple run API must reject unsupported original web search before enqueueing a failed run.");
has(route, /\/requires\|required\|platform\/i\.test\(message\) \? 400/, "Simple run API must return 400 for unsupported original web search requests.");

has(read("src/lib/config.ts"), /openaiTextEndpoint:\s*appConfig\.openaiTextEndpoint/, "Config status must return openaiTextEndpoint.");

has(openai, /export async function callOpenAIForJson\(prompt: string,\s*options: JsonModelOptions = \{\}/, "OpenAI JSON helper must be reusable.");
has(openai, /tools:\s*\[\{ type: "web_search" \}\]/, "Responses calls must use the web_search tool when requested.");
has(openai, /tool_choice:\s*\{ type: "web_search" \}/, "Original web search should require the web_search tool.");
has(openai, /Original-mode web search requires OPENAI_TEXT_ENDPOINT=responses/, "Chat endpoint must fail clearly for web search.");

has(imageGeneration, /export async function generateImagesFromPromptList/, "Image generation must expose prompt-list generation.");
has(imageGeneration, /slice\(0,\s*5\)/, "Original image prompt generation must be capped at five images.");

has(original, /export const maxOriginalImagePrompts = 5/, "Original creation must cap image prompts at five.");
has(original, /buildOriginalGeneratedPost/, "Original creation module must build generated posts.");
has(original, /platform:\s*"original"/, "Original posts must use platform=original.");
has(original, /sourceItemId:\s*`original-\$\{input\.runId\}`/, "Original source item id must be run-scoped.");
has(original, /vehicleKeyword\?:\s*string/, "Original creation must accept a vehicle keyword.");
has(original, /taskKeyword:\s*vehicleKeyword/, "Original posts must use the vehicle keyword as taskKeyword.");
has(original, /feishuVehicle:\s*vehicleKeyword/, "Original posts must persist feishuVehicle for Feishu vehicle writes.");
has(original, /callOpenAIForJson\([\s\S]*webSearch:\s*input\.useWebSearch/, "Original creation must pass the web-search switch to OpenAI.");

has(simpleRuns, /function isSimpleRunOriginalMode/, "Simple run workflow must expose an original-mode guard.");
has(simpleRuns, /isSimpleRunOriginalMode\(normalizedInput\)[\s\S]*runSimpleOriginalWorkflow/, "Simple run workflow must branch into original mode.");
has(simpleRuns, /sourceMode === "original" && !originalPrompt/, "Original input validation must require a prompt.");
has(simpleRuns, /sourceMode === "original" && !keyword/, "Original input validation must require a vehicle keyword.");
has(simpleRuns, /targetCount:\s*1/, "Original mode must force targetCount to one.");
has(simpleRuns, /vehicleKeyword:\s*normalizedInput\.keyword/, "Original workflow must pass the simple keyword as the Feishu vehicle keyword.");
has(simpleRuns, /generateImagesFromPromptList\(draft\.imagePrompts/, "Original workflow must generate images from planned prompts.");
has(simpleRuns, /enqueueFeishuPublishJob\(approvedPosts/, "Original workflow must reuse the Feishu publish queue.");
has(simpleRuns, /function makeOriginalStageTitles/, "Original workflow must use original-specific stage titles.");
has(simpleRuns, /tag:\s*"原创策划"/, "Original stage titles must replace AI tagging with original planning.");
has(simpleRuns, /markOriginalWorkflowFailureStages/, "Original workflow must mark running and queued stages terminal on failure.");
has(simpleRuns, /if \(stage\.status === "running" \|\| stage\.status === "queued"\)[\s\S]*const status(?::\s*SimpleRunStageStatus)? = stage\.status === "running" \? "error" : stage\.status === "queued" \? "skipped" : stage\.status/, "Original failure handling must not leave running or queued stages behind.");
has(simpleRuns, /if \(normalizedInput\.originalUseWebSearch === true && appConfig\.openaiTextEndpoint !== "responses"\)/, "Original workflow must guard unsupported web search before provider calls.");
has(simpleRuns, /const draft = await buildOriginalGeneratedPost[\s\S]*run = await setStage\(run, "tag"/, "Original image planning stage should complete after the draft returns image prompts.");
if (/run = await setStage\(run, "tag"[\s\S]{0,500}run = await setStage\(run, "produce"[\s\S]{0,500}const draft = await buildOriginalGeneratedPost/.test(simpleRuns)) {
  throw new Error("Original workflow must not mark both tag and produce as running before draft generation.");
}

has(page, /type SimpleSourceMode = "keyword" \| "links" \| "feishu" \| "viral" \| "original"/, "Simple UI must define original source mode.");
has(page, /simpleOriginalPrompt/, "Simple UI must keep controlled original prompt state.");
has(page, /simpleOriginalUseWebSearch/, "Simple UI must keep controlled web-search state.");
has(page, /onSourceModeChange\("original"\)/, "Simple UI must expose the original mode button.");
has(page, /写入飞书车型 \/ 关键词/, "Simple original UI must expose the Feishu vehicle keyword field.");
has(page, /sourceMode === "original" \? Boolean\(originalPrompt\.trim\(\)\) && Boolean\(keyword\.trim\(\)\)/, "Simple original start state must require both prompt and vehicle keyword.");
has(page, /keyword:\s*sourceMode === "feishu" \? "飞书导入" : keyword/, "Simple original start request must send the user vehicle keyword.");
has(page, /<FieldLabel label="原创 Prompt" \/>/, "Simple UI must render the original prompt input.");
has(page, /启用联网搜索/, "Simple UI must render the web-search switch.");
has(page, /const originalWebSearchAvailable = config\?\.openaiTextEndpoint === "responses"/, "Simple UI must detect whether original web search is available.");
has(page, /sourceMode === "original" && simpleOriginalUseWebSearch && config\?\.openaiTextEndpoint !== "responses"/, "Simple UI must block unsupported original web search before submitting.");
has(page, /disabled=\{busy \|\| settingsBusy \|\| !originalWebSearchAvailable\}/, "Simple original web-search checkbox must be disabled when unsupported.");
has(page, /OPENAI_TEXT_ENDPOINT=responses/, "Simple original UI must explain the required endpoint for web search.");
has(page, /originalPrompt:\s*sourceMode === "original" \? originalPrompt : undefined/, "Simple start request must send originalPrompt only in original mode.");
has(page, /originalUseWebSearch:\s*sourceMode === "original" \? simpleOriginalUseWebSearch : undefined/, "Simple start request must send originalUseWebSearch only in original mode.");
has(page, /生成原创并写入飞书/, "Simple start button must describe the original publish flow.");
has(page, /formatSimpleRunPipelineDetail/, "Simple UI must render source-mode-specific pipeline progress copy.");
has(page, /原创准备、原创策划、生成图文、写入飞书会依次完成/, "Simple original progress copy must not mention crawl or AI tagging.");

has(feishu, /original:\s*"原创"/, "Feishu platform formatter must label original posts.");
has(check, /Simple original run check/, "Harness baseline must include the simple original run check.");

console.log("Simple original run check passed.");
