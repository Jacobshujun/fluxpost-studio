import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const projectRoot = process.cwd();
const require = createRequire(import.meta.url);

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function loadTsModule(relativePath, requireMap = {}) {
  const sourcePath = path.join(projectRoot, relativePath);
  const transpiled = ts.transpileModule(read(relativePath), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: sourcePath,
  });
  const cjsModule = { exports: {} };
  vm.runInNewContext(transpiled.outputText, {
    Buffer,
    URL,
    console,
    module: cjsModule,
    exports: cjsModule.exports,
    require: (name) => Object.hasOwn(requireMap, name) ? requireMap[name] : require(name),
  }, { filename: sourcePath });
  return cjsModule.exports;
}

const pageModule = loadTsModule("src/lib/dongchedi-page.ts", {
  "./dongchedi": {
    fetchDongchediHtml: async () => "",
    isDongchediAccessChallenge: (html) => /login-required|byted_acrawler/i.test(html),
  },
});

const categoryUrl = "https://www.dongchedi.com/news/industry/2";
if (pageModule.normalizeDongchediCategoryUrl(categoryUrl) !== categoryUrl) throw new Error("Category URL should be accepted unchanged.");
for (const invalid of ["https://example.com/news/industry/2", "http://www.dongchedi.com/news/industry/2", "https://www.dongchedi.com/article/7643008384274546713"]) {
  let rejected = false;
  try { pageModule.normalizeDongchediCategoryUrl(invalid); } catch { rejected = true; }
  if (!rejected) throw new Error(`Unsafe category URL should be rejected: ${invalid}`);
}

const cards = Array.from({ length: 35 }, (_value, index) => {
  const id = String(7643008384274546700n + BigInt(index));
  const articlePath = index === 1 ? `/ugc/article/${id}` : `/article/${id}`;
  return `<a href="${articlePath}"><img src="https://p3.dcarimg.com/${index}.jpg">Article ${index}</a>`;
}).join("");
const articles = pageModule.extractDongchediCategoryArticles(`${cards}<a href="https://example.com/article/9999999999999999999">external</a>`, 30);
if (articles.length !== 30) throw new Error(`Category extraction should cap at 30, got ${articles.length}.`);
if (new Set(articles.map((article) => article.sourceId)).size !== 30) throw new Error("Category extraction should deduplicate article ids.");
if (!articles[0].title?.includes("Article 0") || !articles[0].coverUrl?.includes("0.jpg")) throw new Error("Category card metadata should be preserved.");
if (articles.some((article) => !article.url.startsWith("https://www.dongchedi.com/article/"))) throw new Error("Category results should use current canonical article URLs.");
for (const count of [1, 10, 30]) {
  const selected = pageModule.extractDongchediCategoryArticles(cards, count);
  if (selected.length !== count) throw new Error(`Category target ${count} should select exactly ${count} items.`);
}
for (const reason of ["HTTP 403", "HTTP 429; Retry-After 30", "login-required", "anti-bot challenge", "request timeout"]) {
  if (!pageModule.isDongchediCategoryStopError(reason)) throw new Error(`Access stop reason should pause later work: ${reason}`);
}

const dongchediModule = loadTsModule("src/lib/dongchedi.ts", {
  "./media-cache": { cacheCrawledMedia: async (items) => items },
  "./video-quality": { rankVideoUrlsByQuality: (items) => items.map((item) => item.url) },
});
if (dongchediModule.buildDongchediArticleUrl("7643008384274546713") !== "https://www.dongchedi.com/article/7643008384274546713") {
  throw new Error("Dongchedi article ids should use the current canonical path.");
}
if (dongchediModule.resolveDongchediRedirectUrl("/article/7643008384274546713", categoryUrl) !== "https://www.dongchedi.com/article/7643008384274546713") {
  throw new Error("Same-host Dongchedi redirects should be accepted.");
}
for (const location of ["https://example.com/article/7643008384274546713", "http://www.dongchedi.com/article/7643008384274546713"]) {
  let rejected = false;
  try { dongchediModule.resolveDongchediRedirectUrl(location, categoryUrl); } catch { rejected = true; }
  if (!rejected) throw new Error(`Unsafe redirect should be rejected: ${location}`);
}
if (dongchediModule.isDongchediAccessChallenge('<header><button>登录</button></header><article>normal public content</article>')) {
  throw new Error("A normal logged-out navigation label must not be treated as a login challenge.");
}
if (!dongchediModule.isDongchediAccessChallenge('<title>登录 - 懂车帝</title><main class="login-page"></main>')) {
  throw new Error("A dedicated login page must stop category processing.");
}
let emptyCategoryRejected = false;
try {
  await pageModule.discoverDongchediCategory(categoryUrl);
} catch (error) {
  emptyCategoryRejected = /authenticated article links/i.test(error instanceof Error ? error.message : String(error));
}
if (!emptyCategoryRejected) throw new Error("An empty authenticated category response should return an actionable Cookie error.");

const key = Buffer.alloc(32, 7).toString("base64");
const cookieModule = loadTsModule("src/lib/dongchedi-cookie.ts", {
  "./config": { appConfig: { dongchediCookieEncryptionKey: key } },
});
const cookie = "sessionid=secret-cookie; ttwid=secret";
const envelope = cookieModule.encryptDongchediCookie(cookie);
if (!envelope || envelope.includes(cookie) || envelope.includes("sessionid")) throw new Error("Cookie envelope must not contain plaintext.");
if (cookieModule.decryptDongchediCookie(envelope) !== cookie) throw new Error("Cookie envelope should decrypt for the queue worker.");

const simpleRuns = read("src/lib/simple-runs.ts");
const simpleRoute = read("src/app/api/simple/runs/route.ts");
const database = read("src/lib/database.ts");
const types = read("src/lib/types.ts");
const page = read("src/app/page.tsx");
if (!types.includes('"dongchedi_page"')) throw new Error("SimpleRunInput must include Dongchedi page mode.");
if (!simpleRoute.includes('body.sourceMode === "dongchedi_page"')) throw new Error("Simple Run API must accept Dongchedi page mode.");
if (!simpleRuns.includes("resolveSourceLinksSerial")) throw new Error("Dongchedi category articles must use serial source resolution.");
const workflowStart = simpleRuns.indexOf("async function runSimpleDongchediPageWorkflow(");
const workflowEnd = simpleRuns.indexOf("async function produceSimpleSourceDraft(", workflowStart);
const workflow = simpleRuns.slice(workflowStart, workflowEnd);
const orderedSteps = [
  "for (const article of articles)",
  "await resolveSourceLinksSerial",
  "await filterUnsafeSourceItems",
  "await tagSourceItems",
  "await produceSimpleSourceDraft",
  'status: "draft"',
].map((needle) => workflow.indexOf(needle));
if (orderedSteps.some((index) => index < 0) || orderedSteps.some((index, position) => position > 0 && index <= orderedSteps[position - 1])) {
  throw new Error("Each Dongchedi article must complete fetch, safety, tagging, rewrite, and draft persistence in one serial loop.");
}
if (!simpleRuns.includes('taskConcurrency: isSimpleRunDongchediPageMode(normalizedInput) ? 1 : concurrencyConfig.image')) throw new Error("Dongchedi page image reconstruction must use task concurrency 1.");
if (!simpleRuns.includes('sourceMode === "dongchedi_page" ? 30')) throw new Error("Dongchedi page target count must cap at 30.");
if (!simpleRuns.includes('discoverDongchediCategory(normalizedInput.pageUrl || "", { cookie, limit: 30 })') || !simpleRuns.includes("articles = discovery.articles.slice(0, normalizedInput.targetCount)")) throw new Error("Discovery count must cover the current page while processing remains bounded by the target.");
if (!simpleRuns.includes("discoveredCount: discovery.articles.length")) throw new Error("Run progress must retain the actual discovered article count.");
if (!simpleRuns.includes("sourceUrl: source.sourceUrl") || !simpleRuns.includes("sourceSafetyAssessment: source.safetyAssessment")) throw new Error("Review drafts must retain their source URL and safety assessment.");
if (!simpleRuns.includes("maxDongchediCookieBytes = 16 * 1024") || !simpleRuns.includes("Buffer.byteLength(cookie) > maxDongchediCookieBytes")) throw new Error("Dongchedi Cookie input must have a bounded request-header size.");
if (!simpleRuns.includes('run.linkResults?.some((result) => result.status !== "draft")')) throw new Error("Incomplete Dongchedi article sets must resolve as partial runs.");
if (!simpleRuns.includes("pauseSimpleRun") || !simpleRuns.includes("resumeSimpleRun") || !simpleRoute.includes("export async function PATCH")) throw new Error("Dongchedi page runs must expose pause and resume controls.");
for (const queueFunction of ["pauseQueuedSimpleRunQueueItemByRunId", "pauseClaimedSimpleRunQueueItem", "resumeSimpleRunQueueItemByRunId"]) {
  if (!database.includes(`export async function ${queueFunction}`)) throw new Error(`Durable queue control is missing: ${queueFunction}`);
}
if (!simpleRuns.match(/function toPublicSimpleRun[\s\S]*?cookie:\s*undefined,[\s\S]*?cookieCiphertext:\s*undefined/)) throw new Error("Simple Run responses must redact plaintext and encrypted request cookies.");
if (!simpleRuns.includes("clearSimpleRunCookieEnvelope") || !simpleRuns.includes('status: "paused"')) throw new Error("Terminal cookie cleanup and non-terminal pause retention must be explicit.");
if (!page.includes("懂车帝栏目页") || !page.includes("simplePageUrl")) throw new Error("Main workbench must expose the Dongchedi category input.");

console.log("Dongchedi page check passed.");
