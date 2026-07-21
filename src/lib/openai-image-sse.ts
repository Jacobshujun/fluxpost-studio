export type OpenAiImageSseResponse = {
  data?: Array<{
    b64_json?: string;
    url?: string;
  }>;
};

export type OpenAiImageSseStats = {
  eventCount: number;
  partialEventCount: number;
  completionEventCount: number;
  sawDone: boolean;
};

export type OpenAiImageSseResult = {
  response: OpenAiImageSseResponse;
  stats: OpenAiImageSseStats;
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type OpenAiImageSseHttpResult =
  | { response: Response; stream: OpenAiImageSseResult; body?: never }
  | { response: Response; body: string; stream?: never };

type ImageEventPayload = {
  type?: string;
  b64_json?: string;
  url?: string;
  data?: Array<{
    b64_json?: string;
    url?: string;
  }>;
  error?: { message?: string } | string;
};

class OpenAiImageSseDecoder {
  private buffer = "";
  private eventName = "";
  private dataLines: string[] = [];
  private readonly images: NonNullable<OpenAiImageSseResponse["data"]> = [];
  private readonly stats: OpenAiImageSseStats = {
    eventCount: 0,
    partialEventCount: 0,
    completionEventCount: 0,
    sawDone: false,
  };

  get done() {
    return this.stats.sawDone;
  }

  push(chunk: string) {
    this.buffer += chunk;
    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newlineIndex + 1);
      this.consumeLine(line);
      newlineIndex = this.buffer.indexOf("\n");
    }
  }

  finish(): OpenAiImageSseResult {
    if (this.buffer) {
      this.consumeLine(this.buffer.replace(/\r$/, ""));
      this.buffer = "";
    }
    if (this.eventName || this.dataLines.length) this.dispatchEvent();
    if (!this.stats.sawDone) throw new Error("Images API SSE stream ended before [DONE].");
    if (!this.images.length) throw new Error("Images API SSE stream did not contain a final image.");
    return {
      response: { data: this.images },
      stats: { ...this.stats },
    };
  }

  private consumeLine(line: string) {
    if (this.stats.sawDone) return;
    if (!line) {
      this.dispatchEvent();
      return;
    }
    if (line.startsWith(":")) return;
    const separator = line.indexOf(":");
    const field = separator < 0 ? line : line.slice(0, separator);
    let value = separator < 0 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") this.eventName = value;
    if (field === "data") this.dataLines.push(value);
  }

  private dispatchEvent() {
    const eventName = this.eventName;
    const rawData = this.dataLines.join("\n");
    this.eventName = "";
    this.dataLines = [];
    if (!rawData) return;
    if (rawData === "[DONE]") {
      this.stats.sawDone = true;
      return;
    }

    let payload: ImageEventPayload;
    try {
      payload = JSON.parse(rawData) as ImageEventPayload;
    } catch (error) {
      throw new Error(`Images API SSE returned invalid JSON: ${error instanceof Error ? error.message : "parse failed"}`);
    }
    const type = eventName || payload.type || "";
    if (type === "error" || payload.error) {
      const message = typeof payload.error === "string" ? payload.error : payload.error?.message;
      throw new Error(`Images API SSE error: ${message || "provider failed"}`);
    }
    this.stats.eventCount += 1;
    if (type === "image_generation.partial_image") {
      this.stats.partialEventCount += 1;
      return;
    }
    if (type !== "image_generation.completed") return;
    this.stats.completionEventCount += 1;
    if (payload.b64_json || payload.url) this.images.push(toImageResult(payload.b64_json, payload.url));
    for (const image of payload.data || []) {
      if (image.b64_json || image.url) this.images.push(toImageResult(image.b64_json, image.url));
    }
  }
}

function toImageResult(b64Json?: string, url?: string) {
  return b64Json ? { b64_json: b64Json } : { url: url as string };
}

export function decodeOpenAiImageSseChunks(chunks: Iterable<string | Uint8Array>): OpenAiImageSseResult {
  const decoder = new OpenAiImageSseDecoder();
  const textDecoder = new TextDecoder();
  for (const chunk of chunks) {
    decoder.push(typeof chunk === "string" ? chunk : textDecoder.decode(chunk, { stream: true }));
  }
  decoder.push(textDecoder.decode());
  return decoder.finish();
}

export async function readOpenAiImageSseResponse(response: Response): Promise<OpenAiImageSseResult> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("text/event-stream")) {
    const body = await response.text();
    throw new Error(`Images API returned non-SSE response: ${response.status} ${contentType} ${body.slice(0, 180)}`);
  }
  if (!response.body) throw new Error("Images API SSE response has no body.");

  const decoder = new OpenAiImageSseDecoder();
  const textDecoder = new TextDecoder();
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      decoder.push(textDecoder.decode(value, { stream: true }));
      if (decoder.done) break;
    }
    decoder.push(textDecoder.decode());
    return decoder.finish();
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export async function fetchOpenAiImageSse(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: FetchLike = fetch,
): Promise<OpenAiImageSseHttpResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!response.ok) return { response, body: await response.text() };
    return { response, stream: await readOpenAiImageSseResponse(response) };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
