export const QWEN_IMAGE_MODEL = "qwen-image-3.0-pro";
export const QWEN_IMAGE_MAX_REFERENCES = 3;
export const QWEN_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const QWEN_IMAGE_PATH = "/api/v1/services/aigc/multimodal-generation/generation";

export function validateQwenEndpoint(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Qwen: 请在节点中填写请求地址。");
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("Qwen: 请求地址无效。"); }
  const workspaceHost = /^[a-z0-9][a-z0-9-]*\.(cn-beijing|ap-southeast-1|us-east-1|eu-central-1|ap-northeast-1|cn-hongkong)\.maas\.aliyuncs\.com$/;
  const legacyHosts = ["dashscope.aliyuncs.com", "dashscope-intl.aliyuncs.com"];
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.search || url.hash
    || url.pathname !== QWEN_IMAGE_PATH || (!workspaceHost.test(url.hostname) && !legacyHosts.includes(url.hostname))
    || /workspace-?id/i.test(url.hostname)) {
    throw new Error("Qwen: 请填写真实阿里云业务空间的 DashScope 同步接口完整 HTTPS 地址。");
  }
  return url.href;
}

export function buildQwenImageRequest(input: {
  prompt: string; images: string[]; promptExtend: boolean; count: number; size?: string;
}) {
  if (!input.prompt.trim()) throw new Error("Qwen: 请填写提示词或连接上游文字。");
  if (input.images.length > QWEN_IMAGE_MAX_REFERENCES) throw new Error("Qwen: 最多支持 3 张参考图。");
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 6) throw new Error("Qwen: 图片数量必须为 1 到 6 的整数。");
  if (typeof input.promptExtend !== "boolean") throw new Error("Qwen: 提示词扩写必须是布尔值。");
  const size = input.size?.trim();
  if (size) {
    const match = /^(\d+)\*(\d+)$/.exec(size);
    const width = Number(match?.[1]), height = Number(match?.[2]);
    if (!match || width * height < 512 * 512 || width * height > 2048 * 2048 || Math.max(width / height, height / width) > 8) {
      throw new Error("Qwen: 尺寸格式为宽*高，总像素须为 512²–2048²，宽高比须在 1:8–8:1 内。");
    }
  }
  return {
    model: QWEN_IMAGE_MODEL,
    input: { messages: [{ role: "user", content: [...input.images.map((image) => ({ image })), { text: input.prompt.trim() }] }] },
    parameters: { prompt_extend: input.promptExtend, n: input.count, ...(size ? { size } : {}) },
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function qwenImageResponseUrls(value: unknown): string[] {
  if (!record(value) || value.code || !record(value.output) || !Array.isArray(value.output.choices)) {
    throw new Error("Qwen: 服务返回错误或无效结果，请检查地域、密钥和模型权限。");
  }
  const urls: string[] = [];
  for (const choice of value.output.choices) {
    if (!record(choice) || choice.finish_reason !== "stop" || !record(choice.message) || !Array.isArray(choice.message.content)) {
      throw new Error("Qwen: 图片生成未正常完成。");
    }
    for (const part of choice.message.content) {
      if (!record(part) || typeof part.image !== "string") throw new Error("Qwen: 服务返回无效图片。");
      let url: URL;
      try { url = new URL(part.image); } catch { throw new Error("Qwen: 服务返回无效图片地址。"); }
      // Result URLs are signed OSS URLs. Never follow an upstream-controlled private URL.
      if (url.protocol !== "https:" || url.username || url.password || url.port
        || !/^[a-z0-9][a-z0-9.-]*\.oss-[a-z0-9-]+\.aliyuncs\.com$/.test(url.hostname)) {
        throw new Error("Qwen: 服务返回的图片地址不是受支持的阿里云 OSS 地址。");
      }
      urls.push(url.href);
    }
  }
  if (!urls.length || urls.length > 6) throw new Error("Qwen: 返回图片数量无效。");
  return urls;
}
