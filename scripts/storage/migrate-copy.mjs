import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { createController, formatStatus } from "./migration-control.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const controller = createController({ projectRoot });
const hints = {
  ControllerBusy: "另一个控制窗口正在操作，或控制锁未正常释放。请检查后再操作，不要盲删锁。",
  ProcessIdentityUnknown: "无法确认记录中的进程身份。为防止误操作，没有启动或停止任何任务。",
  InvalidJobIdentity: "任务编号不合法，请检查迁移记录，不要手动改编号。",
  InvalidStateFile: "迁移状态文件损坏或无法读取，已拒绝操作。",
  ManifestHashMismatch: "原始文件清单与任务编号不一致，已拒绝启动。",
  NoExistingManifest: "没有可继续的迁移记录。此工具不自动生成新清单，请先完成盘点。",
  LifecycleConfirmationRequired: "该任务没有目标生命周期安全确认记录，请先确认目标规则。",
  ConfigFileMissing: "项目缺少 .env.local，请在本机配置，不要把密钥发到聊天里。",
  OssKeyFileMissing: "找不到 OSS 密钥文件。使用项目根目录 aliyun_oss_key.txt，或设置 FLUXPOST_OSS_KEY_FILE。",
  WorkerExitedDuringStartup: "迁移进程启动时退出，请检查 data/oss-migration/ 下本次 console 日志；不要公开日志。",
};
const messages = {
  "already-running": "已有迁移在运行（或正在停止），没有重复启动。",
  "started": "迁移已在后台启动。你可以关闭控制窗口，但请保持电脑开机、联网、不休眠。",
  "starting": "后台进程仍在启动，请用 status 或 watch 查看，不要再开第二个任务。",
  "snapshot-complete": "当前清单已经完成，未重新启动。源端新增文件仍需单独增量，尚未自动切换 OSS。",
  "stop-requested": "已请求安全停止：等待当前文件处理完后退出，不影响工作台。",
  "not-running": "没有在运行的迁移，不需要停止。",
};

function help() {
  console.log(`FluxPost 迁移控制台

在项目目录运行：
  npm run migrate -- copy           打开中文菜单；非交互终端只显示状态
  npm run migrate -- copy status        查看进度（只读）
  npm run migrate -- copy watch         每 2 秒刷新进度（只读）
  npm run migrate -- copy start         确认后启动/继续当前清单
  npm run migrate -- copy stop          确认后安全停止迁移
  npm run migrate -- copy start --yes   跳过确认，明确授权上传及相关流量费用
  npm run migrate -- copy stop --yes    跳过停止确认

watch 中按 Ctrl+C 只关闭进度显示，不停止后台迁移。
start 继续现有清单，保持路径和内容校验；不删除源文件，不切换工作台。
当前清单完成不代表整体迁移完成，之后还需增量和单独确认切换。`);
}

async function confirm(question) {
  if (!process.stdin.isTTY) { console.log("此终端不能询问确认。请在交互终端操作，或明确添加 --yes。"); return false; }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return /^(y|yes|是)$/i.test((await rl.question(question + " [y/N] ")).trim()); }
  finally { rl.close(); }
}

async function watch() {
  let exit = false;
  const stopViewer = () => { exit = true; };
  process.on("SIGINT", stopViewer);
  try {
    console.log("每 2 秒读取本机进度；Ctrl+C 仅退出查看，不停止迁移。\n");
    while (!exit) {
      const snapshot = await controller.status();
      if (process.stdout.isTTY) console.clear();
      console.log(formatStatus(snapshot));
      if (!["running", "starting", "stopping"].includes(snapshot.state)) break;
      await sleep(2000);
    }
  } finally { process.off("SIGINT", stopViewer); }
}

async function command(action, yes = false) {
  if (action === "status") { console.log(formatStatus(await controller.status())); return; }
  if (action === "watch") { await watch(); return; }
  const snapshot = await controller.status();
  if (action === "start" && snapshot.worker) { console.log(messages["already-running"]); console.log(formatStatus(snapshot)); return; }
  const question = action === "start"
    ? "继续当前迁移？会上传到 OSS 并产生请求/流量费用；不切换工作台、不删除 TOS。"
    : "让迁移处理完当前文件后停止？工作台继续运行。";
  if (!yes && !await confirm(question)) { console.log("已取消，未改变迁移状态。"); return; }
  const result = await controller[action]({ confirmed: true });
  console.log(messages[result.result] || result.result);
  if (result.snapshot) console.log(formatStatus(result.snapshot));
}

async function menu() {
  while (true) {
    console.log("\n" + formatStatus(await controller.status()));
    console.log("\n1. 查看一次进度\n2. 持续查看进度\n3. 启动/继续迁移\n4. 安全停止迁移\n0. 退出（后台迁移继续）");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    let answer;
    try { answer = (await rl.question("请选择：")).trim(); } finally { rl.close(); }
    if (answer === "0") break;
    const action = { 1: "status", 2: "watch", 3: "start", 4: "stop" }[answer];
    if (action) await command(action);
    else console.log("请输入 0 到 4。");
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["help", "--help", "-h"].includes(args[0])) { help(); return; }
  if (!args.length) { if (process.stdin.isTTY) await menu(); else await command("status"); return; }
  const [action, flag] = args;
  if (!["status", "watch", "start", "stop"].includes(action) || args.length > 2 ||
      (flag && (flag !== "--yes" || !["start", "stop"].includes(action)))) {
    help(); process.exitCode = 1; return;
  }
  await command(action, flag === "--yes");
}

main().catch(error => {
  const code = typeof error.code === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(error.code) ? error.code : "ControlError";
  console.error(`操作未完成：${hints[code] || "请检查本机记录和权限；没有强制停止或重复启动迁移。"} (${code})`);
  process.exitCode = 1;
});
