import { createInterface } from "node:readline/promises";
import { createCutoverController, formatCutoverStatus, stageNames } from "./cutover-control.mjs";
import { projectRoot } from "./cutover-config.mjs";

const controller = createCutoverController({ root: projectRoot });
const hints = {
  ENOENT: "缺少本地配置或证据。需要先准备 data/oss-cutover/config.json；不会猜测路径。",
  CleanWorktreeRequired: "有尚未提交的代码或文档。先检查并提交，再切换；密钥和数据不能提交。",
  CutoverBusyOrInterrupted: "已有操作锁。可能正在执行或之前异常退出，请先查看记录，不要直接删锁。",
  InterruptedCutoverNeedsReview: "上一次切换未完整结束。先检查数据库事务、备份和服务状态，不会自动重复执行。",
  PriorFrozenBackupNeedsReview: "最终备份目录已有备份，先核实上一轮操作；不会覆盖它。",
  ExternalConfigNeedsReview: "应用使用外部配置文件，需要核对配置位置后才能切换。",
  RunningCandidateRequired: "未确认 3001 正在运行版本化应用，拒绝停止未知服务。",
  StepFailed: "当前步骤失败，后续步骤未执行。查看阶段和错误码；如已停服，需先处理恢复。",
  InvalidCutoverReceipt: "进度文件损坏或格式不正确，不能据此继续。",
  HistoricalCopyDisabled: "旧的 start/stop 不再默认启动文件搬运。请使用菜单；旧工具明确放在 copy 子命令中。",
};

function help() {
  console.log(`FluxPost 迁移助手

  npm run migrate                 打开中文菜单（非交互终端只显示状态）
  npm run migrate -- status       查看带时间的进度，不读取云端
  npm run migrate -- refresh      确认后只读刷新云端清单和运行任务
  npm run migrate -- continue     确认后执行本地切换
  npm run migrate -- logs         查看阶段、计数与安全错误码
  npm run migrate -- help         帮助

refresh --yes / continue --yes 仅供明确授权的自动化。
continue 会停服、备份、补搬、改地址与配置、构建启动，并创建/清理两个极小的 OSS 验收对象。
不会调用付费模型、写入飞书、删除 TOS，也不会强制覆盖已有素材。
Ctrl+C 请求在当前步骤结束后停止，不会撤销已经完成的步骤。
只有原来的本机搬运需要 npm run migrate -- copy help；不要用它重搬整批文件。`);
}

async function confirm(question) {
  if (!process.stdin.isTTY) { console.log("非交互终端没有执行写操作；明确授权的自动化需添加 --yes。"); return false; }
  const input = createInterface({ input: process.stdin, output: process.stdout });
  try { return /^(y|yes|是)$/i.test((await input.question(`${question} [y/N] `)).trim()); }
  finally { input.close(); }
}

async function action(command, yes = false) {
  if (command === "status") { console.log(formatCutoverStatus(await controller.status())); return; }
  if (command === "logs") {
    const logs = await controller.logs();
    console.log(logs ? JSON.stringify(logs, null, 2) : "还没有工具执行记录；历史验收结果请看 status。");
    console.log("完整备份和原始回退凭据只保存在本机，不要公开。"); return;
  }
  if (command === "continue" && (process.stdin.isTTY || yes)) console.log(formatCutoverStatus(await controller.status()));
  const question = command === "refresh"
    ? "只读扫描 TOS/OSS 清单和本地任务，会产生少量云端读取请求。继续吗？"
    : "将暂停 3001、最终备份、补搬缺失文件、改已验证地址并切换 OSS，最后启动验收。确认此时无人使用应用，并允许极小的 OSS 上传/清理测试吗？";
  if (!yes && !await confirm(question)) { console.log("已取消，未启动操作。"); return; }
  let stop = false;
  let stage, stageStarted;
  const stopped = () => { stop = true; console.log("\n已请求停止：等待当前步骤安全结束。已提交的更改不会自动撤销。"); };
  process.on("SIGINT", stopped);
  const timer = setInterval(() => {
    if (stage) console.log(`  ${stageNames[stage]}仍在执行，已用 ${Math.floor((Date.now() - stageStarted) / 1000)} 秒；没有新计数不代表卡住。`);
  }, 15000);
  timer.unref();
  try {
    const result = await controller[command]({ confirmed: true, shouldStop: () => stop, onProgress: event => {
      if (event.type === "start") { stage = event.stage; stageStarted = Date.now(); console.log(`\n[开始] ${stageNames[stage]}`); }
      else if (event.type === "done") { console.log(`[完成] ${stageNames[event.stage]}，${Math.floor((Date.now() - stageStarted) / 1000)} 秒`); stage = undefined; }
      else console.log(`  ${JSON.stringify(event.value)}`);
    } });
    console.log({ completed: "本地切换与验收完成。TOS 仍保留。", refreshed: "只读刷新完成，尚未切换。", stopped: "已在步骤边界停止；请查看记录确认应用是否已暂停。", "already-completed": "已有完成记录，未重复执行。" }[result.result] || result.result);
  } finally { clearInterval(timer); process.off("SIGINT", stopped); }
}

async function menu() {
  while (true) {
    await action("status");
    console.log("\n1. 刷新检查结果（云端只读）\n2. 继续切换（需要确认）\n3. 查看执行记录\n0. 退出");
    const input = createInterface({ input: process.stdin, output: process.stdout });
    let selection;
    try { selection = (await input.question("请选择：")).trim(); } finally { input.close(); }
    if (selection === "0") return;
    const command = { 1: "refresh", 2: "continue", 3: "logs" }[selection];
    if (command) await action(command); else console.log("请输入 0 到 3。");
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "copy") {
    process.argv.splice(2, 1);
    console.log("旧本机搬运控制台：不负责应用切换。已完成云端迁移时不要重新 start。");
    await import("./migrate-copy.mjs"); return;
  }
  if (args.length === 1 && ["help", "--help", "-h"].includes(args[0])) { help(); return; }
  if (!args.length) { if (process.stdin.isTTY) await menu(); else await action("status"); return; }
  if (["start", "stop", "watch"].includes(args[0])) throw Object.assign(new Error(), { code: "HistoricalCopyDisabled" });
  if (!["status", "logs", "refresh", "continue"].includes(args[0]) || args.length > 2 ||
      (args[1] && (args[1] !== "--yes" || !["refresh", "continue"].includes(args[0])))) { help(); process.exitCode = 1; return; }
  await action(args[0], args[1] === "--yes");
}
main().catch(error => {
  const code = /^[A-Za-z0-9_-]{1,80}$/.test(error.code || "") ? error.code : "CutoverError";
  console.error(`操作未完成：${hints[code] || "请查看本地记录；没有自动重试。"} (${code})`);
  process.exitCode = 1;
});
