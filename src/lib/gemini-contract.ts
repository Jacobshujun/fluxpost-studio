export const GEMINI_MAX_IMAGES = 8;
export const GEMINI_MAX_IMAGE_BYTES = 7 * 1024 * 1024;
export const GEMINI_MAX_REQUEST_BYTES = 20_000_000;

export function normalizeGeminiModel(value: string) {
  const model = value.trim().replace(/^models\//, "");
  if (model && !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/.test(model)) {
    throw new Error("Gemini 模型 ID 无效，请填写服务支持的模型名称。");
  }
  return model;
}
