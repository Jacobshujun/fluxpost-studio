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
const productionPlan = read("src/lib/production-plan.ts");
const batchProduction = read("src/lib/batch-production.ts");

assertContains(
  productionPlan,
  /export function formatNonTextProductionConstraintsForPrompt\(plan: ProductionPlan\)[\s\S]*图片策略:[\s\S]*图片 Brief:/,
  "Production-plan prompt formatter should expose non-text constraints separately.",
);

assertNotContains(
  productionPlan.match(/export function formatNonTextProductionConstraintsForPrompt[\s\S]*?\n\}/)?.[0] || "",
  /文案策略|文案 Brief/,
  "Non-text production constraints must not include automatic text strategy or text brief.",
);

assertContains(
  openai,
  /const userTextInstruction = input\.instruction\?\.trim\(\) \|\|[\s\S]*用户文案提示词:[\s\S]*\$\{userTextInstruction\}/,
  "generatePost prompt must route the normalized user text instruction into the model prompt.",
);

assertContains(
  openai,
  /文案生产策略完全以用户文案提示词为准[\s\S]*不得覆盖用户文案提示词/,
  "generatePost prompt must explicitly give user text instructions priority over automatic direction detection.",
);

assertContains(
  openai,
  /除非用户文案提示词明确要求切换品牌、车型或视角[\s\S]*不要因为竞品识别自动改成小鹏、G6 或其他车型/,
  "generatePost prompt must prevent automatic brand/model switching unless the user asks for it.",
);

assertContains(
  openai,
  /非文案制作约束:[\s\S]*formatNonTextProductionConstraintsForPrompt\(productionPlan\)/,
  "generatePost prompt should include only non-text production constraints from the automatic plan.",
);

assertNotContains(
  openai,
  /竞品图文只分析创意并用小鹏素材重构|formatProductionPlanForPrompt\(productionPlan\)|`额外要求: \$\{input\.instruction/,
  "generatePost prompt must not reintroduce hard-coded competitor-to-Xpeng text strategy or duplicate user instruction as a weak extra requirement.",
);

assertNotContains(
  batchProduction,
  /当前策略原因：\$\{plan\.reason\}/,
  "Batch production must not inject automatic production-plan reasons into the user text instruction.",
);

console.log("User text instruction priority check passed.");
