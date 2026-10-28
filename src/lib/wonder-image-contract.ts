export const WONDER_IMAGE_DEFAULT_ENDPOINT = "https://yike.cn-shanghai.aliyuncs.com/";
export const WONDER_IMAGE_DEFAULT_MODEL = "qwen-image-3.0";
export const WONDER_IMAGE_API_VERSION = "2026-07-07";
export const WONDER_IMAGE_MAX_REFERENCES = 9;
export const WONDER_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const WONDER_IMAGE_MIN_EDGE = 400;
export const WONDER_IMAGE_MAX_EDGE = 8000;

const endpoints = new Set([WONDER_IMAGE_DEFAULT_ENDPOINT, "https://yike.ap-southeast-1.aliyuncs.com/"]);

export function validateWonderEndpoint(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Wonder Image: 请填写请求地址。");
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("Wonder Image: 请求地址无效。"); }
  if (!endpoints.has(url.href) || url.protocol !== "https:") throw new Error("Wonder Image: 仅支持万镜一刻上海或新加坡 HTTPS 服务根地址。");
  return url.href;
}

export function buildWonderImageRequest(input: {
  prompt: string; model: string; mediaIds: string[]; count: number; resolution: string; aspectRatio: string;
}) {
  const prompt = input.prompt.trim(), model = input.model.trim();
  if (!prompt) throw new Error("Wonder Image: 请填写提示词或连接上游文字。");
  if (!model || model.length > 128 || /[\r\n\x00-\x1f]/.test(model)) throw new Error("Wonder Image: 模型 ID 无效。");
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 4) throw new Error("Wonder Image: 图片数量必须为 1 到 4 的整数。");
  if (!new Set(["1K", "2K", "4K"]).has(input.resolution)) throw new Error("Wonder Image: 分辨率仅支持 1K、2K 或 4K。");
  if (!new Set(["16:9", "9:16", "4:3", "3:4", "1:1"]).has(input.aspectRatio)) throw new Error("Wonder Image: 不支持此宽高比。");
  if (input.mediaIds.length > WONDER_IMAGE_MAX_REFERENCES || input.mediaIds.some((id) => !id.trim())) throw new Error("Wonder Image: 参考图媒资无效或超过 9 张。");
  return {
    JobType: input.mediaIds.length ? "image_to_image" : "text_to_image", Model: model, Scene: "general",
    Input: JSON.stringify({ Prompt: prompt, ...(input.mediaIds.length ? { Medias: input.mediaIds.map((MediaId) => ({ Type: "image", MediaId })) } : {}) }),
    Resolution: input.resolution, AspectRatio: input.aspectRatio, N: String(input.count),
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function wonderSubmittedJobId(value: unknown) {
  const id = record(value).JobId;
  if (typeof id !== "string" || !id.trim() || id.length > 256) throw new Error("Wonder Image: 服务未返回有效任务 ID。");
  return id.trim();
}

export function wonderImportedMediaId(value: unknown) {
  const id = record(value).MediaId;
  if (typeof id !== "string" || !id.trim() || id.length > 256) throw new Error("Wonder Image: 服务未返回有效媒资 ID。");
  return id.trim();
}

export function wonderExistingMediaId(value: unknown): string | undefined {
  const body = record(value);
  if ((body.Code ?? body.code) !== "MediaAlreadyExist") return undefined;
  if (typeof body.MediaId === "string" && /^[A-Za-z0-9_-]{8,256}$/.test(body.MediaId)) return body.MediaId;
  const message = body.Message ?? body.message;
  if (typeof message !== "string") return undefined;
  // The observed duplicate response embeds the ID after this phrase, not in the input URL.
  return /\bhas already been registered with mediaId\s+"([A-Za-z0-9_-]{8,256})"\.?\s*$/i.exec(message)?.[1];
}

export function wonderMediaReady(value: unknown, needThirdPartyAsset = false) {
  const info = record(record(value).MediaInfo), basic = record(info.MediaBasicInfo);
  const status = typeof basic.Status === "string" ? basic.Status : "";
  if (["Failed", "Deleted"].includes(status)) throw new Error("Wonder Image: 参考图媒资注册失败。");
  if (status !== "Normal") return false;
  if (!needThirdPartyAsset) return true;
  const data = record(record(info.MediaDynamicInfo).DynamicMetaData).Data;
  if (data === undefined || data === "") return false;
  let dynamic: unknown;
  try { dynamic = JSON.parse(typeof data === "string" ? data : ""); }
  catch { throw new Error("Wonder Image: GetMedia 第三方媒资状态不是有效 JSON。"); }
  const thirdPartyStatus = record(dynamic).ThirdPartyAssetStatus;
  if (thirdPartyStatus === "Failed") throw new Error("Wonder Image: GetMedia 第三方媒资注册失败。");
  if (thirdPartyStatus === "Success") return true;
  if (thirdPartyStatus === undefined || thirdPartyStatus === "Init" || thirdPartyStatus === "Processing") return false;
  throw new Error("Wonder Image: GetMedia 返回未知第三方媒资状态。");
}

export function wonderJobResult(value: unknown): { status: string; urls: string[] } {
  const job = record(record(value).ImageGenerationJob);
  const status = typeof job.Status === "string" ? job.Status : "";
  if (!new Set(["Created", "Queuing", "Executing", "Finished", "Failed"]).has(status)) throw new Error("Wonder Image: 服务返回了未知任务状态。");
  if (status === "Failed") {
    const message = typeof job.ErrorMessage === "string" ? job.ErrorMessage.replace(/https?:\/\/\S+/g, "[provider-url]").slice(0, 500) : "任务失败";
    throw new Error(`Wonder Image: ${message}`);
  }
  if (status !== "Finished") return { status, urls: [] };
  let output: unknown;
  try { output = JSON.parse(typeof job.Output === "string" ? job.Output : ""); } catch { throw new Error("Wonder Image: 任务结果不是有效 JSON。"); }
  const medias = record(output).Medias;
  if (!Array.isArray(medias) || !medias.length || medias.length > 4) throw new Error("Wonder Image: 任务结果中的图片数量无效。");
  const urls = medias.map((entry) => {
    const value = record(entry).OutputUrl;
    if (typeof value !== "string") throw new Error("Wonder Image: 任务结果缺少图片地址。");
    let url: URL;
    try { url = new URL(value); } catch { throw new Error("Wonder Image: 图片地址无效。"); }
    if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("Wonder Image: 图片地址不是有效的 HTTPS 地址。");
    return url.href;
  });
  return { status, urls };
}
