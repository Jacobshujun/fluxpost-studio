import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assertContains(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

const openai = read("src/lib/openai.ts");

assertContains(
  openai,
  /const minGeneratedTitleChars = 12;[\s\S]*const maxGeneratedTitleChars = 18;/,
  "Generated title guard should enforce the 12-18 visible-character range.",
);

assertContains(
  openai,
  /const titleStyleInstruction = \[[\s\S]*12-18[\s\S]*车型\/颜色\/场景\/核心冲突/,
  "The main generation prompt should include explicit high-information title rules.",
);

assertContains(
  openai,
  /titleStyleInstruction,[\s\S]*body 用中文/,
  "The title style instruction should be part of the primary generatePost prompt.",
);

assertContains(
  openai,
  /const title = await repairGeneratedTitleIfNeeded\(rawTitle,\s*input,\s*body\);[\s\S]*title,/,
  "generatePost should validate and repair model-returned titles before saving.",
);

assertContains(
  openai,
  /async function repairGeneratedTitleIfNeeded\(title: string,\s*input: RewriteInput,\s*body: string\)/,
  "Title repair helper should exist.",
);

assertContains(
  openai,
  /只修正 title[\s\S]*只输出严格 JSON，字段为 title/,
  "Invalid generated titles should get a focused title-only repair prompt.",
);

assertContains(
  openai,
  /function buildLocalTitleFallback\(title: string,\s*input: RewriteInput,\s*body: string\)/,
  "Title guard should include a local context-based fallback if model repair stays invalid.",
);

assertContains(
  openai,
  /function countVisibleTitleChars\(value: string\)/,
  "Title guard should count visible characters instead of relying on byte length.",
);

console.log("Title prompt guard check passed.");
