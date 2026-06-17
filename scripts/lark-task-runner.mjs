#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import nextEnv from "@next/env";
import path from "node:path";
import { promisify } from "node:util";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const execFileAsync = promisify(execFile);
const args = new Set(process.argv.slice(2));
const once = args.has("--once");
const dryRun = args.has("--dry-run");
const reply = args.has("--reply");
const selfTest = args.has("--self-test");
const intervalMs = readNumberArg("--interval-ms", 30_000);
const pageSize = readNumberArg("--page-size", 20);
const appUrl = readStringArg("--app-url", process.env.LARK_TASK_APP_URL || "http://127.0.0.1:3001");
const cliBin = process.env.FEISHU_CLI_BIN || "lark-cli";
const chatIds = parseCsv(process.env.LARK_TASK_CHAT_IDS || process.env.FEISHU_TASK_CHAT_IDS || "");
const apiToken = process.env.LARK_TASK_API_TOKEN || process.env.FEISHU_TASK_API_TOKEN || "";

if (selfTest) {
  runSelfTest();
  process.exit(0);
}

if (!chatIds.length) throw new Error("LARK_TASK_CHAT_IDS is required.");
if (!apiToken && !dryRun) throw new Error("LARK_TASK_API_TOKEN is required unless --dry-run is used.");

do {
  await pollOnce();
  if (once) break;
  await sleep(intervalMs);
} while (true);

async function pollOnce() {
  for (const chatId of chatIds) {
    const messages = await listMessages(chatId);
    for (const message of messages.reverse()) {
      const normalized = normalizeMessage(message, chatId);
      if (!normalized || !isTaskCommand(normalized.text)) continue;
      if (dryRun) {
        console.log(JSON.stringify({ status: "dry_run", message: normalized }, null, 2));
        continue;
      }
      const result = await submitMessage(normalized);
      console.log(JSON.stringify({ messageId: normalized.messageId, status: result.status, reason: result.reason, runId: result.launch?.runId }, null, 2));
      if (reply && result.replyText) {
        await replyToMessage(normalized.messageId, result.replyText);
      }
    }
  }
}

async function listMessages(chatId) {
  const invocation = resolveCliInvocation(cliBin);
  const { stdout } = await execFileAsync(invocation.file, [
    ...invocation.argsPrefix,
    "im",
    "+chat-messages-list",
    "--as",
    "bot",
    "--chat-id",
    chatId,
    "--sort",
    "desc",
    "--page-size",
    String(pageSize),
    "--format",
    "json",
  ], { maxBuffer: 10 * 1024 * 1024 });
  const parsed = JSON.parse(stdout);
  if (Array.isArray(parsed.messages)) return parsed.messages;
  if (Array.isArray(parsed.data?.messages)) return parsed.data.messages;
  return [];
}

async function submitMessage(message) {
  const response = await fetch(`${appUrl.replace(/\/+$/, "")}/api/lark/tasks`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(message),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok && !data.status) {
    throw new Error(data.error || `Task API failed with HTTP ${response.status}`);
  }
  return data;
}

async function replyToMessage(messageId, text) {
  const invocation = resolveCliInvocation(cliBin);
  await execFileAsync(invocation.file, [
    ...invocation.argsPrefix,
    "im",
    "+messages-reply",
    "--as",
    "bot",
    "--message-id",
    messageId,
    "--text",
    text,
    "--idempotency-key",
    `fp-${messageId.slice(-16)}`,
  ], { maxBuffer: 1024 * 1024 });
}

function normalizeMessage(message, chatId) {
  const messageId = String(message.message_id || message.messageId || "");
  if (!messageId) return undefined;
  const text = extractMessageText(message.content);
  const sender = message.sender || {};
  const senderId = String(sender.id || sender.open_id || sender.openId || sender.sender_id || "");
  if (!senderId || !text) return undefined;
  return {
    messageId,
    chatId: String(message.chat_id || message.chatId || chatId),
    senderId,
    senderName: sender.name || sender.display_name || sender.displayName,
    text,
    createdAt: message.create_time || message.createTime,
  };
}

function extractMessageText(content) {
  if (typeof content === "string") {
    try {
      return extractMessageText(JSON.parse(content));
    } catch {
      return content;
    }
  }
  if (!content || typeof content !== "object") return "";
  if (typeof content.text === "string") return content.text;
  if (content.zh_cn) return extractMessageText(content.zh_cn);
  if (Array.isArray(content.content)) {
    return content.content.flat(Infinity).map((part) => {
      if (!part || typeof part !== "object") return "";
      return part.text || part.href || "";
    }).filter(Boolean).join("\n");
  }
  return "";
}

function isTaskCommand(text) {
  const normalized = text.replace(/<at\b[^>]*>.*?<\/at>/gi, "").trim();
  return normalized.startsWith("/flux") || normalized.startsWith("发稿");
}

function resolveCliInvocation(command) {
  const clean = stripWrappingQuotes(command.trim());
  if (process.platform === "win32") {
    const script = resolveLarkCliNodeScript(clean);
    if (script) return { file: process.execPath, argsPrefix: [script] };
  }
  return { file: clean, argsPrefix: [] };
}

function resolveLarkCliNodeScript(command) {
  const baseName = path.basename(command).toLowerCase().replace(/\.(cmd|ps1|exe)$/i, "");
  if (baseName !== "lark-cli") return null;
  for (const dir of getPathDirs()) {
    const scriptPath = path.join(dir, "node_modules", "@larksuite", "cli", "scripts", "run.js");
    if (existsSync(scriptPath)) return scriptPath;
  }
  return null;
}

function getPathDirs() {
  const dirs = (process.env.PATH || process.env.Path || "").split(path.delimiter).map((item) => stripWrappingQuotes(item.trim())).filter(Boolean);
  if (process.env.APPDATA) dirs.push(path.join(process.env.APPDATA, "npm"));
  if (process.env.npm_config_prefix) dirs.push(process.env.npm_config_prefix);
  return [...new Set(dirs)];
}

function stripWrappingQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}

function parseCsv(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function readNumberArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readStringArg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runSelfTest() {
  const sample = {
    message_id: "om_selftest",
    chat_id: "oc_selftest",
    sender: { id: "ou_selftest", name: "Self Test" },
    content: JSON.stringify({ text: "/flux keyword 小鹏G6 count=5 platforms=douyin,xhs" }),
  };
  const normalized = normalizeMessage(sample, "oc_selftest");
  if (!normalized || !isTaskCommand(normalized.text)) {
    throw new Error("Lark task runner self-test failed.");
  }
  console.log(JSON.stringify({ status: "self_test_ok", message: normalized }, null, 2));
}
