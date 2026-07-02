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
const titleGuard = read("src/lib/title-guard.ts");
const generatedPosts = read("src/lib/generated-posts.ts");

assertContains(
  titleGuard,
  /export const minGeneratedTitleChars = 10;[\s\S]*export const maxGeneratedTitleChars = 20;/,
  "Generated title guard must enforce the 10-20 visible-character global range.",
);

assertContains(
  titleGuard,
  /export const titleLengthProfiles: TitleLengthProfile\[\] = \[[\s\S]*短标题[\s\S]*max: 13[\s\S]*中标题[\s\S]*max: 17[\s\S]*长标题[\s\S]*max: 20/,
  "Generated titles should use randomized profiles whose maximum never exceeds 20.",
);

assertContains(
  titleGuard,
  /function pickTitleLengthProfile\(\)[\s\S]*Math\.random\(\) \* titleLengthProfiles\.length/,
  "Generated titles should randomly pick a length profile per generation.",
);

assertContains(
  titleGuard,
  /function formatTitleStyleInstruction\(profile: TitleLengthProfile\)[\s\S]*title 铁律[\s\S]*绝不能超过 \$\{maxGeneratedTitleChars\}[\s\S]*不要固定 12 字[\s\S]*车型\/颜色\/场景\/核心冲突/,
  "The title prompt should include the hard <=20 rule, randomized guidance, and high-information title rules.",
);

assertContains(
  titleGuard,
  /function isGeneratedTitleLengthValid\(value: string,\s*profile\?: TitleLengthProfile\)[\s\S]*Math\.min\(profileMax,\s*maxGeneratedTitleChars\)/,
  "Title validation must cap every selected profile by the global 20-character maximum.",
);

assertContains(
  titleGuard,
  /function clampGeneratedTitleMax\(title: string[\s\S]*chars\.length > maxGeneratedTitleChars[\s\S]*slice\(0,\s*maxGeneratedTitleChars\)/,
  "Title guard must expose a max-length clamp for non-generation save paths.",
);

assertContains(
  titleGuard,
  /function fitTitleLength\(title: string,\s*profile: TitleLengthProfile\)[\s\S]*Math\.min\(profile\.max,\s*maxGeneratedTitleChars\)/,
  "Local title fallback must fit titles inside the selected profile and the global 20-character maximum.",
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
  /const demoPost = makeDemoPost\(input\.source,\s*input\.materialPaths\);[\s\S]*title: clampGeneratedTitleMax\(demoPost\.title\)/,
  "Demo generation fallback must also clamp titles to the global maximum.",
);

assertContains(
  openai,
  /export async function editPostWithPrompt[\s\S]*const titleProfile = pickTitleLengthProfile\(\);[\s\S]*formatTitleStyleInstruction\(titleProfile\)[\s\S]*title: clampGeneratedTitleMax\(stringFromJson\(json\.title,\s*input\.post\.title\)\)/,
  "AI review edits must include the title rule in the prompt and clamp returned titles.",
);

assertContains(
  openai,
  /function buildLocalTitleFallback\(title: string,\s*input: RewriteInput,\s*body: string,\s*profile: TitleLengthProfile\)/,
  "Title guard should include a local context-based fallback if model repair stays invalid.",
);

assertContains(
  generatedPosts,
  /import \{ clampGeneratedTitleMax \} from "\.\/title-guard";[\s\S]*title: clampGeneratedTitleMax\(post\.title\)/,
  "Generated post persistence must clamp every saved title to the global maximum.",
);

assertNotContains(
  `${openai}\n${titleGuard}`,
  /maxGeneratedTitleChars\s*=\s*26|21,\s*max:\s*26|21-26/,
  "Generated title code must not reintroduce the old 21-26 character range.",
);

assertContains(
  titleGuard,
  /function countVisibleTitleChars\(value: string\)/,
  "Title guard should count visible characters instead of relying on byte length.",
);

console.log("Title prompt hard max guard check passed.");
