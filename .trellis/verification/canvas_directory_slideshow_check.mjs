import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (file) => readFileSync(path.join(process.cwd(), file), "utf8");
const types = read("src/lib/canvas/types.ts");
const registry = read("src/lib/canvas/registry.ts");
const directory = read("src/lib/canvas/directory-snapshots.ts");
const media = read("src/lib/canvas/media-tools.ts");
const workflow = read("src/lib/canvas/workflow-file.ts");
const schema = read("db/migrations/001_initial_postgres.sql");

assert.match(types, /"input\.local-directory"/);
assert.match(types, /"utility\.image-slideshow"/);
assert.match(types, /"directory-group"/);
assert.match(registry, /id: "audios", label: "音乐", kind: "audios"/);
assert.match(registry, /id: "audio", label: "音乐", kind: "audios", required: true/);
assert.match(directory, /maxGroups: 200, maxMediaPerGroup: 250, maxFiles: 5000/);
assert.match(directory, /createCanvasDirectorySnapshotInDb/);
assert.match(directory, /Source file changed/);
assert.match(media, /"-profile:v", "main", "-level", "4\.0"/);
assert.match(media, /"-pix_fmt", "yuv420p"/);
assert.match(media, /"-ar", "48000", "-ac", "2"/);
assert.match(media, /runWithConcurrencyPool\("localVideo"/);
assert.match(workflow, /path: "", snapshotId: "", groupId: "", selectedAudioId: ""/);
assert.match(schema, /CREATE TABLE IF NOT EXISTS canvas_directory_snapshots/);
console.log("Canvas directory and slideshow contracts passed.");
