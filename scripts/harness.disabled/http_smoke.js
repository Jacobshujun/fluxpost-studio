const baseUrl = normalizeBaseUrl(process.argv[2] || process.env.HARNESS_BASE_URL || "http://127.0.0.1:3310");

async function main() {
  await expectHtml("/");
  await expectJson("/api/config", (data) => {
    assertType(data, "object", "config response");
    assertType(data.tikhubConfigured, "boolean", "config.tikhubConfigured");
    assertType(data.openaiConfigured, "boolean", "config.openaiConfigured");
    assertType(data.openaiImageConfigured, "boolean", "config.openaiImageConfigured");
    assertType(data.feishuConfigured, "boolean", "config.feishuConfigured");
  });
  await expectJson("/api/accounts/session", (data) => {
    assertType(data, "object", "accounts session response");
    assertType(data.hasAccounts, "boolean", "accounts.hasAccounts");
  });
  await expectStatus("/api/content-pool", undefined, 401);
  await expectStatus("/api/activity?limit=1", undefined, 401);
  await expectStatus("/api/production/batches", undefined, 401);
  await expectStatus("/api/crawl/jobs", undefined, 401);
  await expectStatus("/api/production/posts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  }, 401);
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

async function expectStatus(path, init, expectedStatus) {
  const response = await fetch(`${baseUrl}${path}`, init);
  if (response.status !== expectedStatus) {
    const body = await response.text();
    throw new Error(`${path} expected HTTP ${expectedStatus}, got HTTP ${response.status}: ${body.slice(0, 240)}`);
  }
  console.log(`Smoke ok: ${path} returned HTTP ${expectedStatus}`);
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
