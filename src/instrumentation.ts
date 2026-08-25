export async function register() {
  if (
    process.env.NEXT_RUNTIME !== "nodejs"
    || process.env.NEXT_PHASE === "phase-production-build"
    || process.env.FLUXPOST_DISABLE_BACKGROUND_WORKERS === "1"
  ) return;

  const [
    { ensureCanvasRunWorker },
    { kickCanvasSchedulerWorker },
    { ensureOriginalBatchWorker },
    { ensureFeishuPublishQueueWorker },
    { checkImageTransportHealth },
    { recordExecutionLog },
  ] = await Promise.all([
    import("@/lib/canvas/runs"),
    import("@/lib/canvas/scheduler"),
    import("@/lib/original-batches"),
    import("@/lib/feishu-publish-queue"),
    import("@/lib/image-transport"),
    import("@/lib/activity-log"),
  ]);
  void checkImageTransportHealth().then((health) => recordExecutionLog({
    scope: "openai/image",
    action: "Image transport startup check",
    status: health.ok ? "success" : "error",
    message: health.ok ? "图片代理与图片通道可用。" : "图片代理或图片通道不可用。",
    durationMs: health.durationMs,
    details: {
      proxyConfigured: health.proxy.configured,
      proxyReachable: health.proxy.reachable,
      primaryReachable: health.primary.reachable,
      backupConfigured: health.backup.configured,
      backupReachable: health.backup.reachable,
      duplicateOrigins: health.duplicateOrigins,
    },
  })).catch((error) => console.warn("Image transport startup check failed:", error instanceof Error ? error.message : "unknown error"));
  kickCanvasSchedulerWorker();
  ensureCanvasRunWorker();
  ensureOriginalBatchWorker();
  ensureFeishuPublishQueueWorker();
}
