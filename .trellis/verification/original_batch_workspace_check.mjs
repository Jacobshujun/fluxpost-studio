import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const contains = (source, pattern, message) => assert(pattern.test(source), message);

const catalog = read("src/lib/xhs-card-series.ts");
const service = read("src/lib/original-batches.ts");
const orchestrator = read("src/lib/original-card-orchestrator.ts");
const types = read("src/lib/types.ts");
const database = read("src/lib/database.ts");
const postgres = read("db/migrations/001_initial_postgres.sql");
const migration = read("db/migrations/003_original_batches.sql");
const collectionRoute = read("src/app/api/original/batches/route.ts");
const detailRoute = read("src/app/api/original/batches/[id]/route.ts");
const regenerateRoute = read("src/app/api/original/cards/regenerate/route.ts");
const page = read("src/app/original/page.tsx");
const css = read("src/app/original/original.module.css");
const review = read("src/app/review/page.tsx");
const notice = read("THIRD_PARTY_NOTICES.md");

function arrayValues(name) {
  const match = catalog.match(new RegExp(`export const ${name} = \\[([^\\]]+)\\] as const`));
  assert(match, `${name} must be a literal versioned catalog.`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

assert(arrayValues("xhsStyles").length === 12, "XHS catalog must expose 12 styles.");
assert(arrayValues("xhsLayouts").length === 8, "XHS catalog must expose 8 layouts.");
assert(arrayValues("xhsPalettes").length === 3, "XHS catalog must expose 3 palettes.");
contains(catalog, /clampInteger\(rawCards\.length \|\| 5, 2, 10\)/, "Automatic plans must stay within 2-10 cards.");
contains(catalog, /profile === "openai_json"[\s\S]*1024x1536[\s\S]*effectiveRatio: "2:3"/, "OpenAI JSON must use explicit 1024x1536 2:3 compatibility.");
contains(catalog, /profile === "toapis_async"[\s\S]*1200x1600[\s\S]*ratio: "3:4"/, "ToAPIs must request a real 3:4 canvas.");
contains(catalog, /styleSpecs\[input\.style\]/, "Card prompts must use the structured style catalog.");
contains(catalog, /layoutSpecs\[card\.layout\]/, "Card prompts must use the structured layout catalog.");

contains(service, /items\.length < 1 \|\| items\.length > 100/, "Batch validation must enforce 1-100 non-empty rows.");
contains(service, /item\.topic\.length > 120/, "Topic validation must cap at 120 characters.");
contains(service, /item\.requirements\?\.length \|\| 0\) > 4_000/, "Requirements validation must cap at 4000 characters.");
contains(service, /item\.vehicleKeyword\?\.length \|\| 0\) > 96/, "Vehicle keyword validation must cap at 96 characters.");
contains(service, /createOriginalBatchRecords\(batch, items, queueItems\)/, "Validated batches must use one atomic persistence boundary.");
contains(service, /generateCoverAnchoredCards\(series\.cards/, "Production workers must use the tested cover-anchor orchestrator.");
contains(service, /let writing = item\.writing/, "Paused items must reuse their persisted writing snapshot.");
contains(service, /let series = item\.series/, "Paused items must reuse their persisted structured card series.");
contains(orchestrator, /await generateCard\(cards\[0\], \[\], deps\)/, "Cover generation must happen first without a reference.");
contains(orchestrator, /Promise\.allSettled\(cards\.slice\(1\)\.map\(\(card\) => generateCard\(card, \[coverUrl\], deps\)\)\)/, "Later cards must run in parallel with the cover as sole anchor and settle before requeue.");
contains(orchestrator, /generateCandidate\(card, correction, referenceImages, deps, true\)/, "A failed QA card must have exactly one explicit image retry path.");
assert((orchestrator.match(/generateCandidate\(card, correction/g) || []).length === 1, "QA correction must not contain a second automatic retry path.");
contains(orchestrator, /providerTaskId\?: string;[\s\S]*providerTaskRoute\?: "primary" \| "backup";[\s\S]*providerStatus\?: string;/, "Card orchestration must retain accepted provider task identity.");
contains(orchestrator, /result\.status === "pending"[\s\S]*providerTaskId[\s\S]*status = "generating"/, "Accepted image work must remain resumable instead of becoming needs_review.");
contains(service, /resumeTaskId: isOriginalCardProviderPending\(card\) \? card\.providerTaskId : undefined[\s\S]*resumeTaskRoute: isOriginalCardProviderPending\(card\) \? card\.providerTaskRoute : undefined[\s\S]*onTaskUpdate:/, "Original workers must resume and persist the accepted image task instead of resubmitting it.");
contains(service, /requeueOriginalBatchItem\(queueItem\.itemId, originalBatchProviderPollDelayMs\)[\s\S]*setTimeout\(ensureOriginalBatchWorker, originalBatchProviderPollDelayMs\)/, "Pending provider work must be delayed and wake the original worker for polling.");
contains(service, /requeueExpiredOriginalBatchQueueItemsWithProviderTasks\(\)[\s\S]*failExpiredOriginalBatchQueueItems\(\)/, "Startup recovery must requeue persisted provider tasks before failing ambiguous expired work.");
contains(service, /regenerateOriginalSeriesCard[\s\S]*onTaskUpdate:[\s\S]*result\.status === "pending"[\s\S]*requeueOriginalBatchItem/, "Review regeneration must persist and resume an accepted asynchronous image task.");
contains(service, /id: `post-original-batch-\$\{item\.id\}`/, "Generated post ids must be deterministic per batch item.");
contains(service, /feishuVehicle: item\.input\.vehicleKeyword \|\| ""/, "Generic topics must leave Feishu vehicle empty.");
contains(service, /imageUrls: series\.cards\.map/, "Structured card regeneration must re-project imageUrls.");

for (const table of ["original_batches", "original_batch_items", "original_batch_queue"]) {
  contains(postgres, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`), `${table} must exist in the PostgreSQL base migration.`);
  contains(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`), `${table} must exist in the additive migration.`);
  assert((database.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, "g")) || []).length >= 2, `${table} must exist in both embedded runtime schemas.`);
}
contains(database, /FOR UPDATE OF queue SKIP LOCKED/, "PostgreSQL claims must use SKIP LOCKED.");
contains(database, /requeueOriginalBatchItem\(itemId: string, delayMs = 0\)[\s\S]*Date\.now\(\) \+ delayMs/, "Original queue re-entry must support a deterministic provider polling delay.");
contains(database, /requeueExpiredOriginalBatchQueueItemsWithProviderTasks\(\)[\s\S]*providerTaskId[\s\S]*providerStatus/, "Expired original work with a resumable provider task must be requeued atomically.");
contains(database, /runSqliteTransaction\(db, \(\) => \{[\s\S]*original_batches[\s\S]*original_batch_items[\s\S]*original_batch_queue/, "SQLite batch creation must be transactional.");
contains(types, /sourceBatchId\?: string;[\s\S]*sourceBatchItemId\?: string;[\s\S]*xhsSeries\?: XhsCardSeries;/, "GeneratedPost must carry batch and XHS series metadata.");

for (const route of [collectionRoute, detailRoute, regenerateRoute]) contains(route, /requireWorkspaceAccount\(request\)/, "Every original API route must require workspace authentication.");
contains(detailRoute, /"pause" \| "resume" \| "cancel" \| "retry_failed"/, "Detail API must expose all lifecycle actions.");
contains(collectionRoute, /rowErrors: error\.errors/, "Atomic validation failures must return row-level errors.");
contains(page, /function parseTsv/, "Original workspace must parse pasted TSV.");
contains(page, /slice\(0, 100\)/, "Pasted TSV must stay bounded to 100 rows.");
contains(page, /action: "preflight"/, "The workspace must preflight before creation.");
contains(css, /@media \(max-width: 760px\)[\s\S]*\.desktopTable,[\s\S]*display: none;[\s\S]*\.mobileRows[\s\S]*display: grid;/, "Mobile must switch from the table to stable row panels.");
contains(review, /sourceBatchId/, "Review deep links must filter batch results.");
contains(review, /review-series-candidates/, "Review must display card candidates.");
contains(review, /\/api\/original\/cards\/regenerate/, "Review must use anchor-aware series regeneration.");
contains(review, /pending\?: boolean[\s\S]*data\.pending[\s\S]*后台继续生成/, "Review must report accepted asynchronous card regeneration without claiming immediate completion.");
contains(notice, /baoyu-xhs-images[\s\S]*2\.0\.1[\s\S]*6b7a2e417500561a5ecdd0b168332f4142584617[\s\S]*MIT License/, "Third-party notice must preserve source, version, commit and MIT license.");

console.log("Original batch workspace check passed.");
