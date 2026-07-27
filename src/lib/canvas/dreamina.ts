import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appConfig } from "../config";

const execFileAsync = promisify(execFile);
const allowedModels = new Set(["seedance2.0_vip", "seedance2.0fast_vip", "seedance2.0", "seedance2.0fast"]);
const allowedRatios = new Set(["1:1", "3:4", "16:9", "4:3", "9:16", "21:9"]);

export class DreaminaNeedsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DreaminaNeedsConfigError";
  }
}

export type DreaminaSubmission = {
  submitId: string;
  status: string;
  videoUrls: string[];
  raw: Record<string, unknown>;
};

export type DreaminaSubmitInput = {
  prompt: string;
  images: string[];
  videos: string[];
  duration: number;
  ratio: string;
  resolution: string;
  modelVersion: string;
};

export async function getDreaminaCredit() {
  const result = await runDreamina(["user_credit"]);
  const totalCredit = Number(result.total_credit);
  if (!Number.isFinite(totalCredit)) throw new DreaminaNeedsConfigError("Dreamina is not logged in. Run dreamina login, then try again.");
  return { totalCredit, vipLevel: typeof result.vip_level === "string" ? result.vip_level : "" };
}

export async function submitDreaminaVideo(input: DreaminaSubmitInput): Promise<DreaminaSubmission> {
  validateDreaminaInput(input);
  const credit = await getDreaminaCredit();
  if (credit.totalCredit < 100) throw new Error(`Dreamina credit is too low (${credit.totalCredit}). At least 100 credits are required.`);
  const singleImage = input.images.length === 1 && input.videos.length === 0;
  const command = singleImage ? "image2video" : input.images.length || input.videos.length ? "multimodal2video" : "text2video";
  const args = [
    command,
    ...input.images.flatMap((url) => [`--image=${url}`]),
    ...input.videos.flatMap((url) => [`--video=${url}`]),
    `--prompt=${input.prompt}`,
    `--duration=${input.duration}`,
    `--model_version=${input.modelVersion}`,
    `--video_resolution=${input.resolution}`,
    "--poll=120",
  ];
  if (!singleImage) args.push(`--ratio=${input.ratio}`);
  return normalizeSubmission(await runDreamina(args));
}

export async function queryDreaminaVideo(submitId: string) {
  const id = submitId.trim();
  if (!id) throw new Error("Dreamina submit_id is required.");
  return normalizeSubmission(await runDreamina(["query_result", `--submit_id=${id}`]), id);
}

export function validateDreaminaInput(input: DreaminaSubmitInput) {
  if (!input.prompt.trim()) throw new Error("Seedance prompt is required.");
  if (input.prompt.length > 2000) throw new Error("Seedance prompt must be 2000 characters or fewer.");
  if (!Number.isInteger(input.duration) || input.duration < 4 || input.duration > 15) throw new Error("Seedance duration must be 4-15 seconds.");
  if (!allowedModels.has(input.modelVersion)) throw new Error("Unsupported Seedance model version.");
  if (!allowedRatios.has(input.ratio)) throw new Error("Unsupported Seedance ratio.");
  if (!new Set(["720p", "1080p"]).has(input.resolution)) throw new Error("Unsupported Seedance resolution.");
  if (input.resolution === "1080p" && input.modelVersion !== "seedance2.0_vip") throw new Error("1080p requires seedance2.0_vip.");
  if (input.images.length > 9) throw new Error("Seedance accepts at most 9 images.");
  if (input.videos.length > 3) throw new Error("Seedance accepts at most 3 videos.");
  if (input.images.length + input.videos.length > 12) throw new Error("Seedance accepts at most 12 mixed media files.");
  input.images.forEach((url) => validateMediaReference(url, ["jpg", "jpeg", "png", "webp", "bmp", "tiff", "gif"], "image"));
  input.videos.forEach((url) => validateMediaReference(url, ["mp4", "mov"], "video"));
}

async function runDreamina(args: string[]) {
  const cli = appConfig.dreaminaCliBin.trim() || "dreamina";
  try {
    const { stdout, stderr } = await execFileAsync(cli, args, {
      cwd: process.cwd(),
      windowsHide: true,
      timeout: appConfig.dreaminaCliTimeoutMs,
      maxBuffer: 4 * 1024 * 1024,
    });
    return parseDreaminaJson(`${stdout}\n${stderr}`);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    if (nodeError.code === "ENOENT") {
      throw new DreaminaNeedsConfigError(`Dreamina CLI was not found at "${cli}". Install it and sign in from Advanced Configuration.`);
    }
    const output = `${nodeError.stdout || ""}\n${nodeError.stderr || ""}`.trim();
    if (/login|not logged|unauthorized/i.test(output)) throw new DreaminaNeedsConfigError("Dreamina is not logged in. Run dreamina login, then try again.");
    const parsed = output ? tryParseDreaminaJson(output) : undefined;
    if (parsed && (parsed.submit_id || parsed.gen_status)) return parsed;
    throw new Error(output || (error instanceof Error ? error.message : "Dreamina CLI failed."));
  }
}

function normalizeSubmission(raw: Record<string, unknown>, fallbackId = ""): DreaminaSubmission {
  const submitId = String(raw.submit_id || fallbackId || "").trim();
  if (!submitId) throw new Error("Dreamina did not return submit_id; the task was not accepted.");
  const status = String(raw.gen_status || raw.status || "pending").toLowerCase();
  const failReason = String(raw.fail_reason || raw.error || "").trim();
  if (["fail", "failed", "error"].includes(status)) throw new Error(failReason || `Dreamina task ${submitId} failed.`);
  return { submitId, status, videoUrls: collectVideoUrls(raw), raw };
}

function parseDreaminaJson(output: string) {
  const parsed = tryParseDreaminaJson(output);
  if (!parsed) throw new Error(`Dreamina returned an unreadable response: ${output.trim().slice(0, 500)}`);
  return parsed;
}

function tryParseDreaminaJson(output: string): Record<string, unknown> | undefined {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).reverse();
  for (const candidate of [output.trim(), ...lines]) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {}
  }
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(output.slice(start, end + 1)) as Record<string, unknown>;
    } catch {}
  }
  return undefined;
}

function collectVideoUrls(raw: Record<string, unknown>) {
  const values: string[] = [];
  const visit = (value: unknown) => {
    if (typeof value === "string" && (/^https?:\/\//i.test(value) || /\.(mp4|mov)(?:\?|$)/i.test(value))) values.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value as Record<string, unknown>).forEach(visit);
  };
  visit(raw.result);
  visit(raw.video_url);
  visit(raw.video_urls);
  return Array.from(new Set(values));
}

function validateMediaReference(value: string, extensions: string[], label: string) {
  const reference = value.trim();
  if (!reference) throw new Error(`Seedance ${label} reference is empty.`);
  const pathname = reference.split(/[?#]/, 1)[0].toLowerCase();
  if (!extensions.some((extension) => pathname.endsWith(`.${extension}`))) {
    throw new Error(`Seedance ${label} must use one of: ${extensions.join(", ")}.`);
  }
}
