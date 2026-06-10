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
  /const minGeneratedTitleChars = 10;[\s\S]*const maxGeneratedTitleChars = 26;/,
  "Generated title guard should enforce the 10-26 visible-character global range.",
);

assertContains(
  openai,
  /const titleLengthProfiles: TitleLengthProfile\[\] = \[[\s\S]*短标题[\s\S]*中标题[\s\S]*长标题/,
  "Generated titles should use randomized short/medium/long length profiles.",
);

assertContains(
  openai,
  /function pickTitleLengthProfile\(\)[\s\S]*Math\.random\(\) \* titleLengthProfiles\.length/,
  "Generated titles should randomly pick a length profile per generation.",
);

assertContains(
  openai,
  /function formatTitleStyleInstruction\(profile: TitleLengthProfile\)[\s\S]*不要固定 12 字[\s\S]*车型\/颜色\/场景\/核心冲突/,
  "The title prompt should include randomized length guidance and high-information title rules.",
);

assertContains(
  openai,
  /const titleProfile = pickTitleLengthProfile\(\);[\s\S]*const titleStyleInstruction = formatTitleStyleInstruction\(titleProfile\);[\s\S]*titleStyleInstruction,[\s\S]*body 用中文/,
  "The randomized title style instruction should be part of the primary generatePost prompt.",
);

assertContains(
  openai,
  /const title = await repairGeneratedTitleIfNeeded\(rawTitle,\s*input,\s*body,\s*titleProfile\);[\s\S]*title,/,
  "generatePost should validate and repair model-returned titles against the selected profile before saving.",
);

assertContains(
  openai,
  /async function repairGeneratedTitleIfNeeded\(title: string,\s*input: RewriteInput,\s*body: string,\s*profile: TitleLengthProfile\)/,
  "Title repair helper should accept the selected profile.",
);

assertContains(
  openai,
  /只修正 title[\s\S]*只输出严格 JSON，字段为 title[\s\S]*本次标题档位:/,
  "Invalid generated titles should get a focused title-only repair prompt.",
);

assertContains(
  openai,
  /function buildLocalTitleFallback\(title: string,\s*input: RewriteInput,\s*body: string,\s*profile: TitleLengthProfile\)/,
  "Title guard should include a local context-based fallback if model repair stays invalid.",
);

assertContains(
  openai,
  /function isGeneratedTitleLengthValid\(value: string,\s*profile\?: TitleLengthProfile\)[\s\S]*profile\?\.min[\s\S]*profile\?\.max/,
  "Title validation should use the selected profile when available.",
);

assertContains(
  openai,
  /function fitTitleLength\(title: string,\s*profile: TitleLengthProfile\)[\s\S]*profile\.min[\s\S]*profile\.max/,
  "Local title fallback should fit titles to the selected profile instead of the old fixed lower bound.",
);

assertContains(
  openai,
  /function countVisibleTitleChars\(value: string\)/,
  "Title guard should count visible characters instead of relying on byte length.",
);

console.log("Title prompt randomized guard check passed.");
