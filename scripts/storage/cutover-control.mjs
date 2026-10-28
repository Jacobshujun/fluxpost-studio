import { access, mkdir, open, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadCutoverConfig } from "./cutover-config.mjs";

const execute = promisify(execFile);
const fail = code => Object.assign(new Error(code), { code });
const codeOf = error => /^[A-Za-z0-9_-]{1,80}$/.test(error.code || "") ? error.code : "CutoverFailed";
const stageNames = {
  preflight: "检查运行任务", freeze: "暂停本地应用", backup: "最终数据库备份",
  inventory: "刷新文件清单", delta: "补搬新增文件", verify: "核对最终清单",
  references: "替换已验证地址", config: "切换 OSS 配置", activate: "构建并启动本地应用", acceptance: "启动后验收",
};
export const cutoverStages = Object.keys(stageNames);
async function optionalJson(file) {
  try { return JSON.parse((await readFile(file, "utf8")).replace(/^\uFEFF/, "")); }
  catch (error) { if (error.code === "ENOENT") return undefined; throw fail("InvalidCutoverReceipt"); }
}
async function exists(file) { try { await access(file); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } }
export function safeProgress(line) {
  let value;
  try { value = JSON.parse(line); } catch { return undefined; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const output = {};
  for (const key of ["verified", "total", "bytes", "deltaObjects", "deltaBytes", "sourceCount", "targetCount", "changedRows", "changedCells", "uploaded", "failed", "mediaReads"]) {
    if (Number.isSafeInteger(value[key]) && value[key] >= 0) output[key] = value[key];
  }
  if (typeof value.table === "string" && /^[a-z_]{1,60}$/.test(value.table)) output.table = value.table;
  for (const key of ["code", "reason"]) if (typeof value[key] === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value[key])) output[key] = value[key];
  return Object.keys(output).length ? output : undefined;
}

async function verifyInventory(root, config, requireAligned = true) {
  const inventory = await optionalJson(path.join(root, config.evidenceDir, "inventory.json"));
  if (!inventory || Date.now() - Date.parse(inventory.end) > 30 * 60_000 || !Number.isFinite(Date.parse(inventory.end))) throw fail("FreshInventoryRequired");
  const source = new Map(inventory.source.map(item => [item.key, item]));
  const target = new Map(inventory.target.filter(item => !item.key.startsWith("fluxpost/flux-lightmoment/aliyun_import_report/")).map(item => [item.key, item]));
  if (source.size !== inventory.source.length) throw fail("DuplicateInventoryKeys");
  const summary = { source: source.size, target_media: target.size,
    source_missing_target: [...source.keys()].filter(key => !target.has(key)).length,
    target_extra_media: [...target.keys()].filter(key => !source.has(key)).length,
    size_mismatch: [...source].filter(([key, item]) => target.has(key) && target.get(key).size !== item.size).length,
    inventoryAt: inventory.end, writeFrozen: requireAligned };
  await writeFile(path.join(root, config.evidenceDir, "post-delta-summary.json"), JSON.stringify(summary, null, 2));
  if (requireAligned && (summary.source_missing_target || summary.target_extra_media || summary.size_mismatch)) throw fail("InventoryNotAligned");
  return summary;
}

export function createCutoverController({ root, runStep: injectedRunStep, inspectApp: injectedInspectApp, checkClean: injectedClean, now = () => new Date().toISOString() }) {
  const stateDir = path.join(root, "data/oss-cutover");
  const stateFile = path.join(stateDir, "state.json");
  const lockFile = path.join(stateDir, "operation.lock");
  const inspectApp = injectedInspectApp || (async () => {
    try {
      const response = await fetch("http://127.0.0.1:3001/api/version", { signal: AbortSignal.timeout(2000) });
      if (!response.ok) return { status: "unknown" };
      const body = await response.json();
      return { status: body.mode === "candidate" && /^[a-f0-9]{40}$/.test(body.commit) ? "running" : "unknown", commit: /^[a-f0-9]{40}$/.test(body.commit) ? body.commit : undefined };
    } catch { return { status: "unreachable" }; }
  });
  const clean = injectedClean || (async () => {
    const { stdout } = await execute("git", ["status", "--porcelain"], { cwd: root, windowsHide: true });
    if (stdout.trim()) throw fail("CleanWorktreeRequired");
    const { stdout: sha } = await execute("git", ["rev-parse", "HEAD"], { cwd: root, windowsHide: true });
    return sha.trim();
  });
  async function persist(state) {
    state.updatedAt = now();
    await writeFile(`${stateFile}.tmp`, JSON.stringify(state, null, 2), { mode: 0o600 });
    await rename(`${stateFile}.tmp`, stateFile);
  }
  async function child(command, args, progress) {
    await new Promise((resolve, reject) => {
      const worker = spawn(command, args, { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: "1" } });
      let pending = Promise.resolve(), progressError;
      const reader = () => {
        let buffer = "";
        return chunk => {
          buffer += chunk.toString("utf8");
          if (buffer.length > 1024 * 1024) { buffer = ""; return; }
          const lines = buffer.split(/\r?\n/); buffer = lines.pop();
          for (const line of lines) { const safe = safeProgress(line); if (safe) pending = pending.then(() => { if (!progressError) return progress(safe); }).catch(error => { progressError = error; }); }
        };
      };
      worker.stdout.on("data", reader()); worker.stderr.on("data", reader());
      worker.once("error", () => reject(fail("StepLaunchFailed")));
      worker.once("close", code => { pending.then(() => progressError ? reject(progressError) : code === 0 ? resolve() : reject(fail("StepFailed"))).catch(reject); });
    });
  }
  async function defaultRunStep(stage, config, progress) {
    const node = (file, args = []) => child(process.execPath, ["--env-file=.env.local", `scripts/storage/${file}`, ...args], progress);
    const powershell = args => child("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", ...args], progress);
    if (stage === "preflight") return node("cutover-preflight.mjs");
    if (stage === "freeze") return powershell(["-File", "scripts/storage/cutover-local.ps1", "-Action", "freeze"]);
    if (stage === "backup") { await powershell(["-File", "scripts/storage/cutover-local.ps1", "-Action", "prepare-backup"]); return node("cutover-backup.mjs", ["--frozen"]); }
    if (stage === "inventory") { await node("cutover-inspect.mjs", ["--inventory"]); return verifyInventory(root, config, false); }
    if (stage === "delta") return node("cutover-delta.mjs", ["--apply-delta"]);
    if (stage === "verify") { await node("cutover-inspect.mjs", ["--inventory"]); return verifyInventory(root, config); }
    if (stage === "references") return node("cutover-references.mjs", ["--apply"]);
    if (stage === "config") return node("cutover-switch.mjs", ["--apply"]);
    if (stage === "activate") { await clean(); return powershell(["-File", "scripts/local/restart.ps1", "-HostName", "0.0.0.0"]); }
    if (stage === "acceptance") return node("cutover-accept.mjs", ["--accept"]);
    throw fail("UnknownCutoverStep");
  }
  const runStep = injectedRunStep || defaultRunStep;
  async function status() {
    const config = await loadCutoverConfig(root);
    const read = (dir, name) => optionalJson(path.join(root, dir, name));
    const state = await optionalJson(stateFile);
    const app = await inspectApp();
    const envFile = await readFile(path.join(root, ".env.local"), "utf8").catch(error => { if (error.code === "ENOENT") return ""; throw error; });
    const provider = envFile.match(/^\s*RUNTIME_STORAGE_PROVIDER\s*=\s*["']?(tos|oss)["']?\s*$/m)?.[1] || "unconfirmed";
    const configSource = provider === "unconfirmed" ? "未显式设置，应用默认 TOS" : provider.toUpperCase();
    let pendingFiles = 0;
    try { pendingFiles = (await readdir(path.join(root, "data/tos-pending"), { recursive: true, withFileTypes: true })).filter(entry => entry.isFile()).length; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    return { config, state, locked: await exists(lockFile), app, configProvider: configSource, pendingFiles,
      inventory: await read(config.evidenceDir, "post-delta-summary.json"),
      sample: await read(config.evidenceDir, "browser-results.json"),
      backup: await read(config.onlineBackupDir, "receipt.json"),
      dryRun: await read(config.evidenceDir, "rewrite-dry-run.json"),
      finalBackup: await read(config.frozenBackupDir, "receipt.json"),
      rewrite: await read(config.frozenBackupDir, "rewrite-summary.json"),
      acceptance: await read(config.evidenceDir, "cutover-acceptance.json") };
  }
  async function operation(kind, { confirmed = false, onProgress = () => {}, shouldStop = () => false } = {}) {
    if (!confirmed) return { result: "confirmation-required" };
    const config = await loadCutoverConfig(root);
    await mkdir(stateDir, { recursive: true });
    let lock;
    try { lock = await open(lockFile, "wx", 0o600); } catch (error) { if (error.code === "EEXIST") throw fail("CutoverBusyOrInterrupted"); throw error; }
    let state;
    try {
      await lock.writeFile(JSON.stringify({ pid: process.pid, kind, startedAt: now() })); await lock.sync();
      const previous = await optionalJson(stateFile);
      if (kind === "continue" && previous?.kind === "continue") {
        if (previous.status === "completed") return { result: "already-completed" };
        throw fail("InterruptedCutoverNeedsReview");
      }
      if (kind === "refresh" && previous?.kind === "continue" && previous.status !== "completed") throw fail("InterruptedCutoverNeedsReview");
      let commit;
      if (kind === "continue") {
        if (process.platform !== "win32" && !injectedRunStep) throw fail("WindowsCutoverRequired");
        commit = await clean();
        const app = await inspectApp();
        if (app.status !== "running") throw fail("RunningCandidateRequired");
        if (await exists(path.join(root, config.frozenBackupDir, "runtime.dump"))) throw fail("PriorFrozenBackupNeedsReview");
        if (await exists(path.join(root, "data/oss-migration/active.lock"))) throw fail("CopyWorkerLockNeedsReview");
        for (const file of ["reported.json", "inventory-stage-a.json", "core-data-before.json"]) {
          if (!await exists(path.join(root, config.evidenceDir, file))) throw fail("HistoricalEvidenceRequired");
        }
        if (!injectedRunStep) {
          for (const file of ["pg_dump.exe", "pg_restore.exe"]) if (!await exists(path.join("D:/Program Files/PostgreSQL/18/bin", file))) throw fail("PostgresToolsRequired");
        }
        // Verify effective local configuration location without revealing it.
        if (!injectedRunStep) {
          const { stdout } = await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "[Environment]::GetEnvironmentVariable('FLUXPOST_LOCAL_CONFIG_FILE','User')"], { windowsHide: true });
          const configured = (process.env.FLUXPOST_CONFIG_FILE || stdout.trim());
          if (configured && path.resolve(configured).toLowerCase() !== path.join(root, ".env.local").toLowerCase()) throw fail("ExternalConfigNeedsReview");
        }
      }
      state = { version: 1, kind, status: "running", startedAt: now(), commit, steps: [], current: null };
      await persist(state);
      const stages = kind === "refresh" ? ["preflight", "inventory"] : cutoverStages;
      for (const stage of stages) {
        if (shouldStop()) { state.status = "stopped"; await persist(state); return { result: "stopped" }; }
        state.current = stage; state.progress = {}; state.phaseStartedAt = now(); await persist(state);
        onProgress({ type: "start", stage, state });
        const progress = async value => { state.progress = value; await persist(state); onProgress({ type: "progress", stage, value, state }); };
        if (kind === "continue" && stage === "activate" && await clean() !== commit) throw fail("CandidateCommitChanged");
        await runStep(stage, config, progress);
        state.steps.push({ stage, completedAt: now() }); await persist(state); onProgress({ type: "done", stage, state });
      }
      state.status = "completed"; state.current = null; state.finishedAt = now(); await persist(state);
      return { result: kind === "refresh" ? "refreshed" : "completed" };
    } catch (error) {
      if (state) { state.status = "failed"; state.error = codeOf(error); await persist(state); }
      throw error;
    } finally { await lock.close(); await unlink(lockFile); }
  }
  return { status, refresh: options => operation("refresh", options), continue: options => operation("continue", options),
    logs: async () => { const state = await optionalJson(stateFile); return state ? { kind: state.kind, status: state.status, current: state.current, startedAt: state.startedAt, updatedAt: state.updatedAt, steps: state.steps, progress: state.progress, error: state.error } : undefined; } };
}

export function formatCutoverStatus(snapshot) {
  const lines = ["FluxPost 迁移助手", "", `本地应用：${snapshot.app.status === "running" ? "正在运行" : snapshot.app.status === "unreachable" ? "无法连接（不等于确认已停服）" : "状态待确认"}`,
    `磁盘配置：${snapshot.configProvider}（运行中的配置以切换后验收为准）`];
  const stamp = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "时间未知";
  const inventory = snapshot.inventory;
  const aligned = inventory && inventory.source_missing_target === 0 && inventory.target_extra_media === 0 && inventory.size_mismatch === 0;
  lines.push(`${aligned ? "[已核对]" : "[待核对]"} 文件清单${inventory ? `：${inventory.source} / ${inventory.target_media} 个；${stamp(inventory.inventoryAt)}` : "：没有证据"}`);
  const images = snapshot.sample?.results;
  lines.push(`${images?.length && images.every(item => item.ok) ? "[通过]" : "[待检查]"} 图片视频抽查${images ? `：${images.filter(item => item.ok).length}/${images.length}` : ""}`);
  lines.push(`${snapshot.backup?.archiveDecodePassed ? "[已完成]" : "[待备份]"} 在线数据库备份${snapshot.backup ? `：${(snapshot.backup.bytes / 1e6).toFixed(1)} MB；${stamp(snapshot.backup.snapshotAt)}` : ""}`);
  lines.push(`${snapshot.dryRun?.status === "dry-run" ? "[已试运行]" : "[待检查]"} 地址替换${snapshot.dryRun ? `：${snapshot.dryRun.changedRows} 条记录；${stamp(snapshot.dryRun.finishedAt)}` : ""}`);
  lines.push(`${snapshot.finalBackup?.cutoverFrozen ? "[已完成]" : "[待执行]"} 停服后的最终备份`);
  lines.push(`${snapshot.rewrite?.status === "committed" ? "[已提交事务]" : "[待执行]"} 正式数据库地址替换`);
  lines.push(`${snapshot.acceptance?.ok ? "[验收通过]" : "[待验收]"} OSS 配置、启动与应用检查`);
  if (snapshot.state) {
    const state = snapshot.state;
    lines.push("", `操作状态：${state.status}；阶段：${stageNames[state.current] || "无活动阶段"}`,
      `最后更新：${stamp(state.updatedAt)}；已完成阶段：${state.steps?.length || 0}`);
    if (state.progress && Object.keys(state.progress).length) lines.push(`当前计数：${JSON.stringify(state.progress)}`);
    if (state.error) lines.push(`错误码：${state.error}`);
  }
  if (snapshot.locked) lines.push("存在操作锁：可能正在执行或曾被中断。不要重复启动或手动删锁。");
  if (snapshot.pendingFiles) lines.push(`另有 ${snapshot.pendingFiles} 个历史 TOS 待上传本地文件：保留原样，不包含在云端迁移完成数内。`);
  lines.push("", `在线备份位置：${snapshot.config.onlineBackupDir}`, `最终备份位置：${snapshot.config.frozenBackupDir}`,
    "以上是带时间的检查记录，不是实时云端同步；不会伪造总百分比。", "备份只验证过可解码，不等于完整恢复演练。", "TOS 保留；历史缺失地址不改；退出查看不代表撤销迁移。");
  return lines.join("\n");
}

export { stageNames };
