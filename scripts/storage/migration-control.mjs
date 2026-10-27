import { createHash, randomUUID } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { access, mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { validateInventory } from "./bulk-core.mjs";

const fail = code => Object.assign(new Error(code), { code });
const validJob = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
async function optionalJson(file) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return undefined; throw fail("InvalidStateFile"); }
}
async function exists(file) {
  try { await access(file); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

export async function probeWorker({ pid, job }) {
  if (!Number.isInteger(pid) || pid <= 0 || !validJob(job)) return "unknown";
  try {
    let command;
    if (process.platform === "win32") {
      // Never print this response: process command lines can contain private paths.
      const raw = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
        `$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}' -ErrorAction Stop; if($p){$p.CommandLine|ConvertTo-Json -Compress}else{'null'}`],
      { encoding: "utf8", windowsHide: true, timeout: 5000, stdio: ["ignore", "pipe", "pipe"] });
      command = JSON.parse(raw.replace(/^\uFEFF/, "").trim());
      if (command === null) return "absent";
    } else if (process.platform === "linux") {
      try { command = await readFile(`/proc/${pid}/cmdline`, "utf8"); }
      catch (error) { if (error.code === "ENOENT") return "absent"; throw error; }
    } else {
      try { process.kill(pid, 0); } catch (error) { return error.code === "ESRCH" ? "absent" : "unknown"; }
      return "unknown";
    }
    return typeof command === "string" && command.includes("bulk-migrate.mjs") && command.includes(job) ? "match" : "foreign";
  } catch { return "unknown"; }
}

async function launchWorker({ projectRoot, manifestPath, outPath, errorPath, env }) {
  const out = await open(outPath, "wx", 0o600);
  let err;
  try {
    err = await open(errorPath, "wx", 0o600);
    const child = spawn(process.execPath, ["--env-file=.env.local", "scripts/storage/bulk-migrate.mjs", "--apply", manifestPath], {
      cwd: projectRoot, env, detached: true, windowsHide: true, stdio: ["ignore", out.fd, err.fd],
    });
    await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
    child.unref();
    return child.pid;
  } finally { await out.close(); if (err) await err.close(); }
}

export function createController({ projectRoot, env = process.env, probe = probeWorker, launch = launchWorker, wait = sleep }) {
  const root = path.join(projectRoot, "data", "oss-migration");
  const files = Object.fromEntries(["progress.json", "active.lock", "launch.json", "controller.lock", "STOP"].map(name => [name, path.join(root, name)]));
  async function status() {
    const progress = await optionalJson(files["progress.json"]);
    const lock = await optionalJson(files["active.lock"]);
    const launch = await optionalJson(files["launch.json"]);
    const candidates = [lock && { ...lock, job: lock.id }, launch, progress].filter(Boolean);
    const checked = new Map();
    for (const candidate of candidates) {
      const identity = `${candidate.pid}:${candidate.job}`;
      if (!checked.has(identity)) checked.set(identity, { ...candidate, identity: await probe(candidate) });
    }
    const worker = [...checked.values()].find(x => x.identity === "match");
    const uncertain = [...checked.values()].some(x => x.identity === "unknown" || x.identity === "foreign");
    const stopping = await exists(files.STOP);
    let state;
    if (worker) state = stopping ? "stopping" : progress?.pid === worker.pid && progress?.status === "running" ? "running" : "starting";
    else if (uncertain) state = "unknown";
    else if (!progress) state = "idle";
    else if (progress.status === "running") state = "interrupted";
    else if (progress.status === "snapshot-verified") state = "completed";
    else state = progress.status === "stopped" ? "stopped" : "failed";
    return { state, progress, worker, lock, launch, stopping };
  }
  async function exclusive(operation) {
    await mkdir(root, { recursive: true });
    let handle;
    try { handle = await open(files["controller.lock"], "wx", 0o600); }
    catch (error) { if (error.code === "EEXIST") throw fail("ControllerBusy"); throw error; }
    try {
      await handle.writeFile(JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
      return await operation();
    } finally { await handle.close(); await unlink(files["controller.lock"]); }
  }
  async function start({ confirmed = false } = {}) {
    if (!confirmed) return { result: "confirmation-required" };
    return exclusive(async () => {
      const current = await status();
      if (current.worker) return { result: "already-running", snapshot: current };
      if (current.progress && !validJob(current.progress.job)) throw fail("InvalidJobIdentity");
      if (current.state === "unknown") throw fail("ProcessIdentityUnknown");
      if (current.state === "completed") return { result: "snapshot-complete", snapshot: current };
      const progress = current.progress;
      if (!progress) throw fail("NoExistingManifest");
      if (!validJob(progress.job)) throw fail("InvalidJobIdentity");
      if (progress.lifecycleEvidence !== "operator-confirmed-no-rules") throw fail("LifecycleConfirmationRequired");
      const manifestPath = path.join(root, progress.job, "manifest.json");
      const raw = await readFile(manifestPath, "utf8");
      if (createHash("sha256").update(raw).digest("hex") !== progress.job) throw fail("ManifestHashMismatch");
      validateInventory(JSON.parse(raw));
      if (!await exists(path.join(projectRoot, ".env.local"))) throw fail("ConfigFileMissing");
      const keyFile = env.FLUXPOST_OSS_KEY_FILE || path.join(projectRoot, "aliyun_oss_key.txt");
      if (!await exists(keyFile)) throw fail("OssKeyFileMissing");
      // PID absent was proven; delete only these exact controller-owned files.
      for (const [file, present] of [[files["active.lock"], current.lock], [files["launch.json"], current.launch], [files.STOP, current.stopping]]) {
        if (present) await unlink(file);
      }
      const tag = randomUUID();
      const outPath = path.join(root, `console-${tag}.out.log`);
      const errorPath = path.join(root, `console-${tag}.err.log`);
      const pid = await launch({ projectRoot, manifestPath, outPath, errorPath,
        env: { ...env, NODE_TLS_REJECT_UNAUTHORIZED: "1", FLUXPOST_OSS_NO_LIFECYCLE_CONFIRMED: "1", FLUXPOST_OSS_KEY_FILE: keyFile } });
      await writeFile(files["launch.json"] + ".tmp", JSON.stringify({ pid, job: progress.job, startedAt: new Date().toISOString(), errorPath }), { mode: 0o600 });
      await rename(files["launch.json"] + ".tmp", files["launch.json"]);
      for (let i = 0; i < 30; i++) {
        const next = await status();
        if (next.progress?.pid === pid && next.state === "running") return { result: "started", snapshot: next };
        const identity = await probe({ pid, job: progress.job });
        if (identity === "absent") throw fail("WorkerExitedDuringStartup");
        if (identity !== "match") throw fail("ProcessIdentityUnknown");
        await wait(1000);
      }
      return { result: "starting", snapshot: await status() };
    });
  }
  async function stop({ confirmed = false } = {}) {
    if (!confirmed) return { result: "confirmation-required" };
    return exclusive(async () => {
      const current = await status();
      if (current.state === "unknown") throw fail("ProcessIdentityUnknown");
      if (!current.worker) return { result: "not-running", snapshot: current };
      await writeFile(files.STOP, "Operator requested graceful stop.\n", { flag: "a", mode: 0o600 });
      return { result: "stop-requested", snapshot: await status() };
    });
  }
  return { status, start, stop };
}

export function formatStatus({ state, progress: p, worker }) {
  const labels = { running: "运行中", starting: "启动中", stopping: "正在安全停止（等待当前文件处理完）", stopped: "已停止", failed: "出错停止", interrupted: "进程已退出（记录未正常结束）", completed: "本轮清单校验完成", idle: "暂无迁移记录", unknown: "进程身份无法确认，请勿重复启动" };
  const lines = ["FluxPost · TOS → OSS 迁移", `状态：${labels[state] || "未知"}`];
  if (!p) return lines.join("\n");
  const number = value => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
  const done = number(p.verifiedBytes), total = number(p.totalBytes);
  const percent = total ? Math.min(100, done / total * 100) : 0;
  const blocks = Math.floor(percent / 5);
  lines.push(`[${"#".repeat(blocks)}${"-".repeat(20 - blocks)}] ${percent.toFixed(1)}%`,
    `本轮已确认：${number(p.verifiedObjects).toLocaleString("zh-CN")} / ${number(p.totalObjects).toLocaleString("zh-CN")} 个文件`,
    `本轮已确认：${(done / 1e9).toFixed(2)} / ${(total / 1e9).toFixed(2)} GB`,
    `本轮新上传：${number(p.uploadedObjects)} 个（可能仍待读回校验）`,
    `复用历史校验：${number(p.checkpointReused)} 个；已载入历史记录：${number(p.availableCheckpoints)} 个`,
    `本轮文件失败：${number(p.failures)}；临时错误重试：${number(p.retries)}`);
  if (worker) lines.push(`迁移进程：${worker.pid}；并发：${number(p.concurrency)}`);
  if (p.payloadPacingBytesPerSecond) lines.push(`数据请求节奏：${(number(p.payloadPacingBytesPerSecond) / 1024 ** 2).toFixed(1)} MiB/s（不是瞬时网速上限）`);
  if (Number.isFinite(Date.parse(p.updatedAt))) lines.push(`最后进度：${new Date(p.updatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}（北京时间）`);
  if (typeof p.lastErrorCode === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(p.lastErrorCode)) lines.push(`错误码：${p.lastErrorCode}`);
  if (p.lastErrorCode === "EPERM") lines.push("提示：发生权限/操作拒绝，可能与本机文件被占用有关；确切原因需检查，勿无限重启。");
  lines.push("注意：进度是本轮确认数；重启不代表之前已复制的文件丢失。", "本工具只复制当前清单，不删除 TOS、不切换工作台；新增文件需另做增量。");
  return lines.join("\n");
}
