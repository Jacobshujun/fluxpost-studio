export async function register() {
  if (
    process.env.NEXT_RUNTIME !== "nodejs"
    || process.env.NEXT_PHASE === "phase-production-build"
    || process.env.FLUXPOST_DISABLE_BACKGROUND_WORKERS === "1"
  ) return;

  const [{ ensureCanvasRunWorker }, { kickCanvasSchedulerWorker }, { ensureOriginalBatchWorker }] = await Promise.all([
    import("@/lib/canvas/runs"),
    import("@/lib/canvas/scheduler"),
    import("@/lib/original-batches"),
  ]);
  kickCanvasSchedulerWorker();
  ensureCanvasRunWorker();
  ensureOriginalBatchWorker();
}
