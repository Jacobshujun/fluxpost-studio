import { createHash } from "node:crypto";

export type FeishuCliIdentityConfig = {
  appId: string;
  appSecret: string;
  brand: "feishu" | "lark";
};

type FeishuCliInitializer = (args: string[], input: string) => Promise<{ stdout: string; stderr: string }>;

let initializedCredentialFingerprint = "";
let initializationQueue: Promise<void> = Promise.resolve();

export function ensureFeishuCliIdentity(config: FeishuCliIdentityConfig, initialize: FeishuCliInitializer) {
  const appId = config.appId.trim();
  const appSecret = config.appSecret.trim();
  const brand = config.brand === "lark" ? "lark" : "feishu";
  if (!appId || !appSecret) {
    return Promise.reject(new Error("FEISHU_APP_ID or FEISHU_APP_SECRET is not configured."));
  }

  const fingerprint = credentialFingerprint(appId, appSecret, brand);
  const task = initializationQueue.then(async () => {
    if (initializedCredentialFingerprint === fingerprint) return;
    await initialize(
      ["config", "init", "--app-id", appId, "--app-secret-stdin", "--brand", brand],
      `${appSecret}\n`,
    );
    initializedCredentialFingerprint = fingerprint;
  });
  initializationQueue = task.catch(() => undefined);
  return task;
}

export function resetFeishuCliIdentityCacheForTests() {
  initializedCredentialFingerprint = "";
  initializationQueue = Promise.resolve();
}

function credentialFingerprint(appId: string, appSecret: string, brand: string) {
  return createHash("sha256").update(appId).update("\0").update(appSecret).update("\0").update(brand).digest("hex");
}
