import assert from "node:assert/strict";
import { createReferenceRewriter, restoreReferenceValue } from "../../scripts/storage/reference-rewrite.mjs";

const sourceOrigin = "https://source.example";
const targetOrigin = "https://target.example";
const prefix = "scope/";
const verifiedKeys = new Set(["scope/a.jpg", "scope/a (1).jpg", "scope/a,b.png", "scope/space name.webp", "scope/utf-\u8f66.png"]);
const rewrite = createReferenceRewriter({ sourceOrigin, targetOrigin, prefix, verifiedKeys });
const old = `${sourceOrigin}/scope/a.jpg`;
const next = `${targetOrigin}/scope/a.jpg`;
const cases = [
  [old, next],
  [`${old}?v=old-etag#preview`, `${next}?v=old-etag#preview`],
  [`${sourceOrigin}/scope/a%20(1).jpg`, `${targetOrigin}/scope/a%20(1).jpg`],
  [`${sourceOrigin}/scope/space name.webp`, `${targetOrigin}/scope/space name.webp`],
  [`${sourceOrigin}/scope/utf-%E8%BD%A6.png`, `${targetOrigin}/scope/utf-%E8%BD%A6.png`],
  [`![image](${old})`, `![image](${next})`],
  [`Text ${old}, then ${old}.`, `Text ${next}, then ${next}.`],
  [`${old}?v=1 then ${old}`, `${next}?v=1 then ${next}`],
  [`${old}?X-Tos-Signature=private`, `${old}?X-Tos-Signature=private`],
  [`${old}?Expires=99`, `${old}?Expires=99`],
  [`${sourceOrigin}/scope/missing.jpg`, `${sourceOrigin}/scope/missing.jpg`],
  [`${sourceOrigin}.evil/scope/a.jpg`, `${sourceOrigin}.evil/scope/a.jpg`],
  [`${sourceOrigin}/outside/a.jpg`, `${sourceOrigin}/outside/a.jpg`],
  [`${sourceOrigin}/scope/%2e%2e/a.jpg`, `${sourceOrigin}/scope/%2e%2e/a.jpg`],
  [`${sourceOrigin}/scope/%zz.jpg`, `${sourceOrigin}/scope/%zz.jpg`],
  [next, next],
];
for (const [before, after] of cases) {
  for (const json of [false, true]) {
    const input = json ? JSON.stringify({ url: before, nested: [before], status: "completed" }) : before;
    const expected = json ? JSON.stringify({ url: after, nested: [after], status: "completed" }) : after;
    const result = rewrite(input, json);
    assert.equal(result.value, expected);
    assert.equal(restoreReferenceValue(result.value, result), input);
    assert.equal(rewrite(result.value, json).patches.length, 0);
  }
}
const raw = `{"${old}": "unchanged-key", "large": 18446744073709551615, "small": 0.000000000000000001, "url": "${old}", "existing": "${next}"}`;
const result = rewrite(raw);
assert.ok(result.value.includes('18446744073709551615'));
assert.ok(result.value.includes('0.000000000000000001'));
assert.ok(result.value.includes(`"${old}":`));
assert.equal(restoreReferenceValue(result.value, result), raw);
assert.throws(() => restoreReferenceValue(result.value + " ", result), /ConcurrentChange/);
assert.throws(() => createReferenceRewriter({ sourceOrigin: "http://unsafe", targetOrigin, prefix, verifiedKeys }), /InvalidStorageOrigin/);
console.log("Storage references: exact verified URLs, unknown/signed preservation, nested JSON, punctuation, numeric precision, idempotence and conflict-checked reversal passed.");
