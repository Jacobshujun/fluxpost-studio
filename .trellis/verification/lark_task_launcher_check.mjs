import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const projectRoot = process.cwd();
const nodeRequire = createRequire(import.meta.url);

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assertContains(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function loadTsModule(relativePath, requireMap = {}) {
  const sourcePath = path.join(projectRoot, relativePath);
  const source = readFileSync(sourcePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  });
  const cjsModule = { exports: {} };
  const sandbox = {
    Buffer,
    URL,
    console,
    module: cjsModule,
    exports: cjsModule.exports,
    require: (name) => {
      if (Object.hasOwn(requireMap, name)) return requireMap[name];
      if (name.startsWith("node:")) return nodeRequire(name);
      throw new Error(`Unexpected import in ${relativePath}: ${name}`);
    },
  };
  vm.runInNewContext(transpiled.outputText, sandbox, { filename: sourcePath });
  return cjsModule.exports;
}

const config = read("src/lib/config.ts");
const launcher = read("src/lib/lark-task-launcher.ts");
const route = read("src/app/api/lark/tasks/route.ts");
const runner = read("scripts/lark-task-runner.mjs");
const eventRunner = read("scripts/lark-task-events.mjs");
const database = read("src/lib/database.ts");
const schema = read("db/migrations/001_initial_postgres.sql");
const packageJson = read("package.json");
const check = read(".trellis/verification/check.ps1");

assertContains(config, /larkTaskChatIds:\s*parseCsv\(process\.env\.LARK_TASK_CHAT_IDS/, "Lark task chat allow-list config is missing.");
assertContains(config, /larkTaskUserMap:\s*parseKeyValueMap\(process\.env\.LARK_TASK_USER_MAP/, "Lark sender-to-owner map config is missing.");
assertContains(config, /larkTaskApiToken:\s*process\.env\.LARK_TASK_API_TOKEN/, "Lark task local API token config is missing.");

assertContains(schema, /CREATE TABLE IF NOT EXISTS lark_task_launches/, "PostgreSQL schema must create lark_task_launches.");
assertContains(database, /CREATE TABLE IF NOT EXISTS lark_task_launches/, "Runtime database schema must create lark_task_launches.");
assertContains(database, /message_id TEXT NOT NULL UNIQUE/, "Lark launches must be unique by message_id.");
assertContains(database, /export async function getLarkTaskLaunchByMessageId/, "Lark launch idempotency lookup is missing.");
assertContains(database, /export async function saveLarkTaskLaunchToDb/, "Lark launch persistence helper is missing.");

assertContains(launcher, /isLarkTaskCommandText/, "Lark task command detector is missing.");
assertContains(launcher, /parseLarkTaskCommand/, "Lark task parser is missing.");
assertContains(launcher, /isViralModeAlias/, "Lark task parser must recognize viral replication mode aliases.");
assertContains(launcher, /normalizeModeLinkPlatform/, "Lark task parser must map source-specific aliases to link platforms.");
assertContains(launcher, /isXiaopengBbsAlias/, "Lark task parser must recognize Xiaopeng BBS aliases.");
assertContains(launcher, /linkPlatform !== "xiaopeng_bbs"[\s\S]*\\b\\d\{4,20\}\\b/, "Xiaopeng BBS link mode must accept pure numeric thread ids.");
assertContains(launcher, /const linkPlatform = normalizeLinkPlatform\(options\.platform \|\| options\.platforms\) \|\| modeLinkPlatform \|\| inlineLinkPlatform \|\| "auto"/, "Lark link commands must resolve Xiaopeng BBS link platform.");
assertContains(launcher, /linkPlatform,/, "Lark link commands must forward the resolved link platform into SimpleRunInput.");
assertContains(launcher, /appConfig\.larkTaskChatIds\.includes\(message\.chatId\)/, "Launcher must enforce chat allow-list.");
assertContains(launcher, /resolveLarkTaskOwner\(message\.senderId\)/, "Launcher must resolve sender to workspace owner.");
assertContains(launcher, /getLarkTaskLaunchByMessageId\(message\.messageId\)/, "Launcher must check message idempotency before launching.");
assertContains(launcher, /await startSimpleRun\(/, "Launcher must enqueue through startSimpleRun.");
assertContains(launcher, /Target count \$\{targetCount\} requires confirm=yes/, "Large Lark tasks must require explicit confirmation.");

assertContains(route, /authorization\.replace\(\s*\/\^Bearer\\s\+\/i/, "Lark task route must read bearer authorization.");
assertContains(route, /token !== appConfig\.larkTaskApiToken/, "Lark task route must enforce the local API token.");
assertContains(route, /processLarkTaskMessage/, "Lark task route must delegate to launcher.");

assertContains(runner, /"\+chat-messages-list"/, "Runner must fetch chat messages via lark-cli.");
assertContains(runner, /"\+messages-reply"/, "Runner must be able to reply via lark-cli.");
assertContains(runner, /const reply = args\.has\("--reply"\)/, "Runner replies must be opt-in.");
assertContains(runner, /const dryRun = args\.has\("--dry-run"\)/, "Runner must support dry-run mode.");
assertContains(runner, /const selfTest = args\.has\("--self-test"\)/, "Runner must support self-test without calling Feishu.");
assertContains(runner, /\/api\/lark\/tasks/, "Runner must submit to the local Lark task API.");
assertContains(runner, /loadEnvConfig\(process\.cwd\(\)\)/, "Runner should load .env.local like the Next app.");

assertContains(eventRunner, /"event",\s*\n\s*"consume",\s*\n\s*"im\.message\.receive_v1"/, "Event runner must consume IM receive events.");
assertContains(eventRunner, /\[event\] ready/, "Event runner must observe the lark-cli ready marker.");
assertContains(eventRunner, /loadEnvConfig\(process\.cwd\(\)\)/, "Event runner should load .env.local like the Next app.");
assertContains(eventRunner, /chatIds\.includes\(message\.chatId\)/, "Event runner must enforce the same chat allow-list.");
assertContains(eventRunner, /\/api\/lark\/tasks/, "Event runner must submit to the local Lark task API.");
assertContains(eventRunner, /const dryRun = args\.has\("--dry-run"\)/, "Event runner must support dry-run mode.");
assertContains(eventRunner, /const selfTest = args\.has\("--self-test"\)/, "Event runner must support self-test without calling Feishu.");
assertContains(eventRunner, /result\.status !== "duplicate"/, "Event runner must not reply repeatedly to duplicate launches.");

assertContains(packageJson, /"lark:tasks":\s*"node scripts\/lark-task-runner\.mjs"/, "package.json must expose npm run lark:tasks.");
assertContains(packageJson, /"lark:events":\s*"node scripts\/lark-task-events\.mjs"/, "package.json must expose npm run lark:events.");
assertContains(check, /Lark task launcher check/, "Trellis baseline must include the Lark task launcher check.");

const { parseLarkTaskCommand } = loadTsModule("src/lib/lark-task-launcher.ts", {
  "./activity-log": {
    compactError: (error) => (error instanceof Error ? error.message : String(error)),
    recordExecutionLog: async () => undefined,
  },
  "./config": {
    appConfig: {
      larkTaskDefaultCount: 5,
      larkTaskConfirmAbove: 50,
      larkTaskDefaultPlatforms: ["douyin"],
      larkTaskChatIds: ["oc_allowed"],
      larkTaskUserMap: {},
    },
  },
  "./database": {
    getLarkTaskLaunchByMessageId: async () => undefined,
    getWorkspaceAccountByIdFromDb: async () => undefined,
    saveLarkTaskLaunchToDb: async () => undefined,
  },
  "./simple-runs": {
    startSimpleRun: async () => {
      throw new Error("startSimpleRun should not be called by parser checks.");
    },
  },
});

const pureIdCommand = parseLarkTaskCommand("/flux xiaopeng 3776077");
if (pureIdCommand?.input.sourceMode !== "links") throw new Error("Xiaopeng alias should launch link mode.");
if (pureIdCommand.input.linkPlatform !== "xiaopeng_bbs") throw new Error("Xiaopeng alias should select the Xiaopeng BBS link platform.");
if (pureIdCommand.input.links?.[0] !== "3776077") throw new Error("Xiaopeng alias should preserve pure thread ids for source-link normalization.");

const chineseAliasCommand = parseLarkTaskCommand("/flux \u5c0f\u9e4f\u793e\u533a 3776077");
if (chineseAliasCommand?.input.linkPlatform !== "xiaopeng_bbs") throw new Error("Chinese Xiaopeng BBS alias should select the Xiaopeng BBS platform.");
if (chineseAliasCommand.input.links?.[0] !== "3776077") throw new Error("Chinese Xiaopeng BBS alias should accept pure thread ids.");

const inlinePlatformCommand = parseLarkTaskCommand("/flux links xiaopeng 3776077");
if (inlinePlatformCommand?.input.linkPlatform !== "xiaopeng_bbs") throw new Error("Inline Xiaopeng token after links should select Xiaopeng BBS.");
if (inlinePlatformCommand.input.links?.[0] !== "3776077") throw new Error("Inline Xiaopeng link mode should accept pure thread ids.");

const fullUrlCommand = parseLarkTaskCommand("/flux xiaopeng https://bbs.xiaopeng.com/thread/3776077?tidType=1");
if (fullUrlCommand?.input.links?.[0] !== "https://bbs.xiaopeng.com/thread/3776077?tidType=1") {
  throw new Error("Xiaopeng BBS full URLs should remain valid link inputs.");
}

const viralCommand = parseLarkTaskCommand("/flux viral keyword=小鹏G6 https://example.com/viral-post");
if (viralCommand?.input.sourceMode !== "viral") throw new Error("Explicit viral mode should launch simple viral replication.");
if (viralCommand.input.keyword !== "小鹏G6") throw new Error("Viral command should use keyword as the target vehicle/product.");
if (viralCommand.input.viralUrl !== "https://example.com/viral-post") throw new Error("Viral command should preserve the source viral URL.");
if (viralCommand.input.targetCount !== 1) throw new Error("Viral command targetCount must be fixed to one generated post.");
if (viralCommand.input.platforms.length !== 0 || viralCommand.input.materialPaths.length !== 0) {
  throw new Error("Viral command should not inherit keyword platforms or chat material paths by default.");
}

const chineseViralCommand = parseLarkTaskCommand("/flux 爆款复刻 车型=小鹏G6 https://example.com/cn-viral");
if (chineseViralCommand?.input.sourceMode !== "viral") throw new Error("Chinese viral aliases should launch viral mode instead of link mode.");
if (chineseViralCommand.input.keyword !== "小鹏G6") throw new Error("Chinese viral command should use vehicle as the target keyword.");
if (chineseViralCommand.input.viralUrl !== "https://example.com/cn-viral") throw new Error("Chinese viral command should keep the source viral URL.");

let missingViralUrlError = "";
try {
  parseLarkTaskCommand("/flux viral keyword=小鹏G6");
} catch (error) {
  missingViralUrlError = error instanceof Error ? error.message : String(error);
}
if (!/Viral source URL is required/i.test(missingViralUrlError)) {
  throw new Error("Viral command without a URL should fail clearly instead of launching a keyword task.");
}

console.log("Lark task launcher check passed.");
