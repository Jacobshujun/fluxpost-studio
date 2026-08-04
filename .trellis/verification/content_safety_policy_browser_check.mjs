import { chromium } from "playwright";

const baseUrl = process.env.FLUXPOST_BROWSER_BASE_URL || "http://127.0.0.1:3001";

function policy(revision = 7) {
  return {
    schemaVersion: 1,
    revision,
    enabled: true,
    categories: [
      { id: "abuse", label: "Abuse", description: "Insults and abusive language" },
      { id: "competitor_bashing", label: "Competitor bashing", description: "Unsupported attacks on competitors" },
    ],
    local: {
      enabled: true,
      rules: [
        {
          id: "explicit-abuse",
          name: "Explicit abuse",
          enabled: true,
          action: "filter",
          categoryIds: ["abuse"],
          groups: [{ fields: ["title", "body"], mode: "any", terms: ["idiot"], atLeast: 1 }],
        },
        {
          id: "allow-objective-comparison",
          name: "Allow objective comparison",
          enabled: true,
          action: "allow",
          categoryIds: [],
          groups: [{ fields: ["title", "body"], mode: "all", terms: ["objective", "comparison"] }],
        },
      ],
    },
    model: {
      enabled: true,
      scope: "local_review",
      prompt: "Review the supplied social post for the configured safety categories.",
      reviewThreshold: 40,
      filterThreshold: 80,
    },
    updatedAt: "2026-08-04T00:00:00.000Z",
    updatedBy: { id: "admin-1", displayName: "Policy Admin" },
  };
}

const advanced = {
  updatedAt: "2026-08-04T00:00:00.000Z",
  groups: [{ id: "general", title: "General", description: "Mocked environment configuration", fields: [] }],
};
const status = {
  tikhubConfigured: false,
  openaiConfigured: true,
  openaiImageConfigured: false,
  feishuConfigured: false,
  tosConfigured: false,
  tosEnabled: false,
  postgresConfigured: true,
  databaseBackend: "postgres",
  textModel: "Mock text model",
};

const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of [{ name: "desktop", width: 1440, height: 960 }, { name: "mobile", width: 390, height: 844 }]) {
    const calls = [];
    let currentPolicy = policy();
    const page = await browser.newPage({ viewport });
    page.on("request", (request) => calls.push({ method: request.method(), url: request.url(), body: request.postDataJSON?.() }));
    page.on("dialog", (dialog) => dialog.accept());

    await page.route("**/api/accounts/session", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ account: { id: "admin-1", username: "admin", displayName: "Policy Admin", role: "admin", active: true } }),
    }));
    await page.route("**/api/config?advanced=1", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status, advanced }),
    }));
    await page.route("**/api/content-safety-policy", async (route) => {
      const request = route.request();
      if (request.method() === "PUT") {
        const body = request.postDataJSON();
        if (body.expectedRevision !== currentPolicy.revision) {
          await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Policy revision conflict" }) });
          return;
        }
        currentPolicy = { ...body.policy, revision: currentPolicy.revision + 1, updatedAt: "2026-08-04T01:00:00.000Z", updatedBy: "admin-1" };
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ policy: currentPolicy }) });
    });
    await page.route("**/api/content-safety-policy/test", async (route) => {
      const body = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          policy: body.policy,
          localAssessment: {
            decision: "filter",
            categories: ["abuse"],
            severity: "high",
            reasons: ["Matched explicit-abuse"],
            status: "success",
            source: "local",
            matchedRuleId: "explicit-abuse",
            policyRevision: body.policy.revision,
          },
          assessment: {
            decision: body.runModel ? "review" : "filter",
            categories: ["abuse"],
            severity: body.runModel ? "medium" : "high",
            reasons: [body.runModel ? "Mocked model result" : "Matched explicit-abuse"],
            status: "success",
            source: body.runModel ? "local_model" : "local",
            matchedRuleId: "explicit-abuse",
            policyRevision: body.policy.revision,
            ...(body.runModel ? { riskScore: 55 } : {}),
          },
        }),
      });
    });
    await page.route("**/api/content-safety-policy/reset", async (route) => {
      currentPolicy = policy(currentPolicy.revision + 1);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ policy: currentPolicy }) });
    });

    await page.goto(`${baseUrl}/config`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "内容安全" }).click();
    await page.getByRole("heading", { name: "内容安全" }).waitFor();

    if (calls.some((call) => call.url.endsWith("/api/content-safety-policy/test"))) {
      throw new Error(`${viewport.name}: policy test ran without an explicit click.`);
    }

    await page.getByRole("button", { name: "启用内容安全策略" }).click();
    if (!(await page.getByRole("button", { name: "运行模型测试" }).isDisabled())) {
      throw new Error(`${viewport.name}: a master-disabled policy still offered a paid model test.`);
    }
    await page.getByRole("button", { name: "启用内容安全策略" }).click();

    await page.getByLabel("待审核阈值").fill("90");
    await page.getByText("阈值必须满足：0 ≤ 待审核阈值 < 过滤阈值 ≤ 100。").waitFor();
    if (!(await page.getByRole("button", { name: "运行本地测试" }).isDisabled())) throw new Error(`${viewport.name}: invalid thresholds did not block local testing.`);
    if (!(await page.getByRole("button", { name: "保存策略" }).isDisabled())) throw new Error(`${viewport.name}: invalid thresholds did not block saving.`);
    if (calls.some((call) => call.url.endsWith("/api/content-safety-policy/test"))) throw new Error(`${viewport.name}: invalid thresholds triggered a test request.`);
    await page.getByLabel("待审核阈值").fill("40");

    await page.getByLabel("样例标题").fill("An idiot competitor");
    await page.getByRole("button", { name: "运行本地测试" }).click();
    await page.getByText("Matched explicit-abuse").first().waitFor();
    const localCall = calls.find((call) => call.url.endsWith("/api/content-safety-policy/test") && call.body?.runModel === false);
    if (!localCall) throw new Error(`${viewport.name}: local dry-run did not send runModel=false.`);

    await page.getByRole("button", { name: "运行模型测试" }).click();
    await page.getByText("Mocked model result").waitFor();
    const modelCalls = calls.filter((call) => call.url.endsWith("/api/content-safety-policy/test") && call.body?.runModel === true);
    if (modelCalls.length !== 1) throw new Error(`${viewport.name}: expected one explicit model test, received ${modelCalls.length}.`);

    await page.getByRole("button", { name: "规则 2 上移" }).click();
    await page.getByRole("button", { name: "添加分类" }).click();
    await page.getByLabel("分类 ID 3").fill("custom-risk");
    await page.getByLabel("分类名称 3").fill("Custom risk");
    await page.getByRole("button", { name: "保存策略" }).click();
    await page.getByText("策略已保存。").waitFor();
    const saveCall = calls.find((call) => call.method === "PUT" && call.url.endsWith("/api/content-safety-policy"));
    if (saveCall?.body?.expectedRevision !== 7) throw new Error(`${viewport.name}: save omitted the expected revision.`);
    if (saveCall?.body?.policy?.local?.rules?.[0]?.id !== "allow-objective-comparison") throw new Error(`${viewport.name}: reordered rules were not saved in visible order.`);
    if (calls.some((call) => call.method === "PATCH" && call.url.includes("/api/config"))) throw new Error(`${viewport.name}: policy save submitted the .env.local form.`);

    await page.getByRole("button", { name: "重置策略" }).click();
    const resetCall = calls.find((call) => call.method === "POST" && call.url.endsWith("/api/content-safety-policy/reset"));
    if (!resetCall) throw new Error(`${viewport.name}: reset API was not called.`);
    if (resetCall.body?.expectedRevision !== 8) throw new Error(`${viewport.name}: reset omitted the latest expected revision.`);

    const metrics = await page.evaluate(() => {
      const controls = [...document.querySelectorAll("button, input, textarea, select")].filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      });
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        clippedControls: controls.filter((element) => element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1).map((element) => element.getAttribute("aria-label") || element.textContent?.trim()).filter(Boolean),
      };
    });
    if (metrics.documentWidth > metrics.viewportWidth + 1) throw new Error(`${viewport.name} has horizontal overflow: ${JSON.stringify(metrics)}`);
    if (metrics.clippedControls.length) throw new Error(`${viewport.name} has clipped controls: ${metrics.clippedControls.join(", ")}`);
    await page.close();
  }
  console.log("Content safety policy browser check passed at 1440x960 and 390x844 without live services.");
} finally {
  await browser.close();
}
