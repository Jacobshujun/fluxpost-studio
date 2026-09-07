import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const page = read("src/app/canvas/page.tsx");
const database = read("src/lib/database.ts");
const library = read("src/lib/library-assets.ts");
const thumbnailRoute = read("src/app/api/library/assets/[id]/thumbnail/route.ts");

assert(page.includes('new URLSearchParams({ limit: "24", count: "0" })'), "Canvas library picker must request a bounded count-free page.");
assert(page.includes("const hasQuery = Boolean(search.trim() || tag.trim() || collectionId)"), "Canvas library picker must stay idle until a filter is entered.");
assert(page.includes("onFocusCapture={() => void ensureNavigation()}"), "Library navigation must load lazily from picker interaction.");
assert(page.includes("thumbnail?variant=square&version=2`}") && page.includes('loading="lazy"'), "Canvas library results must use lazy thumbnails.");
assert(page.includes("className=\"canvas-picker-thumb\" onClick={() => onPreviewImage(url, index)} aria-label") && page.includes("thumbnail?variant=square&version=2` : url"), "Selected library assets must render thumbnails and defer originals to preview.");
assert(page.includes("const CanvasFlowNode = memo(function CanvasFlowNode"), "Canvas nodes must be memoized.");
assert(!page.includes("const isSelected = selected || interaction?.selectedNodeId"), "Canvas node selection must not come from interaction context.");
assert(library.includes("includeTotal: url.searchParams.get(\"count\") !== \"0\""), "Library filter parser must support count-free requests.");
assert(database.includes("if (input.includeTotal === false)"), "Database list query must skip COUNT when requested.");
assert(read("src/lib/types.ts").includes("total?: number"), "Library asset pages must allow an unknown total for count-free queries.");
assert(thumbnailRoute.includes("status: 304") && thumbnailRoute.includes("if-none-match"), "Thumbnail route must support conditional 304 responses.");

console.log("Canvas library performance contracts passed.");
