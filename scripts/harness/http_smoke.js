const baseUrl = normalizeBaseUrl(process.argv[2] || process.env.HARNESS_BASE_URL || "http://127.0.0.1:3310");

async function main() {
  await expectHtml("/");
  await expectJson("/api/config", (data) => {
    assertType(data, "object", "config response");
    assertType(data.tikhubConfigured, "boolean", "config.tikhubConfigured");
    assertType(data.openaiConfigured, "boolean", "config.openaiConfigured");
    assertType(data.feishuConfigured, "boolean", "config.feishuConfigured");
  });
  await expectJson("/api/content-pool", (data) => {
    assert(Array.isArray(data.projects), "content-pool.projects must be an array");
  });
  await expectJson("/api/activity?limit=1", (data) => {
    assert(Array.isArray(data.entries), "activity.entries must be an array");
  });
  await expectJson("/api/production/batches", (data) => {
    assert(Array.isArray(data.jobs), "production batches jobs must be an array");
  });
  await expectJson("/api/crawl/jobs", (data) => {
    assert(Array.isArray(data.jobs), "crawl jobs must be an array");
  });
  console.log(`HTTP smoke passed for ${baseUrl}`);
}

async function expectHtml(path) {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    throw new Error(`${path} returned non-HTML content-type: ${contentType}`);
  }
}

async function expectJson(path, validate) {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${path} returned HTTP ${response.status}: ${body.slice(0, 240)}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`${path} returned non-JSON content-type: ${contentType}`);
  }
  const data = await response.json();
  validate(data);
  console.log(`Smoke ok: ${path}`);
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertType(value, expected, label) {
  if (typeof value !== expected) {
    throw new Error(`${label} must be ${expected}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
