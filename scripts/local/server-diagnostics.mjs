import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, lstatSync, mkdirSync, openSync, readdirSync, renameSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const limits = Object.freeze({ logBytes: 10 * 1024 * 1024, logFiles: 10, reportBytes: 30 * 1024 * 1024, reportFiles: 3, reportAgeMs: 7 * 86400_000 });
const logPattern = /^server-[\w-]+-\d{6,}\.log$/;
const reportPattern = /^report\.\d{8}\.\d{6}\.\d+\.(?:\d+\.)?\d+\.json$/;

function files(directory, pattern) {
  return readdirSync(directory).filter((name) => pattern.test(name)).flatMap((name) => {
    const filePath = path.join(directory, name);
    const stat = lstatSync(filePath);
    return stat.isFile() && !stat.isSymbolicLink() ? [{ filePath, size: stat.size, time: stat.mtimeMs }] : [];
  }).sort((a, b) => b.time - a.time || b.filePath.localeCompare(a.filePath));
}

export function pruneReports(directory, now = Date.now(), policy = limits) {
  let count = 0;
  let bytes = 0;
  for (const file of files(directory, reportPattern)) {
    if (now - file.time > policy.reportAgeMs || count >= policy.reportFiles || bytes + file.size > policy.reportBytes) {
      unlinkSync(file.filePath);
    } else {
      count++;
      bytes += file.size;
    }
  }
}

export function prepareDiagnostics(root) {
  for (const directory of [root, path.join(root, "logs"), path.join(root, "reports")]) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (lstatSync(directory).isSymbolicLink()) throw new Error("Diagnostics directories must not be symbolic links");
    const probe = path.join(directory, `.write-check-${randomUUID()}`);
    writeFileSync(probe, "", { flag: "wx", mode: 0o600 });
    unlinkSync(probe);
  }
  pruneReports(path.join(root, "reports"));
}

export function createLogWriter(directory, policy = limits) {
  const runId = `${new Date().toISOString().replace(/[-:.]/g, "")}-${process.pid}-${randomUUID()}`;
  let part = 0;
  let descriptor;
  let filePath;
  let size = 0;
  function rotate() {
    if (descriptor !== undefined) closeSync(descriptor);
    descriptor = undefined;
    filePath = path.join(directory, `server-${runId}-${String(++part).padStart(6, "0")}.log`);
    descriptor = openSync(filePath, "wx", 0o600);
    size = 0;
    let retained = 1;
    for (const file of files(directory, logPattern)) {
      if (file.filePath === filePath) continue;
      if (file.size > policy.logBytes || retained >= policy.logFiles) unlinkSync(file.filePath);
      else retained++;
    }
  }
  rotate();
  return {
    get filePath() { return filePath; },
    write(stream, value) {
      const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
      const prefix = Buffer.from(`\n[${new Date().toISOString()} ${stream}] `);
      let offset = 0;
      while (offset < buffer.length) {
        if (policy.logBytes - size <= prefix.length) rotate();
        const count = Math.min(buffer.length - offset, policy.logBytes - size - prefix.length);
        // Synchronous bounded writes preserve stream ordering without an unbounded queue.
        for (const chunk of [prefix, buffer.subarray(offset, offset + count)]) {
          let written = 0;
          while (written < chunk.length) written += writeSync(descriptor, chunk, written, chunk.length - written);
          size += chunk.length;
        }
        offset += count;
      }
    },
    close() {
      if (descriptor !== undefined) closeSync(descriptor);
      descriptor = undefined;
    },
  };
}

export function serverArguments(root, projectRoot, host, port) {
  return [
    "--report-on-fatalerror", "--report-uncaught-exception", "--report-exclude-env", "--report-exclude-network",
    `--report-directory=${path.join(root, "reports")}`,
    path.join(projectRoot, "node_modules/next/dist/bin/next"), "start", "-H", host, "-p", String(port),
  ];
}

export async function supervise({ root, args, cwd, env = process.env, policy = limits }) {
  prepareDiagnostics(root);
  const logger = createLogWriter(path.join(root, "logs"), policy);
  const receiptPath = path.join(root, "current-run.json");
  const receipt = {
    startedAt: new Date().toISOString(), commit: env.FLUXPOST_RELEASE_SHA,
    slot: env.FLUXPOST_NEXT_DIST_DIR || ".next", supervisorPid: process.pid,
    status: "starting", logFile: logger.filePath,
  };
  const saveReceipt = () => {
    const temporaryPath = `${receiptPath}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(receipt, null, 2), { mode: 0o600 });
    renameSync(temporaryPath, receiptPath);
  };
  try { saveReceipt(); } catch (error) {
    logger.close();
    throw error;
  }
  let loggingFailed = false;
  function diagnosticFailure(error) {
    if (loggingFailed) return;
    loggingFailed = true;
    receipt.diagnosticError = error.code || "DIAGNOSTICS_IO_FAILURE";
    // The launcher retains this single notice separately. Never kill business work for a log write failure.
    process.stderr.write(`Local diagnostics failed (${receipt.diagnosticError}); server continues.\n`);
    try { saveReceipt(); } catch (receiptError) {
      process.stderr.write(`Diagnostics receipt unavailable (${receiptError.code || "IO_FAILURE"}).\n`);
    }
  }
  function record(stream, buffer) {
    if (loggingFailed) return;
    try {
      logger.write(stream, buffer);
      if (receipt.logFile !== logger.filePath) {
        receipt.logFile = logger.filePath;
        saveReceipt();
      }
    } catch (error) { diagnosticFailure(error); }
  }
  const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (buffer) => record("stdout", buffer));
  child.stderr.on("data", (buffer) => record("stderr", buffer));
  child.once("spawn", () => {
    receipt.serverPid = child.pid;
    receipt.status = "running";
    record("lifecycle", JSON.stringify(receipt));
    try { saveReceipt(); } catch (error) { diagnosticFailure(error); }
  });
  child.once("error", (error) => {
    receipt.spawnError = error.code || "SPAWN_FAILURE";
    record("lifecycle", `Server spawn failed: ${receipt.spawnError}`);
  });
  return await new Promise((resolve) => child.once("close", (code, signal) => {
    Object.assign(receipt, { status: "exited", exitedAt: new Date().toISOString(), exitCode: code, signal });
    record("lifecycle", JSON.stringify(receipt));
    for (const finish of [saveReceipt, () => pruneReports(path.join(root, "reports"), Date.now(), policy), () => logger.close()]) {
      try { finish(); } catch (error) { diagnosticFailure(error); }
    }
    resolve({ code, signal, receipt });
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const root = path.join(projectRoot, "data/local-diagnostics");
  if (process.argv[2] === "--check") {
    prepareDiagnostics(root);
    const writer = createLogWriter(path.join(root, "logs"));
    writer.write("lifecycle", "Diagnostics preflight passed");
    writer.close();
    console.log(`Local diagnostics ready: ${root}`);
  } else {
    const [host, port] = process.argv.slice(2);
    if (!["127.0.0.1", "0.0.0.0"].includes(host) || port !== "3001") throw new Error("Managed diagnostics requires local candidate port 3001");
    const result = await supervise({ root, cwd: projectRoot, args: serverArguments(root, projectRoot, host, port) });
    process.exitCode = result.code ?? 1;
  }
}
