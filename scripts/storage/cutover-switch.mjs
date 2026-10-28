import { readFile, writeFile, rename, realpath } from "node:fs/promises";
import { createConnection } from "node:net";
import { createHash } from "node:crypto";
import { parseEnv } from "node:util";
import path from "node:path";
import { loadCutoverConfig } from "./cutover-config.mjs";

process.on("SIGINT", () => {});
async function main() {
  if (process.argv[2] !== "--apply") throw new Error("ExplicitSwitchRequired");
  const config = await loadCutoverConfig();
  const receipt = JSON.parse(await readFile(`${config.frozenBackupDir}/rewrite-summary.json`, "utf8"));
  if (receipt.status !== "committed") throw new Error("CommittedRewriteRequired");
  const listening = await new Promise(resolve => {
    const socket = createConnection({ host: "127.0.0.1", port: 3001 });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", error => { socket.destroy(); resolve(error.code !== "ECONNREFUSED"); });
    socket.setTimeout(1500, () => { socket.destroy(); resolve(true); });
  });
  if (listening) throw new Error("AppMustBeStopped");
  const file = path.resolve(process.env.FLUXPOST_CONFIG_FILE || ".env.local");
  if (await realpath(file) !== await realpath(".env.local")) throw new Error("ExternalConfigNeedsReview");
  const original = await readFile(file, "utf8");
  if (original !== await readFile(`${config.frozenBackupDir}/env.local.backup`, "utf8")) throw new Error("ConfigChangedAfterBackup");
  const keyText = await readFile(process.env.FLUXPOST_OSS_KEY_FILE || "aliyun_oss_key.txt", "utf8");
  const credential = label => {
    const match = keyText.match(new RegExp(`^\\s*${label}\\s*[:=：]\\s*(\\S+)\\s*$`, "im"));
    if (!match) throw new Error("CredentialFormatUnsupported");
    return match[1];
  };
  const values = { RUNTIME_STORAGE_PROVIDER: "oss", OSS_ENABLED: "true", OSS_BUCKET: "xpai-imc",
    OSS_ENDPOINT: "https://oss-cn-guangzhou.aliyuncs.com", OSS_REGION: "oss-cn-guangzhou",
    OSS_PUBLIC_BASE_URL: "https://xpai-imc.oss-cn-guangzhou.aliyuncs.com", OSS_OBJECT_PREFIX: "fluxpost/flux-lightmoment",
    OSS_ACCESS_KEY_ID: credential("AccessKey\\s*Id"), OSS_ACCESS_KEY_SECRET: credential("AccessKey\\s*Secret") };
  const newline = original.includes("\r\n") ? "\r\n" : "\n";
  const lines = original.split(/\r?\n/).filter(line => {
    const key = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=/)?.[1];
    return !Object.hasOwn(values, key);
  });
  const updated = lines.join(newline).replace(/\s*$/, newline) + Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(newline) + newline;
  const parsed = parseEnv(updated);
  for (const [key, value] of Object.entries(values)) if (parsed[key] !== value) throw new Error("ConfigRoundTripFailed");
  // Write only a non-secret receipt outside the already secured backup directory.
  const hash = value => createHash("sha256").update(value).digest("hex");
  await writeFile(`${config.frozenBackupDir}/config-switch-intent.json`, JSON.stringify({ before: hash(original), after: hash(updated), at: new Date().toISOString() }), { flag: "wx", mode: 0o600 });
  // Preserve the existing file ACL; backup permits exact recovery on write failure.
  await writeFile(file, updated);
  if (hash(await readFile(file, "utf8")) !== hash(updated)) throw new Error("ConfigWriteVerificationFailed");
  await rename(`${config.frozenBackupDir}/config-switch-intent.json`, `${config.frozenBackupDir}/config-switch.json`);
  console.log(JSON.stringify({ provider: "oss", configurationVerified: true }));
}
main().catch(error => { console.error(JSON.stringify({ code: /^[A-Za-z]+$/.test(error.message) ? error.message : error.code || error.name })); process.exitCode = 1; });
