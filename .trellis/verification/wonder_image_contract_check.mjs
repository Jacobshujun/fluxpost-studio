import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const loadedModule = { exports: {} };
Function("module", "exports", ts.transpileModule(readFileSync("src/lib/wonder-image-contract.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(loadedModule, loadedModule.exports);
const { buildWonderImageRequest: build, validateWonderEndpoint: endpoint, wonderSubmittedJobId: submitted, wonderImportedMediaId: imported, wonderExistingMediaId: existing, wonderMediaReady: ready, wonderJobResult: result } = loadedModule.exports;
const valid = "https://yike.cn-shanghai.aliyuncs.com/";
assert.equal(endpoint(valid), valid);
assert.equal(endpoint("https://yike.ap-southeast-1.aliyuncs.com/"), "https://yike.ap-southeast-1.aliyuncs.com/");
for (const invalid of ["", valid.replace("https:", "http:"), `${valid}?key=secret`, `${valid}path`, valid.replace("yike.cn-shanghai", "localhost")]) assert.throws(() => endpoint(invalid));
const base = { prompt: " city ", model: "qwen-image-3.0", mediaIds: [], count: 1, resolution: "1K", aspectRatio: "16:9" };
assert.deepEqual(build(base), { JobType: "text_to_image", Model: "qwen-image-3.0", Scene: "general", Input: '{"Prompt":"city"}', Resolution: "1K", AspectRatio: "16:9", N: "1" });
const edited = build({ ...base, mediaIds: ["a", "a", "b"], count: 4, resolution: "4K", aspectRatio: "1:1" });
assert.equal(edited.JobType, "image_to_image");
assert.deepEqual(JSON.parse(edited.Input), { Prompt: "city", Medias: [{ Type: "image", MediaId: "a" }, { Type: "image", MediaId: "a" }, { Type: "image", MediaId: "b" }] });
for (const patch of [{ mediaIds: Array(10).fill("a") }, { count: 1.5 }, { count: 5 }, { model: " " }, { resolution: "720P" }, { aspectRatio: "2:3" }, { prompt: " " }]) assert.throws(() => build({ ...base, ...patch }));
assert.equal(submitted({ JobId: " ag_test " }), "ag_test");
assert.equal(imported({ MediaId: "media_test" }), "media_test");
const existingId = "0123456789abcdef0123456789abcdef";
const duplicate = { Code: "MediaAlreadyExist", Message: `The media with the given inputUrl "https://private.example/ref.png?Signature=secret" has already been registered with mediaId "${existingId}".` };
assert.equal(existing(duplicate), existingId);
assert.equal(existing({ Code: "MediaAlreadyExist", MediaId: existingId }), existingId);
assert.equal(existing({ code: "MediaAlreadyExist", message: duplicate.Message }), existingId);
for (const invalid of [undefined, [], { Code: "Forbidden", MediaId: existingId, Message: duplicate.Message }, { Code: "MediaAlreadyExist" },
  { Code: "MediaAlreadyExist", Message: 'mediaId "bogus-id" is in the inputUrl' },
  { Code: "MediaAlreadyExist", Message: `https://private.example/?mediaId="${existingId}"` },
  ...["", "short", "../media-existing", "media-existing?secret=private", "x".repeat(257)].map((id) => ({ Code: "MediaAlreadyExist", MediaId: id, Message: `has already been registered with mediaId "${id}".` })),
]) assert.equal(existing(invalid), undefined, "Unknown/invalid duplicate responses must not invent a usable ID.");
assert.equal(ready({ MediaInfo: { MediaBasicInfo: { Status: "Normal" } } }), true);
assert.equal(ready({ MediaInfo: { MediaBasicInfo: { Status: "Processing" } } }), false);
assert.throws(() => ready({ MediaInfo: { MediaBasicInfo: { Status: "Failed" } } }));
const thirdParty = (status) => ({ MediaInfo: { MediaBasicInfo: { Status: "Normal" }, MediaDynamicInfo: { DynamicMetaData: { Data: JSON.stringify({ ThirdPartyAssetStatus: status }) } } } });
assert.equal(ready(thirdParty("Processing"), true), false);
assert.equal(ready(thirdParty("Success"), true), true);
assert.equal(ready({ MediaInfo: { MediaBasicInfo: { Status: "Normal" } } }, true), false);
assert.throws(() => ready(thirdParty("Failed"), true));
assert.throws(() => ready({ MediaInfo: { MediaBasicInfo: { Status: "Normal" }, MediaDynamicInfo: { DynamicMetaData: { Data: "invalid" } } } }, true));
for (const status of ["Created", "Queuing", "Executing"]) assert.deepEqual(result({ ImageGenerationJob: { Status: status } }), { status, urls: [] });
const image = "https://example.aliyuncs.com/image.webp?Signature=secret";
assert.deepEqual(result({ ImageGenerationJob: { Status: "Finished", Output: JSON.stringify({ Medias: [{ MediaId: "one", OutputUrl: image }] }) } }), { status: "Finished", urls: [image] });
assert.throws(() => result({ ImageGenerationJob: { Status: "Failed", ErrorMessage: `Rejected https://signed.invalid/?key=secret` } }), (error) => !error.message.includes("https://"));
for (const invalid of [{}, { Status: "Unknown" }, { Status: "Finished", Output: "bad" }, { Status: "Finished", Output: "{}" }]) assert.throws(() => result({ ImageGenerationJob: invalid }));
console.log("Wonder Image API, validation, media and job-result contracts passed.");
