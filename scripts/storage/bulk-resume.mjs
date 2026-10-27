import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export async function loadCheckpoints(jobRoot, job) {
  const checkpoints = new Map();
  const dirs = await readdir(jobRoot, { withFileTypes: true });
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const root = path.join(jobRoot, dir.name);
    let summary;
    try { summary = JSON.parse(await readFile(path.join(root, "summary.json"), "utf8")); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    if (summary.job !== job) continue;
    const text = await readFile(path.join(root, "journal.ndjson"), "utf8");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.state !== "verified" || !/^[a-f0-9]{64}$/.test(event.sourceSha256) ||
          event.sourceSha256 !== event.targetSha256 || !event.sourceEtag || !event.targetEtag ||
          !Number.isFinite(Date.parse(event.sourceModified)) || !Number.isSafeInteger(event.size)) continue;
      const previous = checkpoints.get(event.key);
      if (!previous || String(event.at || "") >= String(previous.at || "")) checkpoints.set(event.key, event);
    }
  }
  return checkpoints;
}

// Global admission pacing: payload requests are spaced, not OS traffic-shaped.
export function pacePayloads({ bytesPerSecond, now = Date.now, sleep: wait = sleep }) {
  let available = 0;
  return async bytes => {
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error("InvalidPayloadBudget");
    if (!bytes) return;
    const current = now();
    available = Math.max(available, current) + bytes * 1000 / bytesPerSecond;
    await wait(Math.max(0, Math.ceil(available - current)));
  };
}

function transient(error) {
  for (let e = error, depth = 0; e && depth < 4; e = e.cause || e.originalError, depth++) {
    const status = Number(e.statusCode || e.status || e.response?.status);
    if (status === 408 || status === 429 || (status >= 500 && status <= 599)) return `HTTP${status}`;
    if (status >= 400 && status <= 499) return undefined;
    if (["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EPIPE", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET"].includes(e.code)) return e.code;
  }
  return undefined;
}

const idempotent = new Set(["head", "headObject", "getObjectV2", "get", "uploadPart"]);
export function guardedClient(client, { label, pace, record, sleep: wait = sleep }) {
  return new Proxy(client, { get(target, method) {
    const value = Reflect.get(target, method);
    if (typeof value !== "function") return value;
    return async (...args) => {
      for (let attempt = 1; ; attempt++) {
        let bytes = 0;
        if (method === "getObjectV2") bytes = args[0].rangeEnd - args[0].rangeStart + 1;
        if (method === "uploadPart") bytes = args[5] - args[4];
        if (method === "get") {
          const match = args[1]?.headers?.Range?.match(/^bytes=(\d+)-(\d+)$/);
          if (match) bytes = Number(match[2]) - Number(match[1]) + 1;
        }
        await pace(bytes);
        try { return await value.apply(target, args); }
        catch (error) {
          const code = transient(error);
          if (!idempotent.has(method) || !code || attempt >= 3) throw error;
          await record({ state: "retry", provider: label, operation: method, attempt, code });
          await wait(attempt === 1 ? 1000 : 3000);
        }
      }
    };
  } });
}
