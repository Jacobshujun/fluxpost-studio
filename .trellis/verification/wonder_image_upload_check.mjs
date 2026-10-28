import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";
import sharp from "sharp";

const root = process.cwd(), require = createRequire(import.meta.url);
const temporary = await mkdtemp(path.join(tmpdir(), "wonder-upload-"));
const persisted = [];
let signedIn = true;
const stubs = {
  "./runtime-media-storage": { persistRuntimeMedia: async (input) => { persisted.push(input); return input.publicPath; } },
  "@/lib/runtime-media-storage": { isRuntimeMediaStorageEnabled: () => false, isTosRuntimeMediaConfigured: () => false },
  "@/lib/workspace-accounts": { requireWorkspaceAccount: async () => { if (!signedIn) throw new Error("fixture sign-in"); return { id: "fixture" }; }, isWorkspaceSignInError: (error) => error.message === "fixture sign-in" },
};
function load(file) {
  const loadedModule = { exports: {} };
  const output = ts.transpileModule(readFileSync(path.join(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  Function("require", "module", "exports", output)((name) => name in stubs ? stubs[name] : name.startsWith(".") ? load(path.posix.normalize(path.posix.join(path.posix.dirname(file), name + ".ts"))) : require(name), loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
try {
  process.chdir(temporary);
  const uploader = load("src/lib/runtime-image-upload.ts");
  stubs["@/lib/runtime-image-upload"] = uploader;
  stubs["@/lib/wonder-image-contract"] = load("src/lib/wonder-image-contract.ts");
  const route = load("src/app/api/canvas/media/route.ts");
  const bytes = await sharp({ create: { width: 512, height: 512, channels: 3, background: "red" } }).png().toBuffer();
  async function post(files, mode = "wonder-reference") {
    const form = new FormData();
    form.set("mode", mode);
    files.forEach((file) => form.append("files", file));
    return route.POST(new Request("http://localhost/api/canvas/media", { method: "POST", body: form }));
  }
  const result = await post([new File([bytes], "fixture.png", { type: "image/png" })]);
  assert.equal(result.status, 201);
  assert.equal((await result.json()).images[0].mimeType, "image/png");
  assert.deepEqual(await readFile(persisted[0].filePath), bytes);
  const webp = await sharp(bytes).webp().toBuffer();
  assert.equal((await post([new File([webp], "fixture.webp", { type: "image/webp" })])).status, 201);
  const small = await sharp(bytes).resize(399, 512).png().toBuffer();
  const wide = await sharp({ create: { width: 8001, height: 400, channels: 3, background: "red" } }).png().toBuffer();
  const gif = await sharp(bytes).gif().toBuffer();
  for (const [buffer, mime] of [[small, "image/png"], [wide, "image/png"], [gif, "image/gif"], [Buffer.from("corrupt"), "image/png"], [Buffer.alloc(20 * 1024 * 1024 + 1), "image/png"]]) {
    const before = persisted.length;
    const response = await post([new File([buffer], "invalid", { type: mime })]);
    assert.equal(response.status, 400, JSON.stringify(await response.json()));
    assert.equal(persisted.length, before, "Invalid references must never reach storage.");
  }
  assert.equal((await post([new File([small], "small.png", { type: "image/png" })], "gpt-reference")).status, 201, "GPT ingress keeps its existing pixel contract.");
  assert.equal((await post([new File([gif], "fixture.gif", { type: "image/gif" })], "gpt-reference")).status, 400);
  signedIn = false;
  let parsed = false;
  const denied = await route.POST({ formData: async () => { parsed = true; throw new Error("Must not parse before auth"); } });
  assert.equal(denied.status, 401); assert.equal(parsed, false);
  console.log("Wonder reference upload: real bytes, formats, size/dimensions before persistence, auth and unchanged GPT ingress passed.");
} finally {
  process.chdir(root);
  assert.ok(path.resolve(temporary).startsWith(path.resolve(tmpdir()) + path.sep));
  await rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
