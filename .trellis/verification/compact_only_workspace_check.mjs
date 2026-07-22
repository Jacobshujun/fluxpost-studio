import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (filePath) => readFileSync(path.join(root, filePath), "utf8");

function has(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function lacks(source, pattern, message) {
  if (pattern.test(source)) throw new Error(message);
}

function missing(filePath, message) {
  if (existsSync(path.join(root, filePath))) throw new Error(message);
}

const home = read("src/app/page.tsx");
const content = read("src/app/content/page.tsx");
const postsRoute = read("src/app/api/production/posts/route.ts");
const types = read("src/lib/types.ts");
const database = read("src/lib/database.ts");

has(home, /function CompactWorkspace\(/, "Home must render one compact-only workspace component.");
has(home, /<CompactWorkspace[\s\S]*materialPaths=\{materialLibraryAssetPaths\}/, "Compact workspace must receive material-library paths.");
has(home, /<SimpleOverallProgressBar/, "Compact workspace must retain the overall multi-run progress surface.");
has(home, /href="\/content"/, "Home must retain the content desk entry.");
has(home, /href="\/review"/, "Home must retain the review desk entry.");
has(home, /href="\/distribution-check"/, "Home must retain the distribution audit entry.");
has(home, /href="\/config"/, "Home must retain the admin configuration entry.");

lacks(home, /type WorkspaceMode|WorkspaceModeSwitcher|workspaceMode/, "Home must not keep workspace mode switching.");
lacks(home, /type ActiveModule|ModuleSwitcher|ProductionWorkspace|StudioCommandBar/, "Home must not keep the advanced production workspace.");
lacks(home, /variant=|SimpleWorkspaceVariant|const isCompact/, "Compact workspace must not keep standard/compact variants.");
lacks(home, /简单版|高级版/, "Home must not expose removed mode names.");
lacks(home, /\/api\/generate|\/api\/production\/batches|\/api\/production\/posts\/regenerate/, "Home must not call removed production APIs.");

has(content, /type ContentDeskView = "content" \| "materials"/, "Content desk must own content/material views.");
has(content, /function MaterialLibraryWorkspace\(/, "Content desk must own material-library management UI.");
has(content, /\/api\/materials\/scan/, "Content desk must retain material scanning.");
has(content, /\/api\/materials\/library/, "Content desk must retain material-library CRUD.");
has(content, /onPreviewAsset/, "Content desk must retain material preview actions.");

missing("src/app/api/generate/route.ts", "Advanced single-generate route must be removed.");
missing("src/app/api/production/batches/route.ts", "Advanced batch-production route must be removed.");
missing("src/app/api/production/posts/regenerate/route.ts", "Advanced regenerate route must be removed.");
missing("src/lib/batch-production.ts", "Batch-production domain service must be removed.");

has(postsRoute, /export async function GET\(/, "Generated-post list route must retain GET for the review desk.");
lacks(postsRoute, /export async function (POST|PATCH|DELETE)\(/, "Generated-post list route must be read-only.");
lacks(types, /BatchProductionJob|BatchProductionStatus|ProductionTaskStatus|export type ProductionTask\b/, "Active batch-production types must be removed.");
has(database, /["']batch_jobs["']/, "Historical batch_jobs storage must remain in the database schema.");

console.log("Compact-only workspace check passed.");
