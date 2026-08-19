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

const openai = read("src/lib/openai.ts");
const simpleRuns = read("src/lib/simple-runs.ts");
const contentDesk = read("src/app/content/page.tsx");

assertContains(
  openai,
  /const userTextInstruction = input\.instruction\?\.trim\(\) \|\|[\s\S]*用户文案提示词:[\s\S]*\$\{userTextInstruction\}/,
  "generatePost prompt must route the normalized user text instruction into the model prompt.",
);

assertContains(
  openai,
  /文案生产策略完全以用户文案提示词为准[\s\S]*不要自行添加行业、竞品、品牌或车型转换策略/,
  "generatePost prompt must make the workspace text instruction the only text production strategy.",
);

assertContains(
  openai,
  /除非用户文案提示词明确要求切换品牌、车型或视角[\s\S]*必须保留原文事实主体/,
  "generatePost prompt must preserve the source subject unless the workspace prompt changes it.",
);

assertContains(
  simpleRuns,
  /instruction:\s*settings\.textInstruction[\s\S]*imageTasks/,
  "Simple runs must pass the frozen workspace text instruction and image tasks into generation.",
);

assertNotContains(
  openai,
  /production-plan|productionPlan|非文案制作约束|observe_only|竞品图文只分析创意并用小鹏素材重构|formatProductionPlanForPrompt|formatNonTextProductionConstraintsForPrompt/,
  "generatePost must not consume or inject the removed automatic production strategy.",
);

assertNotContains(simpleRuns, /buildProductionPlan|productionPlan|observe_only/, "Simple runs must not recompute or enforce automatic production plans.");
assertNotContains(contentDesk, /ProductionPlanCard|formatContentDirection|formatProductionDecision|formatTextStrategy|formatImageStrategy/, "The content desk must not display the removed automatic strategy.");
assertContains(contentDesk, /同步默认策略/, "Content-pool secondary creation should still identify the shared workspace strategy.");
assertContains(contentDesk, /sourceMode:\s*"pool"[\s\S]*writeFeishu:\s*false[\s\S]*settings:\s*workspaceSettings/, "Content-pool secondary creation must submit shared workspace settings and disable Feishu publishing.");
assertContains(simpleRuns, /writeFeishu:\s*sourceMode === "pool" \? false : input\.writeFeishu === true/, "Server normalization must keep Feishu disabled for content-pool runs.");

console.log("User text instruction priority check passed.");
