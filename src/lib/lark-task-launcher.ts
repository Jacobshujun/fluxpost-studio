import { randomBytes } from "node:crypto";
import { compactError, recordExecutionLog } from "./activity-log";
import { appConfig } from "./config";
import { getLarkTaskLaunchByMessageId, getWorkspaceAccountByIdFromDb, saveLarkTaskLaunchToDb } from "./database";
import { startSimpleRun } from "./simple-runs";
import type { CrawlPlatform, LarkTaskLaunch, SimpleRunInput, SourceLinkPlatform, WorkspaceAccountRecord } from "./types";

export type LarkTaskMessage = {
  messageId: string;
  chatId: string;
  senderId: string;
  senderName?: string;
  text: string;
  createdAt?: string;
};

export type LarkTaskProcessResult = {
  status: "ignored" | "duplicate" | "launched" | "failed";
  reason?: string;
  launch?: LarkTaskLaunch;
  replyText?: string;
};

type ParsedLarkTaskCommand = {
  input: Omit<SimpleRunInput, "ownerUserId" | "ownerDisplayName">;
  commandText: string;
};

const supportedPlatforms = new Set<CrawlPlatform>(["douyin", "xiaohongshu", "weibo", "wechat_channels"]);

export function isLarkTaskCommandText(text: string) {
  const normalized = normalizeCommandText(text);
  return normalized.startsWith("/flux") || normalized.startsWith("发稿");
}

export function parseLarkTaskCommand(text: string): ParsedLarkTaskCommand | undefined {
  const commandText = normalizeCommandText(text);
  if (!isLarkTaskCommandText(commandText)) return undefined;

  const lines = commandText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const head = lines[0] || "";
  const bodyLines = lines.slice(1);
  const tokens = tokenize(head);
  if (!tokens.length) return undefined;
  const prefix = tokens.shift();
  if (prefix !== "/flux" && prefix !== "发稿") return undefined;

  const rawModeToken = tokens[0];
  const modeToken = normalizeModeToken(rawModeToken);
  const modeLinkPlatform = normalizeModeLinkPlatform(rawModeToken);
  if (modeToken) tokens.shift();
  const options = parseOptions(tokens);
  const sourceMode = modeToken || inferSourceMode(options, bodyLines, tokens);
  const targetCount = parsePositiveInt(options.count || options.target || options.targetCount, appConfig.larkTaskDefaultCount);
  const confirmed = /^(1|true|yes|y|确认|是)$/i.test(options.confirm || "");
  if (targetCount > appConfig.larkTaskConfirmAbove && !confirmed) {
    throw new Error(`Target count ${targetCount} requires confirm=yes.`);
  }

  if (sourceMode === "links") {
    const inlineLinkPlatform = normalizeModeLinkPlatform(tokens[0]);
    if (inlineLinkPlatform) tokens.shift();
    const linkPlatform = normalizeLinkPlatform(options.platform || options.platforms) || modeLinkPlatform || inlineLinkPlatform || "auto";
    const links = uniqueStrings([
      ...extractLinkInputs(tokens.join(" "), linkPlatform),
      ...extractLinkInputs(bodyLines.join("\n"), linkPlatform),
    ]);
    if (!links.length) throw new Error("At least one source link is required.");
    return {
      commandText,
      input: {
        sourceMode: "links",
        keyword: options.keyword || options.vehicle || "飞书链接任务",
        targetCount: Math.min(targetCount, links.length),
        platforms: [],
        materialPaths: [],
        links,
        linkPlatform,
      },
    };
  }

  if (sourceMode === "feishu") {
    const taskNumbers = uniqueStrings([
      ...splitList(options.tasks || options.task || options.taskNumbers || ""),
      ...bodyLines.flatMap((line) => splitList(line)),
    ]);
    if (!taskNumbers.length) throw new Error("At least one Feishu task number is required.");
    return {
      commandText,
      input: {
        sourceMode: "feishu",
        keyword: options.keyword || options.vehicle || "飞书任务",
        targetCount: Math.min(targetCount, taskNumbers.length),
        platforms: [],
        materialPaths: [],
        feishuTaskNumbers: taskNumbers,
      },
    };
  }

  const keyword = options.keyword || options.vehicle || tokens.filter((token) => !isOptionToken(token)).join(" ").trim();
  if (!keyword) throw new Error("Keyword is required.");
  const platforms = normalizePlatforms(options.platforms || options.platform || "");
  return {
    commandText,
    input: {
      sourceMode: "keyword",
      keyword,
      targetCount,
      platforms: platforms.length ? platforms : normalizePlatforms(appConfig.larkTaskDefaultPlatforms.join(",")),
      materialPaths: [],
    },
  };
}

export async function processLarkTaskMessage(message: LarkTaskMessage): Promise<LarkTaskProcessResult> {
  if (!isLarkTaskCommandText(message.text)) return { status: "ignored", reason: "not_command" };
  if (!appConfig.larkTaskChatIds.includes(message.chatId)) return { status: "ignored", reason: "chat_not_allowed" };

  const existing = await getLarkTaskLaunchByMessageId(message.messageId);
  if (existing?.runId || existing?.status === "launched") {
    return {
      status: "duplicate",
      launch: existing,
      replyText: `已处理过这条指令，任务 ${existing.runId || "已记录"}。`,
    };
  }

  const account = await resolveLarkTaskOwner(message.senderId);
  const now = new Date().toISOString();
  const baseLaunch: LarkTaskLaunch = {
    id: existing?.id || `lark-task-${Date.now()}-${randomBytes(4).toString("hex")}`,
    messageId: message.messageId,
    chatId: message.chatId,
    senderId: message.senderId,
    senderName: message.senderName,
    ownerUserId: account?.id,
    ownerDisplayName: account?.displayName,
    status: "processing",
    commandText: normalizeCommandText(message.text),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  if (!account) {
    const failed = {
      ...baseLaunch,
      status: "failed" as const,
      error: "Sender is not mapped to a workspace account.",
    };
    await saveLarkTaskLaunchToDb(failed);
    return {
      status: "failed",
      launch: failed,
      replyText: "未发起：当前飞书发送人没有映射到 FluxPost 工作区账号。",
    };
  }

  try {
    const parsed = parseLarkTaskCommand(message.text);
    if (!parsed) return { status: "ignored", reason: "not_command" };
    await saveLarkTaskLaunchToDb({ ...baseLaunch, parsedInput: { ...parsed.input, ownerUserId: account.id, ownerDisplayName: account.displayName } });

    const run = await startSimpleRun({
      ...parsed.input,
      ownerUserId: account.id,
      ownerDisplayName: account.displayName,
    });
    const launched: LarkTaskLaunch = {
      ...baseLaunch,
      status: "launched",
      runId: run.id,
      parsedInput: run.input,
      updatedAt: new Date().toISOString(),
    };
    await saveLarkTaskLaunchToDb(launched);
    await recordExecutionLog({
      scope: "lark/task",
      action: "Lark IM task launched",
      status: "success",
      message: `Lark message ${message.messageId} launched simple run ${run.id}.`,
      details: {
        runId: run.id,
        sourceMode: run.input.sourceMode || "keyword",
        ownerUserId: account.id,
      },
      ownerUserId: account.id,
      ownerDisplayName: account.displayName,
    });
    return {
      status: "launched",
      launch: launched,
      replyText: buildLaunchReply(run.id, run.input),
    };
  } catch (error) {
    const failed: LarkTaskLaunch = {
      ...baseLaunch,
      status: "failed",
      error: compactError(error),
      updatedAt: new Date().toISOString(),
    };
    await saveLarkTaskLaunchToDb(failed);
    await recordExecutionLog({
      scope: "lark/task",
      action: "Lark IM task launch failed",
      status: "error",
      message: compactError(error),
      details: {
        messageId: message.messageId,
        senderId: message.senderId,
      },
      ownerUserId: account.id,
      ownerDisplayName: account.displayName,
    });
    return {
      status: "failed",
      launch: failed,
      replyText: `未发起：${compactError(error)}`,
    };
  }
}

async function resolveLarkTaskOwner(senderId: string): Promise<WorkspaceAccountRecord | undefined> {
  const accountId = appConfig.larkTaskUserMap[senderId];
  if (!accountId) return undefined;
  const account = await getWorkspaceAccountByIdFromDb(accountId);
  if (!account || account.status !== "active") return undefined;
  return account;
}

function buildLaunchReply(runId: string, input: SimpleRunInput) {
  const sourceMode = input.sourceMode || "keyword";
  const sourceText =
    sourceMode === "links"
      ? `${input.links?.length || 0} 条链接`
      : sourceMode === "feishu"
        ? `${input.feishuTaskNumbers?.length || 0} 个飞书任务编号`
        : `${input.keyword} / ${input.platforms.join(",")}`;
  return `已创建 FluxPost 任务：${runId}\n来源：${sourceText}\n数量：${input.targetCount}`;
}

function normalizeCommandText(text: string) {
  return text.replace(/<at\b[^>]*>.*?<\/at>/gi, "").trim();
}

function normalizeModeToken(token?: string): SimpleRunInput["sourceMode"] | undefined {
  const value = (token || "").trim().toLowerCase();
  if (isXiaopengBbsAlias(value) || isDongchediAlias(value)) return "links";
  if (["keyword", "关键词", "车型", "搜索"].includes(value)) return "keyword";
  if (["links", "link", "链接", "url"].includes(value)) return "links";
  if (["feishu", "飞书", "任务", "task"].includes(value)) return "feishu";
  return undefined;
}

function normalizeModeLinkPlatform(token?: string): SourceLinkPlatform | undefined {
  const value = (token || "").trim().toLowerCase();
  if (isXiaopengBbsAlias(value)) return "xiaopeng_bbs";
  if (isDongchediAlias(value)) return "dongchedi";
  return undefined;
}

function inferSourceMode(options: Record<string, string>, bodyLines: string[], tokens: string[]): SimpleRunInput["sourceMode"] {
  if (options.tasks || options.task || options.taskNumbers) return "feishu";
  if (extractUrls([...tokens, ...bodyLines].join("\n")).length) return "links";
  return "keyword";
}

function tokenize(value: string) {
  return value.match(/"[^"]+"|'[^']+'|\S+/g)?.map((token) => token.replace(/^["']|["']$/g, "")) || [];
}

function parseOptions(tokens: string[]) {
  const options: Record<string, string> = {};
  for (const token of tokens) {
    const match = token.match(/^([^=\s:：]+)[=:：](.+)$/);
    if (!match) continue;
    options[normalizeOptionKey(match[1])] = match[2].trim();
  }
  return options;
}

function normalizeOptionKey(key: string) {
  const normalized = key.trim().toLowerCase();
  const aliases: Record<string, string> = {
    数量: "count",
    平台: "platforms",
    车型: "vehicle",
    关键词: "keyword",
    确认: "confirm",
    飞书任务: "tasks",
    任务编号: "tasks",
  };
  return aliases[normalized] || normalized;
}

function isOptionToken(token: string) {
  return /^([^=\s:：]+)[=:：](.+)$/.test(token);
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const candidate = Number(value);
  return Number.isFinite(candidate) && candidate > 0 ? Math.floor(candidate) : fallback;
}

function normalizePlatforms(value: string): CrawlPlatform[] {
  return uniqueStrings(splitList(value))
    .map(normalizePlatform)
    .filter((platform): platform is CrawlPlatform => Boolean(platform));
}

function normalizePlatform(value: string): CrawlPlatform | undefined {
  const normalized = value.trim().toLowerCase();
  const aliases: Record<string, CrawlPlatform> = {
    抖音: "douyin",
    小红书: "xiaohongshu",
    微博: "weibo",
    视频号: "wechat_channels",
    wechat: "wechat_channels",
    wechatchannels: "wechat_channels",
    xhs: "xiaohongshu",
  };
  const platform = aliases[normalized] || normalized;
  return supportedPlatforms.has(platform as CrawlPlatform) ? (platform as CrawlPlatform) : undefined;
}

function normalizeLinkPlatform(value: string | undefined): SourceLinkPlatform | "auto" | undefined {
  if (!value) return undefined;
  if (value.trim().toLowerCase() === "auto") return "auto";
  const normalized = value.trim().toLowerCase();
  if (isXiaopengBbsAlias(normalized)) return "xiaopeng_bbs";
  if (isDongchediAlias(normalized)) return "dongchedi";
  return normalizePlatform(value) || "auto";
}

function splitList(value: string) {
  return value
    .split(/[,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractUrls(value: string) {
  return value.match(/https?:\/\/[^\s，,]+/g) || [];
}

function extractLinkInputs(value: string, linkPlatform: SourceLinkPlatform | "auto" | undefined) {
  const urls = extractUrls(value);
  if (linkPlatform !== "xiaopeng_bbs" && linkPlatform !== "dongchedi") return urls;
  const ids = value.match(linkPlatform === "dongchedi" ? /\b\d{8,24}\b/g : /\b\d{4,20}\b/g) || [];
  return uniqueStrings([...urls, ...ids]);
}

function isXiaopengBbsAlias(value: string) {
  return [
    "xiaopeng",
    "xpeng",
    "xiaopeng_bbs",
    "xiaopengbbs",
    "xpeng_bbs",
    "xpengbbs",
    "\u5c0f\u9e4f",
    "\u5c0f\u9e4f\u793e\u533a",
    "\u5c0f\u9e4f\u8bba\u575b",
  ].includes(value);
}

function isDongchediAlias(value: string) {
  return [
    "dongchedi",
    "dcd",
    "dongche",
    "\u61c2\u8f66\u5e1d",
  ].includes(value);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
