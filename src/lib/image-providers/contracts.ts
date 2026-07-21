export const IMAGE_PROVIDER_PROFILES = ["openai_json", "openai_sse", "toapis_async"] as const;

export type ImageProviderProfile = (typeof IMAGE_PROVIDER_PROFILES)[number];
export type ImageProviderRoute = "primary" | "backup";
export type ImageProviderErrorCategory = "auth" | "capability" | "content" | "input" | "network" | "provider" | "timeout";

export type ImageProviderRouteConfig = {
  route: ImageProviderRoute;
  baseUrl: string;
  apiKey: string;
  model: string;
  profile: ImageProviderProfile;
};

export type ImageProviderCapabilities = {
  transport: "json" | "sse" | "task_polling";
  referenceInput: "multipart" | "url_upload";
  acceptsCustomPixelSizes: boolean;
  taskBased: boolean;
};

export const IMAGE_PROVIDER_CAPABILITIES: Record<ImageProviderProfile, ImageProviderCapabilities> = {
  openai_json: { transport: "json", referenceInput: "multipart", acceptsCustomPixelSizes: false, taskBased: false },
  openai_sse: { transport: "sse", referenceInput: "multipart", acceptsCustomPixelSizes: true, taskBased: false },
  toapis_async: { transport: "task_polling", referenceInput: "url_upload", acceptsCustomPixelSizes: false, taskBased: true },
};

export type NormalizedImageProviderResponse = {
  data?: Array<{
    b64_json?: string;
    url?: string;
  }>;
};

export class ImageProviderError extends Error {
  readonly category: ImageProviderErrorCategory;
  readonly retryable: boolean;
  readonly failoverAllowed: boolean;
  readonly taskAccepted: boolean;

  constructor(
    message: string,
    options: {
      category: ImageProviderErrorCategory;
      retryable: boolean;
      failoverAllowed: boolean;
      taskAccepted?: boolean;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "ImageProviderError";
    this.category = options.category;
    this.retryable = options.retryable;
    this.failoverAllowed = options.failoverAllowed;
    this.taskAccepted = options.taskAccepted === true;
  }
}

export function normalizeImageProviderProfile(value?: string): ImageProviderProfile | undefined {
  const normalized = value?.trim().toLowerCase();
  return IMAGE_PROVIDER_PROFILES.find((profile) => profile === normalized);
}

export function resolveImageProviderProfile(input: {
  explicitProfile?: string;
  legacyDialect?: string;
  baseUrl: string;
}): ImageProviderProfile {
  const explicit = normalizeImageProviderProfile(input.explicitProfile);
  if (explicit) return explicit;

  const legacy = input.legacyDialect?.trim().toLowerCase();
  if (legacy === "openai") return "openai_sse";
  if (legacy === "toapis") return "toapis_async";

  const hostname = new URL(input.baseUrl).hostname.toLowerCase();
  return hostname === "toapis.com" || hostname.endsWith(".toapis.com") ? "toapis_async" : "openai_sse";
}

const openAiJsonSizes = new Set(["auto", "1024x1024", "1024x1536", "1536x1024"]);

export function buildOpenAiJsonGenerationBody(input: {
  model: string;
  prompt: string;
  size: string;
  quality?: string;
}) {
  assertOpenAiJsonSize(input.size);
  return {
    model: input.model,
    prompt: input.prompt,
    n: 1,
    size: input.size,
    ...(input.quality ? { quality: input.quality } : {}),
  };
}

export function assertOpenAiJsonSize(size: string) {
  if (!openAiJsonSizes.has(size)) {
    throw new ImageProviderError(`OpenAI JSON profile does not support image size ${size}.`, {
      category: "input",
      retryable: false,
      failoverAllowed: false,
    });
  }
}

export function parseOpenAiJsonImageResponse(body: string, contentType: string): NormalizedImageProviderResponse {
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new ImageProviderError(`OpenAI JSON profile returned non-JSON response: ${contentType || "unknown content type"}.`, {
      category: "provider",
      retryable: false,
      failoverAllowed: true,
    });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch (error) {
    throw new ImageProviderError("OpenAI JSON profile returned invalid JSON.", {
      category: "provider",
      retryable: false,
      failoverAllowed: true,
      cause: error,
    });
  }

  const data = isObject(payload) && Array.isArray(payload.data) ? payload.data : [];
  const images = data.flatMap((item) => {
    if (!isObject(item)) return [];
    const b64Json = typeof item.b64_json === "string" && item.b64_json ? item.b64_json : undefined;
    const url = typeof item.url === "string" && item.url ? item.url : undefined;
    return b64Json || url ? [{ ...(b64Json ? { b64_json: b64Json } : {}), ...(url ? { url } : {}) }] : [];
  });
  if (!images.length) {
    throw new ImageProviderError("OpenAI JSON profile response did not contain an image.", {
      category: "provider",
      retryable: false,
      failoverAllowed: true,
    });
  }
  return { data: images };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
