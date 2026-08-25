import net from "node:net";
import { ProxyAgent, type Dispatcher } from "undici";
import { appConfig, isOpenaiImageRouteConfigured, openaiImageRouteConfig } from "./config";
import type { ImageTransportHealth, ImageTransportRouteHealth } from "./types";

const defaultHealthTimeoutMs = 8_000;
export const IMAGE_NETWORK_WAIT_REASON = "等待图片网络恢复";
const networkErrorCodes = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENETDOWN",
  "ENETUNREACH",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);

let cachedProxyUrl = "";
let cachedProxyAgent: ProxyAgent | undefined;

export class ImageTransportUnavailableError extends Error {
  readonly code?: string;

  constructor(cause: unknown, timedOut = false) {
    super(timedOut ? "图片网络请求超时，请检查 Xray。" : "图片网络不可用，请检查 Xray 是否正在运行。", { cause });
    this.name = "ImageTransportUnavailableError";
    this.code = findNetworkErrorCode(cause) || (timedOut ? "IMAGE_TRANSPORT_TIMEOUT" : undefined);
  }
}

export async function fetchImageTransport(url: string | URL | Request, init: RequestInit = {}) {
  const dispatcher = shouldBypassImageProxy(url) ? undefined : imageProxyDispatcher();
  return fetch(url, dispatcher ? ({ ...init, dispatcher } as RequestInit & { dispatcher: Dispatcher }) : init);
}

export function isImageNetworkUnavailableError(error: unknown) {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current; depth += 1) {
    if (current instanceof ImageTransportUnavailableError) return true;
    if (typeof current === "object") {
      const value = current as { category?: unknown; code?: unknown; cause?: unknown; message?: unknown };
      if (value.category === "network" || value.category === "timeout") return true;
      if (typeof value.code === "string" && networkErrorCodes.has(value.code.toUpperCase())) return true;
      if (typeof value.message === "string" && /fetch failed|connect(?:ion)? (?:timed out|refused|reset)|network is unreachable|ENOTFOUND|ECONNREFUSED|UND_ERR_CONNECT_TIMEOUT/i.test(value.message)) return true;
      current = value.cause;
      continue;
    }
    break;
  }
  return false;
}

export function toImageTransportUnavailableError(error: unknown, timedOut = false) {
  return error instanceof ImageTransportUnavailableError ? error : new ImageTransportUnavailableError(error, timedOut);
}

export async function checkImageTransportHealth(timeoutMs = defaultHealthTimeoutMs): Promise<ImageTransportHealth> {
  const startedAt = Date.now();
  const proxyUrl = appConfig.openaiImageProxyUrl;
  const proxy = proxyUrl
    ? await probeProxyListener(proxyUrl, timeoutMs)
    : { configured: false, reachable: true, endpoint: "direct" };
  const primaryConfig = openaiImageRouteConfig("primary");
  const backupConfigured = isOpenaiImageRouteConfigured("backup");
  const backupConfig = backupConfigured ? openaiImageRouteConfig("backup") : undefined;
  const duplicateOrigins = Boolean(backupConfig && routeOrigin(primaryConfig.baseUrl) === routeOrigin(backupConfig.baseUrl));

  const unavailable = (configured: boolean): ImageTransportRouteHealth => ({
    configured,
    reachable: false,
    error: "Xray 未运行，图片通道暂不可用。",
  });
  const [primary, backup] = proxy.reachable
    ? await Promise.all([
        probeRoute(primaryConfig.baseUrl, isOpenaiImageRouteConfigured("primary"), timeoutMs),
        backupConfig ? probeRoute(backupConfig.baseUrl, true, timeoutMs) : Promise.resolve({ configured: false, reachable: false }),
      ])
    : [unavailable(isOpenaiImageRouteConfigured("primary")), unavailable(backupConfigured)];

  return {
    ok: proxy.reachable && primary.reachable && (!backup.configured || backup.reachable) && !duplicateOrigins,
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    proxy,
    primary,
    backup,
    duplicateOrigins,
  };
}

function imageProxyDispatcher() {
  const proxyUrl = appConfig.openaiImageProxyUrl;
  if (!proxyUrl) return undefined;
  if (cachedProxyAgent && cachedProxyUrl === proxyUrl) return cachedProxyAgent;
  const previous = cachedProxyAgent;
  cachedProxyUrl = proxyUrl;
  cachedProxyAgent = new ProxyAgent(proxyUrl);
  if (previous) void previous.close().catch(() => undefined);
  return cachedProxyAgent;
}

function shouldBypassImageProxy(input: string | URL | Request) {
  const value = input instanceof Request ? input.url : input.toString();
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "localhost"
      || hostname.endsWith(".localhost")
      || hostname.startsWith("127.")
      || hostname === "0.0.0.0"
      || hostname === "::1"
      || hostname === "[::1]";
  } catch {
    return false;
  }
}

async function probeProxyListener(proxyUrl: string, timeoutMs: number) {
  const parsed = new URL(proxyUrl);
  const port = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80));
  const endpoint = `${parsed.hostname}:${port}`;
  try {
    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({ host: parsed.hostname, port });
      const finish = (error?: Error) => {
        socket.removeAllListeners();
        socket.destroy();
        if (error) reject(error);
        else resolve();
      };
      socket.setTimeout(timeoutMs, () => finish(new Error("proxy listener timed out")));
      socket.once("connect", () => finish());
      socket.once("error", (error) => finish(error));
    });
    return { configured: true, reachable: true, endpoint };
  } catch {
    return { configured: true, reachable: false, endpoint, error: "Xray 未运行或代理端口不可访问。" };
  }
}

async function probeRoute(baseUrl: string, configured: boolean, timeoutMs: number): Promise<ImageTransportRouteHealth> {
  if (!configured) return { configured: false, reachable: false };
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetchImageTransport(baseUrl, { method: "HEAD", redirect: "manual", signal: controller.signal });
    return { configured: true, reachable: true, durationMs: Date.now() - startedAt };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error && error.name === "AbortError"
        ? "图片通道连接超时。"
        : "图片通道网络不可达。",
    };
  } finally {
    clearTimeout(timer);
  }
}

function routeOrigin(value: string) {
  return new URL(value).origin.toLowerCase();
}

function findNetworkErrorCode(error: unknown) {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current; depth += 1) {
    if (typeof current !== "object") return undefined;
    const value = current as { code?: unknown; cause?: unknown };
    if (typeof value.code === "string") return value.code;
    current = value.cause;
  }
  return undefined;
}
