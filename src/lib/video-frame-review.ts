import { compactError } from "./activity-log";
import { appConfig, openaiTextUrl } from "./config";
import { runWithConcurrencyPool } from "./concurrency";
import { toModelImageUrl } from "./model-image-input";
import type { VideoFrameAsset } from "./types";

type ModelImageInput = {
  id: string;
  imageUrl: string;
};

type ResponsesApiTextResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

const maxReviewedFrames = 18;

export function isVideoFrameAiReviewConfigured() {
  return Boolean(appConfig.openaiApiKey);
}

export async function reviewVideoFramesWithAi(frames: VideoFrameAsset[]): Promise<VideoFrameAsset[]> {
  if (!frames.length || !isVideoFrameAiReviewConfigured()) return frames;

  const prepared: ModelImageInput[] = [];
  const frameById = new Map<string, VideoFrameAsset>();
  for (const frame of frames.slice(0, maxReviewedFrames)) {
    try {
      const imageUrl = await toModelImageUrl(frame.url);
      if (!imageUrl) continue;
      prepared.push({ id: frame.id, imageUrl });
      frameById.set(frame.id, frame);
    } catch {
      // Local quality scoring remains the fallback for assets the model cannot read.
    }
  }
  if (!prepared.length) return frames;

  const json = await callVideoFrameReviewModel(buildVideoFrameReviewPrompt(frames), prepared);
  const reviewById = normalizeReviewItems(json);
  if (!reviewById.size) throw new Error("AI video-frame review returned no valid frame scores");

  return frames.map((frame) => {
    const review = reviewById.get(frame.id);
    if (!review) return frame;
    const qualityScore = averageScores([frame.qualityScore, review.clarityScore]);
    const aiScore = averageScores([review.aestheticScore, review.clarityScore, review.compositionScore, review.contentValueScore]);
    return {
      ...frame,
      qualityScore,
      aestheticScore: review.aestheticScore,
      aiScore: review.usableForPost === false ? Math.min(aiScore, 34) : aiScore,
      selectionReason: review.reason || frame.selectionReason,
    };
  });
}

function buildVideoFrameReviewPrompt(frames: VideoFrameAsset[]) {
  const frameLines = frames
    .slice(0, maxReviewedFrames)
    .map((frame, index) => `${frame.id}: slot ${index + 1}, type=${frame.type}, timestamp=${formatTimestamp(frame.timestamp)}, localQuality=${formatScore(frame.qualityScore)}`);
  return [
    "你是汽车社媒图文编辑，请评估随消息提供的视频候选帧，只输出合法 JSON。",
    "目标是选出适合做图文素材或视觉参考的画面，偏好清晰、有视觉吸引力、有内容信息、有场景感、适合发布的帧。",
    "不要求整车完整、车身占满或必须是外观大图；局部细节、内饰、车灯、轮毂、人车场景、氛围角度都可以是高分画面。",
    "降权转场残影、低清压缩、严重遮挡、无意义空镜、黑屏白屏、重复画面、难以识别内容的运动模糊。",
    "Return JSON only with: {\"frames\":[{\"id\":\"frame-id\",\"aestheticScore\":0-100,\"clarityScore\":0-100,\"compositionScore\":0-100,\"contentValueScore\":0-100,\"usableForPost\":true,\"reason\":\"short reason\"}]}",
    "Score according to social-media usefulness, not whether a full vehicle is visible.",
    `Candidates:\n${frameLines.join("\n")}`,
  ].join("\n");
}

async function callVideoFrameReviewModel(prompt: string, images: ModelImageInput[]): Promise<Record<string, unknown>> {
  const text =
    appConfig.openaiTextEndpoint === "chat"
      ? await callChatCompletions(prompt, images)
      : await callResponsesApi(prompt, images);
  return parseJsonObject(text);
}

async function callResponsesApi(prompt: string, images: ModelImageInput[]) {
  const content = [
    { type: "input_text", text: prompt },
    ...images.map((image) => ({
      type: "input_image",
      image_url: image.imageUrl,
    })),
  ];
  const response = await runWithConcurrencyPool("gpt", () =>
    fetch(openaiTextUrl("responses"), {
      method: "POST",
      headers: openaiHeaders(),
      body: JSON.stringify({
        model: appConfig.openaiTextModel,
        input: [
          {
            role: "user",
            content,
          },
        ],
        text: {
          format: {
            type: "json_object",
          },
        },
      }),
    }),
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI video-frame review request failed: ${response.status} ${body.slice(0, 260)}`);
  }

  const data = (await response.json()) as ResponsesApiTextResponse;
  return (
    data.output_text ||
    data.output?.flatMap((item) => item.content || []).find((contentItem) => typeof contentItem.text === "string")?.text ||
    "{}"
  );
}

async function callChatCompletions(prompt: string, images: ModelImageInput[]) {
  const content = [
    { type: "text", text: prompt },
    ...images.map((image) => ({
      type: "image_url",
      image_url: {
        url: image.imageUrl,
      },
    })),
  ];
  const response = await runWithConcurrencyPool("gpt", () =>
    fetch(openaiTextUrl("chat/completions"), {
      method: "POST",
      headers: openaiHeaders(),
      body: JSON.stringify({
        model: appConfig.openaiTextModel,
        messages: [
          {
            role: "system",
            content: "You only output valid JSON. Do not output Markdown.",
          },
          {
            role: "user",
            content,
          },
        ],
        response_format: {
          type: "json_object",
        },
      }),
    }),
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI video-frame chat review request failed: ${response.status} ${body.slice(0, 260)}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  return data.choices?.[0]?.message?.content || "{}";
}

function normalizeReviewItems(json: Record<string, unknown>) {
  const rawFrames = Array.isArray(json.frames) ? json.frames : [];
  const result = new Map<
    string,
    {
      aestheticScore: number;
      clarityScore: number;
      compositionScore: number;
      contentValueScore: number;
      usableForPost: boolean;
      reason?: string;
    }
  >();
  for (const raw of rawFrames) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id : "";
    if (!id) continue;
    result.set(id, {
      aestheticScore: normalizeScore(item.aestheticScore),
      clarityScore: normalizeScore(item.clarityScore),
      compositionScore: normalizeScore(item.compositionScore),
      contentValueScore: normalizeScore(item.contentValueScore),
      usableForPost: item.usableForPost !== false,
      reason: sanitizeReason(item.reason),
    });
  }
  return result;
}

function normalizeScore(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(number)) return 50;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function averageScores(values: Array<number | undefined>) {
  const scores = values.filter((value): value is number => Number.isFinite(value));
  if (!scores.length) return 50;
  return Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
}

function sanitizeReason(value: unknown) {
  if (typeof value !== "string") return undefined;
  const reason = compactError(value).replace(/车主体完整|主体完整|整车完整入镜|车身占满/g, "画面可用").trim();
  return reason || undefined;
}

function parseJsonObject(text: string): Record<string, unknown> {
  const normalized = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  const parsed = JSON.parse(normalized) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
}

function openaiHeaders() {
  return {
    Authorization: `Bearer ${appConfig.openaiApiKey}`,
    "Content-Type": "application/json",
  };
}

function formatTimestamp(value: number | undefined) {
  return Number.isFinite(value) ? `${Math.round((value || 0) * 10) / 10}s` : "unknown";
}

function formatScore(value: number | undefined) {
  return Number.isFinite(value) ? String(value) : "unknown";
}
