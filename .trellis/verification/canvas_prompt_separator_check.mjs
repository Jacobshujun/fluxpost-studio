import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync("src/lib/canvas/scalar-values.ts", "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function("require", "module", "exports", output)(require, loaded, loaded.exports);
const { parseCanvasScheduleScalarValues: parse, formatCanvasScheduleScalarValues: format } = loaded.exports;

const prompts = ["Top: car A\n  Caption: A\n\nBottom: car B\nText: B --- detail", "Top: car C\n\nBottom: car D"];
assert.deepEqual(parse("text", prompts.join("\n---\n"), "manual-list", "delimiter"), prompts);
assert.deepEqual(parse("text", prompts.join("\r\n \t--- \t\r\n"), "manual-list", "delimiter"), prompts);
assert.deepEqual(parse("text", "---\n\n---\n" + prompts[0] + "\n---\n", "manual-list", "delimiter"), [prompts[0]]);
assert.deepEqual(parse("text", "---\n \n---", "manual-list", "delimiter"), [""]);
assert.deepEqual(parse("text", "  A\n\n B \n", "manual-list"), ["A", "B"]);
assert.deepEqual(parse("text", "A --- B\n----\n --", "manual-list", "delimiter"), ["A --- B\n----\n --"]);
assert.deepEqual(parse("text", "  " + prompts[0] + "\n", "fixed"), ["  " + prompts[0] + "\n"]);
assert.deepEqual(parse("number", "1\n2.5\n", "manual-list"), [1, 2.5]);
assert.deepEqual(parse("boolean", "true\nfalse\n1", "manual-list"), [true, false, true]);
assert.deepEqual(parse("enum", "first\nsecond", "fixed"), ["first"]);
const restored = JSON.parse(JSON.stringify({ mode: "manual-list", values: prompts, listSeparator: "delimiter" }));
assert.equal(format(restored), prompts.join("\n---\n"));
assert.deepEqual(parse("text", format(restored), restored.mode, restored.listSeparator), prompts);
console.log("Canvas prompt separator parser/format checks passed.");
