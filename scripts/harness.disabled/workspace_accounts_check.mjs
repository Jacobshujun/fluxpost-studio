import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

const files = {
  types: read("src/lib/types.ts"),
  database: read("src/lib/database.ts"),
  ownership: read("src/lib/workspace-ownership.ts"),
  accountsLib: read("src/lib/workspace-accounts.ts"),
  accountsRoute: read("src/app/api/accounts/route.ts"),
  sessionRoute: read("src/app/api/accounts/session/route.ts"),
  simpleRoute: read("src/app/api/simple/runs/route.ts"),
  simpleRuns: read("src/lib/simple-runs.ts"),
  publishRoute: read("src/app/api/publish/feishu/route.ts"),
  publishQueue: read("src/lib/feishu-publish-queue.ts"),
  contentPool: read("src/lib/content-pool.ts"),
  generatedPosts: read("src/lib/generated-posts.ts"),
  materialLibrary: read("src/lib/material-library.ts"),
  activityLog: read("src/lib/activity-log.ts"),
  store: read("src/lib/store.ts"),
  page: read("src/app/page.tsx"),
  httpSmoke: read("scripts/harness/http_smoke.js"),
  schema: read("db/migrations/001_initial_postgres.sql"),
};

assertContains(files.types, /export type WorkspaceAccount = \{[\s\S]*passwordSet\?:\s*boolean/, "WorkspaceAccount must expose password setup state.");
assertContains(files.types, /export type WorkspaceSession = \{[\s\S]*tokenHash:\s*string/, "WorkspaceSession type is missing.");

for (const table of ["workspace_accounts", "workspace_sessions"]) {
  assertContains(files.schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`), `PostgreSQL schema missing ${table}.`);
  assertContains(files.database, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`), `Runtime schema missing ${table}.`);
}

[
  "countWorkspaceAccountsInDb",
  "readWorkspaceAccountsFromDb",
  "saveWorkspaceAccountToDb",
  "saveWorkspaceSessionToDb",
  "getWorkspaceSessionByTokenHashFromDb",
  "revokeWorkspaceSessionByTokenHashInDb",
  "revokeWorkspaceSessionsByAccountIdInDb",
].forEach((name) => assertContains(files.database, new RegExp(`export async function ${name}\\b`), `Database helper ${name} is missing.`));

assertContains(files.ownership, /canAccessWorkspaceOwner/, "Workspace owner access helper is missing.");
assertContains(files.ownership, /filterWorkspaceOwnedRecords/, "Workspace owner filtering helper is missing.");
assertContains(files.ownership, /ownerUserId/, "Workspace owner helper must use ownerUserId.");

assertContains(files.accountsLib, /workspaceSessionCookieName\s*=\s*"fluxpost_session"/, "Session cookie name must be stable.");
assertContains(files.accountsLib, /enterExecutionLogOwner\(account\)/, "Authenticated requests must enter execution-log owner context.");
assertContains(files.accountsLib, /deriveScrypt\(password,\s*salt/, "Password hashing must use Node scrypt.");
assertContains(files.accountsLib, /timingSafeEqual/, "Password verification must use timing-safe comparison.");
assertContains(files.accountsLib, /hashSessionToken\(token\)/, "Session tokens must be hashed before lookup.");
assertContains(files.accountsLib, /WORKSPACE_AUTH_MODE\?\.[\s\S]*=== "accounts" \? "accounts" : "whitelist"/, "Whitelist auth should remain the default.");
assertContains(files.accountsLib, /WORKSPACE_ALLOWED_USERS/, "Workspace whitelist users env wiring is missing.");
assertContains(files.accountsLib, /WORKSPACE_ADMIN_USERS/, "Workspace admin env wiring is missing.");
assertContains(files.accountsLib, /WORKSPACE_ACCESS_PASSWORD/, "Workspace setup password env wiring is missing.");
assertContains(files.accountsLib, /whitelistAccountIdPrefix\s*=\s*"whitelist:"/, "Whitelist account ids must stay stable.");
const whitelistAuthBlock = extractFunctionBlock(files.accountsLib, "authenticateWhitelistedWorkspaceAccount");
assertContains(whitelistAuthBlock, /getWorkspaceAccountByUsernameFromDb\(username\)[\s\S]*verifyPassword\(password,\s*account\.passwordHash\)/, "Whitelist login must use per-user account-table password hashes.");
assertNotContains(whitelistAuthBlock, /isSharedAccessPasswordValid|WORKSPACE_ACCESS_PASSWORD/, "Whitelist login must not authenticate only with the shared password.");

assertContains(files.accountsRoute, /isWorkspaceWhitelistAdminUsername/, "Account route must restrict first whitelist admin bootstrap.");
assertContains(files.accountsRoute, /isWorkspaceSetupPasswordValid/, "Account route must require setup password for first admin bootstrap.");
assertContains(files.accountsRoute, /export async function PATCH/, "Account route must support admin account updates.");
assertContains(files.accountsRoute, /isWorkspaceAdmin\(actor\)/, "Account management must require an admin actor.");
assertContains(files.sessionRoute, /authenticateWorkspaceAccount/, "Session route must authenticate accounts.");
assertContains(files.sessionRoute, /httpOnly:\s*true/, "Session cookie must be HttpOnly.");

for (const typeName of ["ContentProject", "NormalizedSourceItem", "GeneratedPost", "BatchProductionJob", "MaterialFolder", "MaterialLibraryAsset", "ExecutionLogEntry", "CrawlJob", "SimpleRun"]) {
  assertContains(files.types, new RegExp(`export type ${typeName} = \\{[\\s\\S]*ownerUserId\\?:\\s*string`), `${typeName} must carry ownerUserId.`);
}

assertContains(files.contentPool, /normalizeProjectKey\(query,\s*owner\?\.ownerUserId\)/, "Content projects must use owner-scoped project keys.");
assertContains(files.contentPool, /filterWorkspaceOwnedRecords\(pool\.projects/, "Content-pool reads must filter by owner.");
assertContains(files.generatedPosts, /filterWorkspaceOwnedRecords\(store\.posts/, "Generated-post reads must filter by owner.");
assertContains(files.materialLibrary, /scopeLibrary\(normalizeLibrary\(store\),\s*account\)/, "Material library reads must filter by owner.");
assertContains(files.activityLog, /listExecutionLogs\(limit = 120,\s*account/, "Activity log reads must accept an owner account.");
assertContains(files.activityLog, /enterExecutionLogOwner/, "Activity log must expose request owner context.");
assertContains(files.activityLog, /ownerUserId:\s*input\.ownerUserId \|\| owner\?\.ownerUserId/, "Activity log writes must stamp the current owner context.");
assertContains(files.store, /filterWorkspaceOwnedRecords\(await listCrawlJobsFromDb\(\),\s*account\)/, "Crawl-job store reads must filter by owner.");

assertContains(files.simpleRoute, /listSimpleRuns\(20,\s*account\)/, "Simple run GET must filter by account.");
assertContains(files.simpleRoute, /ownerUserId:\s*account\.id/, "Simple run POST must persist owner user id.");
assertContains(files.simpleRuns, /runWithSimpleRunOwner/, "Simple-run worker logs/work must run under the run owner.");
assertContains(files.simpleRuns, /ingestSimpleTaggedItems\(normalizedInput,\s*taggedItems,\s*access\)/, "Simple-run workflow must route tagged ingest through the owner-aware helper.");
assertContains(files.simpleRuns, /if \(!isSimpleRunFeishuMode\(input\)\) \{[\s\S]*ingestCrawlItems\(input\.keyword,\s*taggedItems,\s*access\)/, "Simple-run keyword/link ingest must stamp owner.");
assertContains(files.simpleRuns, /ownerUserId:\s*run\.input\.ownerUserId \|\| "local"/, "Simple-run Feishu publish must use the run owner.");
assertContains(files.simpleRuns, /ownerDisplayName:\s*run\.input\.ownerDisplayName/, "Simple-run Feishu publish must keep the run owner display name.");

assertContains(files.publishRoute, /getGeneratedPost\(post\.id,\s*account\)/, "Manual Feishu publish must reload posts through account scope.");
assertContains(files.publishRoute, /ownerUserId:\s*account\.id/, "Manual Feishu publish must use current account as owner.");
assertContains(files.publishRoute, /ownerDisplayName:\s*account\.displayName/, "Manual Feishu publish must keep current account display name.");
assertContains(files.publishQueue, /ownerDisplayName\?:\s*string/, "Feishu publish queue enqueue options must carry owner display name.");
assertContains(files.publishQueue, /const ownerUserId = \(options\.ownerUserId \|\| defaultOwnerUserId\)\.trim\(\) \|\| defaultOwnerUserId/, "Feishu publish queue must use the current publisher as queue owner.");
assertContains(files.publishQueue, /const publishPosts = normalizePosts\(await enrichPostsWithContentTags\(posts\)\)/, "Feishu publish queue must preserve each generated post owner when enqueueing.");
assertNotContains(files.publishQueue, /applyWorkspaceOwner\(post,\s*ownerAccess,\s*post\)/, "Feishu publish queue must not rewrite post ownership to the queue owner.");
assertContains(files.publishQueue, /listFeishuPublishJobs\(limit = 50,\s*account/, "Feishu publish job listing must filter by owner.");
assertContains(files.publishQueue, /filterWorkspaceOwnedRecords\(await readFeishuPublishJobsFromDb\(limit\),\s*account\)/, "Feishu queue reads must apply owner filtering.");
assertNotContains(files.publishRoute, /ownerUserId:\s*"local"/, "Manual Feishu publish route must not hard-code ownerUserId local.");

for (const route of [
  "src/app/api/content-pool/route.ts",
  "src/app/api/content/items/route.ts",
  "src/app/api/crawl/jobs/route.ts",
  "src/app/api/materials/library/route.ts",
  "src/app/api/production/batches/route.ts",
  "src/app/api/production/posts/route.ts",
  "src/app/api/activity/route.ts",
  "src/app/api/simple/runs/route.ts",
  "src/app/api/publish/feishu/route.ts",
]) {
  assertContains(read(route), /const account = await requireWorkspaceAccount\(request\)/, `${route} must require account before reading workspace content.`);
}

assertContains(files.page, /AccountAccessPanelV2/, "Frontend must render the account access panel.");
assertContains(files.page, /AccountMenuV2/, "Frontend must render the admin-capable account menu.");
assertContains(files.page, /初始化管理员/, "Frontend must expose first-admin initialization.");
assertContains(files.page, /保存账号/, "Frontend admin menu must expose account management.");
assertContains(files.httpSmoke, /expectStatus\("\/api\/content-pool",\s*undefined,\s*401\)/, "HTTP smoke must verify private content GETs reject unauthenticated access.");

console.log("Workspace accounts and owner isolation check ok");

function read(relativePath) {
  const filePath = path.join(projectRoot, relativePath);
  if (!existsSync(filePath)) throw new Error(`Missing file: ${relativePath}`);
  return readFileSync(filePath, "utf8");
}

function assertContains(value, pattern, message) {
  if (!pattern.test(value)) throw new Error(message);
}

function assertNotContains(value, pattern, message) {
  if (pattern.test(value)) throw new Error(message);
}

function extractFunctionBlock(value, functionName) {
  const marker = `function ${functionName}`;
  const start = value.indexOf(marker);
  if (start < 0) throw new Error(`Missing function: ${functionName}`);
  const bodyStart = value.indexOf("{", start);
  if (bodyStart < 0) throw new Error(`Missing function body: ${functionName}`);
  let depth = 0;
  for (let index = bodyStart; index < value.length; index += 1) {
    const char = value[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return value.slice(start, index + 1);
    }
  }
  throw new Error(`Unclosed function body: ${functionName}`);
}
