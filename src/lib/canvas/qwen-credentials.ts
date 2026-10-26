import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, linkSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { compareAndSetAppMetaValue, getCanvasRunFromDb, getCanvasWorkflowFromDb, readAppMetaValue, writeAppMetaValue } from "../database";
import { canAccessWorkspaceOwner, type WorkspaceAccessActor } from "../workspace-ownership";
import { validateQwenEndpoint } from "../qwen-image-contract";
import type { CanvasNode } from "./types";

export class QwenCredentialError extends Error {}
export type QwenCredentialTarget = { workflowId: string; nodeId: string; regionId?: string };
const masterFingerprintKey = "canvas-qwen-master-fingerprint-v1";

async function masterKey() {
  const fingerprint = await readAppMetaValue(masterFingerprintKey);
  const root = path.resolve(process.cwd(), "data", "canvas-secrets");
  const file = path.join(root, "qwen-master.key");
  if (!existsSync(file)) {
    if (fingerprint) throw new QwenCredentialError("Qwen: 服务端密钥文件丢失，请恢复运行数据备份。");
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const temporary = path.join(root, `${randomUUID()}.tmp`);
    writeFileSync(temporary, randomBytes(32), { flag: "wx", mode: 0o600 });
    try {
      // A hard link publishes all 32 bytes atomically; competing workers never replace the key.
      try { linkSync(temporary, file); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    } finally { unlinkSync(temporary); }
  }
  const key = readFileSync(file);
  if (key.length !== 32) throw new QwenCredentialError("Qwen: 服务端密钥文件损坏，请恢复备份。");
  const hash = createHash("sha256").update(key).digest("hex");
  if (!fingerprint) await compareAndSetAppMetaValue(masterFingerprintKey, undefined, hash);
  if ((await readAppMetaValue(masterFingerprintKey)) !== hash) throw new QwenCredentialError("Qwen: 服务端密钥与数据库不匹配，请恢复对应备份。");
  return key;
}

async function targetRecord(target: QwenCredentialTarget, account: WorkspaceAccessActor) {
  const workflow = await getCanvasWorkflowFromDb(target.workflowId);
  if (!workflow || !canAccessWorkspaceOwner(account, workflow.ownerUserId)) throw new QwenCredentialError("Qwen: 工作流不存在或无权访问。");
  const nodes = target.regionId
    ? workflow.graph.nodes.find((node) => node.id === target.regionId && node.type === "utility.image-iterate")?.iteration?.graph.nodes
    : workflow.graph.nodes;
  const node = nodes?.find((entry) => entry.id === target.nodeId && entry.type === "model.qwen-image");
  if (!node) throw new QwenCredentialError("Qwen: 请先保存当前节点所在的工作流。");
  const endpoint = validateQwenEndpoint(node.config.endpoint);
  const id = createHash("sha256").update(JSON.stringify([workflow.ownerUserId, workflow.id, target.regionId || "", node.id])).digest("hex");
  return { key: `canvas-qwen-credential-v1:${id}`, endpoint };
}

type Envelope = { endpoint: string; iv: string; tag: string; ciphertext: string };
function decodeEnvelope(value: string | undefined): Envelope | undefined {
  if (!value) return undefined;
  let entry: unknown;
  try { entry = JSON.parse(value); }
  catch { throw new QwenCredentialError("Qwen: 保存的密钥记录损坏，请重新保存密钥。"); }
  if (!entry || typeof entry !== "object" || !["endpoint", "iv", "tag", "ciphertext"].every((key) => typeof (entry as Record<string, unknown>)[key] === "string")) {
    throw new QwenCredentialError("Qwen: 保存的密钥记录损坏，请重新保存密钥。");
  }
  return entry as Envelope;
}

export async function qwenCredentialStatus(target: QwenCredentialTarget, account: WorkspaceAccessActor) {
  const record = await targetRecord(target, account);
  const stored = decodeEnvelope(await readAppMetaValue(record.key));
  return { configured: Boolean(stored && stored.endpoint === record.endpoint) };
}

export async function saveQwenCredential(target: QwenCredentialTarget, account: WorkspaceAccessActor, value: unknown, expectedEndpoint: unknown) {
  const record = await targetRecord(target, account);
  if (validateQwenEndpoint(expectedEndpoint) !== record.endpoint) throw new QwenCredentialError("Qwen: 请求地址已改变，请保存工作流后重试。");
  if (typeof value !== "string" || !value.trim() || value.length > 4096 || /[\r\n\x00-\x1f]/.test(value)) throw new QwenCredentialError("Qwen: API Key 无效。");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", await masterKey(), iv);
  cipher.setAAD(Buffer.from(`${record.key}\n${record.endpoint}`));
  const ciphertext = Buffer.concat([cipher.update(value.trim(), "utf8"), cipher.final()]);
  await writeAppMetaValue(record.key, JSON.stringify({ endpoint: record.endpoint, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") }));
}

export async function removeQwenCredential(target: QwenCredentialTarget, account: WorkspaceAccessActor) {
  const record = await targetRecord(target, account);
  await writeAppMetaValue(record.key, "");
}

export async function qwenCredentialForRun(runId: string, node: CanvasNode, account: WorkspaceAccessActor) {
  const run = await getCanvasRunFromDb(runId);
  if (!run || run.ownerUserId !== account.id || !run.graphSnapshot.nodes.some((entry) => entry.id === node.id && entry.type === "model.qwen-image" && entry.config.endpoint === node.config.endpoint)) {
    throw new QwenCredentialError("Qwen: 无权读取此次运行的节点密钥。");
  }
  const record = await targetRecord({ workflowId: run.workflowId, nodeId: node.id, regionId: run.iterationContext?.regionNodeId }, account);
  const endpoint = validateQwenEndpoint(node.config.endpoint);
  const stored = decodeEnvelope(await readAppMetaValue(record.key));
  if (!stored || stored.endpoint !== endpoint || record.endpoint !== endpoint) throw new QwenCredentialError("Qwen: 请在节点中保存当前请求地址对应的 API Key。");
  const decipher = createDecipheriv("aes-256-gcm", await masterKey(), Buffer.from(stored.iv, "base64"));
  decipher.setAAD(Buffer.from(`${record.key}\n${endpoint}`));
  decipher.setAuthTag(Buffer.from(stored.tag, "base64"));
  try {
    const apiKey = Buffer.concat([decipher.update(Buffer.from(stored.ciphertext, "base64")), decipher.final()]).toString("utf8");
    return { endpoint, apiKey };
  } catch { throw new QwenCredentialError("Qwen: 密钥无法解密，请重新保存。"); }
}
