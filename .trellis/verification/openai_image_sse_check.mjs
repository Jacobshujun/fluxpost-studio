import assert from "node:assert/strict";
import { decodeOpenAiImageSseChunks, fetchOpenAiImageSse } from "../../src/lib/openai-image-sse.ts";

function streamText(events) {
  return events.join("\r\n\r\n") + "\r\n\r\n";
}

const payload = streamText([
  ["event: image_generation.partial_image", 'data: {"type":"image_generation.partial_image","b64_json":"cGFydGlhbA=="}'].join("\r\n"),
  ["event: image_generation.completed", 'data: {"type":"image_generation.completed",', 'data: "b64_json":"ZmluYWw="}'].join("\r\n"),
  "data: [DONE]",
]);
const bytes = new TextEncoder().encode(payload);
const chunks = [];
for (let index = 0; index < bytes.length; index += 3) chunks.push(bytes.slice(index, index + 3));

const result = decodeOpenAiImageSseChunks(chunks);
assert.deepEqual(result.response, { data: [{ b64_json: "ZmluYWw=" }] });
assert.equal(result.stats.partialEventCount, 1);
assert.equal(result.stats.completionEventCount, 1);
assert.equal(result.stats.eventCount, 2);
assert.equal(result.stats.sawDone, true);

assert.throws(
  () => decodeOpenAiImageSseChunks(["event: error\ndata: {\"error\":{\"message\":\"provider failed\"}}\n\n"]),
  /provider failed/,
);
assert.throws(() => decodeOpenAiImageSseChunks(["data: [DONE]\n\n"]), /final image/i);
assert.throws(() => decodeOpenAiImageSseChunks(["data: {\"type\":\"image_generation.completed\",\"b64_json\":\"x\"}\n\n"]), /DONE/i);
assert.throws(() => decodeOpenAiImageSseChunks(["data: {not-json}\n\n"]), /invalid JSON/i);

const httpResult = await fetchOpenAiImageSse("https://example.invalid/images/generations", {}, 100, async () =>
  new Response(payload, { status: 200, headers: { "Content-Type": "text/event-stream; charset=utf-8" } }),
);
assert.deepEqual(httpResult.stream?.response, { data: [{ b64_json: "ZmluYWw=" }] });

const heldOpenResult = await fetchOpenAiImageSse("https://example.invalid/images/generations", {}, 100, async () =>
  new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(payload));
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  ),
);
assert.deepEqual(heldOpenResult.stream?.response, { data: [{ b64_json: "ZmluYWw=" }] });

await assert.rejects(
  fetchOpenAiImageSse("https://example.invalid/images/generations", {}, 100, async () =>
    new Response('{"data":[]}', { status: 200, headers: { "Content-Type": "application/json" } }),
  ),
  /non-SSE/i,
);

await assert.rejects(
  fetchOpenAiImageSse("https://example.invalid/images/generations", {}, 20, async (_url, init) => {
    const signal = init?.signal;
    return new Response(
      new ReadableStream({
        start(controller) {
          signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")), { once: true });
        },
      }),
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    );
  }),
  /timed out/i,
);

console.log("OpenAI image SSE check passed.");
