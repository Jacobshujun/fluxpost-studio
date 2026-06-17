#!/usr/bin/env node
import { spawn, execFile } from "node:child_process";
import { existsSync } from "node:fs";
import nextEnv from "@next/env";
import path from "node:path";
import readline from "node:readline";
import { promisify } from "node:util";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const execFileAsync = promisify(execFile);
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const reply = args.has("--reply");
const selfTest = args.has("--self-test");
const maxEvents = readNumberArg("--max-events", 0);
const timeout = readStringArg("--timeout", "");
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

await consumeEvents();

async function consumeEvents() {
  const invocation = resolveCliInvocation(cliBin);
  const eventArgs = [
    ...invocation.argsPrefix,
    "event",
    "consume",
    "im.message.receive_v1",
    "--as",
    "bot",
  ];
  if (maxEvents > 0) eventArgs.push("--max-events", String(maxEvents));
  if (timeout) eventArgs.push("--timeout", timeout);

  const child = spawn(invocation.file, eventArgs, {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
  });

  let ready = false;
  const stderr = readline.createInterface({ input: child.stderr });
  stderr.on("line", (line) => {
    if (line.includes("[event] ready")) ready = true;
    console.error(line);
  });

  const stdout = readline.createInterface({ input: child.stdout });
  stdout.on("line", (line) => {
    handleEventLine(line).catch((error) => {
      console.error(JSON.stringify({ status: "event_error", error: compactError(error) }));
    });
  });

  child.on("error", (error) => {
    console.error(JSON.stringify({ status: "event_consumer_error", error: compactError(error) }));
  });

  const exitCode = await new Promise((resolve) => {
    child.on("exit", (code) => resolve(code ?? 0));
  });
  if (!ready && exitCode === 0) {
    console.error("[event] exited before ready marker.");
  }
  if (exitCode !== 0) {
    throw new Error(`lark-cli event consume exited with code ${exitCode}`);
  }
}

async function handleEventLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return;
  const event = JSON.parse(trimmed);
  const message = normalizeEventMessage(event);
  if (!message || !chatIds.includes(message.chatId) || !isTaskCommand(message.text)) return;

  if (dryRun) {
    console.log(JSON.stringify({ status: "dry_run", message }, null, 2));
    return;
  }

  const result = await submitMessage(message);
  console.log(JSON.stringify({ messageId: message.messageId, status: result.status, reason: result.reason, runId: result.launch?.runId }, null, 2));
  if (reply && result.replyText && result.status !== "duplicate") {
    await replyToMessage(message.messageId, result.replyText);
  }
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

function normalizeEventMessage(rawEvent) {
  const event = rawEvent.event && typeof rawEvent.event === "object" ? rawEvent.event : rawEvent;
  const messageId = firstString(event, ["message_id", "messageId"]);
  const chatId = firstString(event, ["chat_id", "chatId"]);
  const senderId = firstString(event, ["sender_id", "senderId", "open_id", "openId"]);
  const senderName = firstString(event, ["sender_name", "senderName", "operator_name", "operatorName"]);
  const text = extractEventText(event);
  if (!messageId || !chatId || !senderId || !text) return undefined;
  return {
    messageId,
    chatId,
    senderId,
    senderName,
    text,
    createdAt: firstString(event, ["create_time", "createTime", "timestamp"]),
  };
}

function extractEventText(event) {
  const content = event.content ?? event.message?.content ?? event.body?.content;
  if (typeof content === "string" && content.trim().startsWith("{")) {
    try {
      return extractMessageText(JSON.parse(content));
    } catch {
      return content;
    }
  }
  return extractMessageText(content || event.text || event.message?.text || "");
}

function extractMessageText(content) {
  if (typeof content === "string") return content;
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
  return normalized.startsWith("/flux") || normalized.startsWith("鍙戠") || normalized.startsWith("发稿");
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

function firstString(record, keys) {
  if (!record || typeof record !== "object") return "";
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
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

function compactError(error) {
  return error instanceof Error ? error.message : String(error);
}

function runSelfTest() {
  const sample = {
    chat_id: "oc_selftest",
    message_id: "om_selftest",
    sender_id: "ou_selftest",
    content: { text: "<at user_id=\"ou_bot\">Bot</at> /flux xiaopeng 3776077" },
    create_time: "2026-06-12 16:30",
  };
  const normalized = normalizeEventMessage(sample);
  if (!normalized || !isTaskCommand(normalized.text)) {
    throw new Error("Lark task event self-test failed.");
  }
  console.log(JSON.stringify({ status: "self_test_ok", message: normalized }, null, 2));
}
