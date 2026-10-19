import { readFile, stat } from "node:fs/promises";
import { ProxyAgent, type Dispatcher } from "undici";
import { appConfig } from "./config";
import { recordExecutionLog } from "./activity-log";
import { runWithConcurrencyPool } from "./concurrency";
import { materializeRuntimeMedia } from "./runtime-media-materializer";
import { sniffImageFormat } from "./image-format";
import { getCanvasDirectorySnapshot } from "./canvas/directory-snapshots";
import { GEMINI_MAX_IMAGES, GEMINI_MAX_IMAGE_BYTES, GEMINI_MAX_REQUEST_BYTES, normalizeGeminiModel } from "./gemini-contract";
import type { CanvasMediaReference } from "./canvas/types";
import type { WorkspaceAccessActor } from "./workspace-ownership";

export class GeminiNeedsConfigError extends Error {}

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };
type GeminiResponse = {
  promptFeedback?: { blockReason?: string };
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
  }>;
};

export async function callGeminiForText(input: {
  prompt: string; images: CanvasMediaReference[]; model?: string;
  account: WorkspaceAccessActor; signal?: AbortSignal;
}): Promise<string> {
  // Copy primitives before any asynchronous boundary: settings saves affect the next call.
  let model: string;
  try { model = normalizeGeminiModel(input.model?.trim() || appConfig.geminiModel); }
  catch { throw new GeminiNeedsConfigError("Gemini 模型 ID 无效，请填写服务支持的模型名称。"); }
  const config = {
    apiKey: appConfig.geminiApiKey, baseUrl: appConfig.geminiBaseUrl,
    model,
    proxyUrl: appConfig.geminiProxyEnabled ? appConfig.geminiProxyUrl : "",
    timeoutMs: appConfig.geminiRequestTimeoutMs,
  };
  if (!config.apiKey) throw new GeminiNeedsConfigError("请在高级配置中填写 GEMINI_API_KEY。");
  if (!config.model) throw new GeminiNeedsConfigError("请填写 Gemini 默认模型或节点模型 ID。");
  if (!input.prompt.trim()) throw new Error("Gemini 节点需要节点指令或上游文字。");
  if (input.images.length > GEMINI_MAX_IMAGES) throw new Error("Gemini 最多接受 8 张图片。");
  const signal = input.signal
    ? AbortSignal.any([input.signal, AbortSignal.timeout(config.timeoutMs)])
    : AbortSignal.timeout(config.timeoutMs);
  const startedAt = Date.now();
  let proxy: ProxyAgent | undefined;
  try {
    signal.throwIfAborted();
    const parts: GeminiPart[] = [{ text: input.prompt.trim() }];
    // Serial preparation bounds memory and preserves duplicate-image positions.
    for (const image of input.images) {
      const buffer = await readGeminiImage(image, input.account, signal);
      const mimeType = sniffImageFormat(buffer)?.mimeType;
      if (!mimeType || !["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
        throw new Error("Gemini 图片仅支持 JPEG、PNG 和 WebP。");
      }
      parts.push({ inlineData: { mimeType, data: buffer.toString("base64") } });
    }
    const body = JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["TEXT"] } });
    if (Buffer.byteLength(body, "utf8") > GEMINI_MAX_REQUEST_BYTES) throw new Error("Gemini 请求超过 20MB，请减少图片或文字。");
    signal.throwIfAborted();
    await recordExecutionLog({ scope: "gemini/text", action: "Gemini 请求", status: "running", message: "准备 Gemini 文本／图片理解请求。", details: { model: config.model, imageCount: input.images.length } });
    proxy = config.proxyUrl ? new ProxyAgent(config.proxyUrl) : undefined;
    const text = await runWithConcurrencyPool("gpt", async () => {
      const init: RequestInit & { dispatcher?: Dispatcher } = {
        method: "POST", redirect: "error", signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": config.apiKey }, body,
        ...(proxy ? { dispatcher: proxy } : {}),
      };
      const response = await fetch(`${config.baseUrl}/models/${encodeURIComponent(config.model)}:generateContent`, init);
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(geminiHttpError(response.status));
      }
      // The same signal remains active while consuming the response body.
      const data: GeminiResponse = await response.json();
      signal.throwIfAborted();
      return geminiResponseText(data);
    }, { signal });
    await recordExecutionLog({ scope: "gemini/text", action: "Gemini 完成", status: "success", message: "Gemini 已返回文本。", durationMs: Date.now() - startedAt, details: { model: config.model, imageCount: input.images.length } });
    return text;
  } catch (error) {
    // Never forward raw HTTP bodies, URLs, user paths or dispatcher error causes.
    const message = input.signal?.aborted ? "Gemini 请求已取消。"
      : signal.aborted ? "Gemini 请求超时。"
      : error instanceof Error && error.message.startsWith("Gemini ") ? error.message
      : "Gemini 请求失败，请检查网络、代理或输入图片。";
    await recordExecutionLog({ scope: "gemini/text", action: "Gemini 失败", status: "error", message, durationMs: Date.now() - startedAt });
    if (input.signal?.aborted) input.signal.throwIfAborted();
    throw new Error(message);
  } finally {
    // One dispatcher per request keeps in-flight settings independent of later saves.
    if (proxy) await proxy.destroy();
  }
}

async function readGeminiImage(image: CanvasMediaReference, account: WorkspaceAccessActor, signal: AbortSignal) {
  signal.throwIfAborted();
  let filePath: string;
  let cleanup = async () => {};
  if (image.url.startsWith("/api/canvas/local-directory/media?")) {
    const params = new URL(image.url, "http://localhost").searchParams;
    const snapshot = await getCanvasDirectorySnapshot(params.get("snapshot") || "", account.id);
    const media = snapshot.groups.flatMap((group) => group.images).find((item) => item.id === params.get("media"));
    if (!media) throw new Error("Gemini 找不到可访问的目录快照图片。");
    filePath = media.absolutePath;
  } else {
    const materialized = await materializeRuntimeMedia(image.url, { maxBytes: GEMINI_MAX_IMAGE_BYTES, kind: "image", signal }).catch((error: unknown) => {
      if (error instanceof Error && error.message.startsWith("Runtime media exceeds the ")) throw new Error("Gemini 图片超过 7MiB。");
      throw error;
    });
    filePath = materialized.filePath;
    cleanup = materialized.cleanup;
  }
  try {
    signal.throwIfAborted();
    const file = await stat(filePath);
    if (!file.isFile() || !file.size || file.size > GEMINI_MAX_IMAGE_BYTES) throw new Error("Gemini 图片为空或超过 7MiB。");
    const buffer = await readFile(filePath, { signal });
    if (buffer.length > GEMINI_MAX_IMAGE_BYTES) throw new Error("Gemini 图片超过 7MiB。");
    return buffer;
  } finally { await cleanup(); }
}

function geminiResponseText(data: GeminiResponse) {
  if (!data || data.promptFeedback?.blockReason) throw new Error("Gemini 请求被安全策略拦截。");
  const candidate = data.candidates?.[0];
  if (candidate?.finishReason && candidate.finishReason !== "STOP") {
    throw new Error(candidate.finishReason === "MAX_TOKENS" ? "Gemini 回答达到长度限制，未返回完整结果。" : "Gemini 未完成回答，请检查内容限制或模型能力。");
  }
  const text = candidate?.content?.parts?.filter((part) => part.thought !== true && typeof part.text === "string").map((part) => part.text).join("").trim();
  if (!text) throw new Error("Gemini 未返回有效文本。");
  return text;
}

function geminiHttpError(status: number) {
  const guidance = status === 401 || status === 403 ? "请检查密钥和模型访问权限。"
    : status === 429 ? "请求受到限流或配额限制，请稍后手动重试。"
    : status === 404 ? "请检查 Base URL 和模型 ID。"
    : status === 400 ? "请求参数或图片不被当前模型支持。"
    : "服务暂不可用，请稍后手动重试。";
  return `Gemini HTTP ${status}，${guidance}`;
}
