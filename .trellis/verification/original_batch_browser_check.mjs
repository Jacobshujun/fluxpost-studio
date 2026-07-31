import { chromium } from "playwright";

const baseUrl = process.env.FLUXPOST_BROWSER_BASE_URL || "http://127.0.0.1:3001";
const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of [{ name: "desktop", width: 1440, height: 960 }, { name: "mobile", width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    await page.route("**/api/original/batches**", async (route) => {
      const request = route.request();
      if (request.method() === "GET") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ batches: [], page: 1, pageSize: 50, total: 0 }) });
        return;
      }
      const body = request.postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          duplicateRows: [],
          preflight: {
            itemCount: body.items.length,
            maxImageRequests: body.items.length * 20,
            expectedImageCount: { min: body.items.length * 2, max: body.items.length * 10 },
            effectiveRatio: "3:4",
            imageSize: "1200x1600",
            providerProfile: "toapis_async",
            textConfigured: true,
            imageConfigured: true,
            webSearchAvailable: true,
          },
        }),
      });
    });
    await page.goto(`${baseUrl}/original`, { waitUntil: "networkidle" });
    const tsv = Array.from({ length: 100 }, (_, index) => `选题 ${index + 1}\t要求 ${index + 1}\t关键词 ${index + 1}`).join("\n");
    await page.evaluate((value) => {
      const input = document.querySelector('input[aria-label="第 1 行选题"]');
      if (!(input instanceof HTMLInputElement)) throw new Error("First topic input not found.");
      const transfer = new DataTransfer();
      transfer.setData("text/plain", value);
      input.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
    }, tsv);
    await page.getByText("100/100").waitFor();
    await page.getByRole("button", { name: "启动预检" }).click();
    await page.getByRole("heading", { name: "启动确认" }).waitFor();

    const metrics = await page.evaluate(() => {
      const visibleButtons = [...document.querySelectorAll("button, a")].filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      });
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        clippedControls: visibleButtons.filter((element) => element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1).map((element) => element.getAttribute("aria-label") || element.textContent?.trim()).filter(Boolean),
        dialogInsideViewport: (() => {
          const dialog = document.querySelector('[role="dialog"] > div');
          if (!dialog) return false;
          const rect = dialog.getBoundingClientRect();
          return rect.left >= 0 && rect.right <= window.innerWidth && rect.top >= 0 && rect.bottom <= window.innerHeight;
        })(),
      };
    });
    if (metrics.documentWidth > metrics.viewportWidth + 1) throw new Error(`${viewport.name} has horizontal overflow: ${JSON.stringify(metrics)}`);
    if (!metrics.dialogInsideViewport) throw new Error(`${viewport.name} preflight dialog is outside the viewport.`);
    if (metrics.clippedControls.length) throw new Error(`${viewport.name} has clipped controls: ${metrics.clippedControls.join(", ")}`);
    await page.screenshot({ path: `.tmp-original-${viewport.name}.png`, fullPage: true });
    await page.close();
  }
  console.log("Original batch browser check passed at 1440x960 and 390x844.");
} finally {
  await browser.close();
}
