import type { CanvasGraph, CanvasNodeRun, CanvasScheduleIterationSummary } from "./types";

export function canvasScheduleIterationSummary(graph: CanvasGraph, nodeRuns: CanvasNodeRun[]): CanvasScheduleIterationSummary[] {
  const latest = new Map<string, CanvasNodeRun>();
  for (const attempt of nodeRuns) {
    if (!latest.has(attempt.nodeId) || latest.get(attempt.nodeId)!.attempt < attempt.attempt) latest.set(attempt.nodeId, attempt);
  }
  return [...latest.values()].flatMap((attempt) => {
    const metadata = attempt.internalMetadata?.iteration;
    if (!metadata) return [];
    const node = graph.nodes.find((entry) => entry.id === attempt.nodeId);
    const failed = metadata.items.filter((item) => ["failed", "partial", "cancelled"].includes(item.status));
    return [{
      nodeId: attempt.nodeId, label: node?.label || "逐图迭代",
      policy: node?.config.failurePolicy === "at-least-one" ? "at-least-one" as const : "all" as const,
      total: metadata.items.length,
      completed: metadata.items.filter((item) => item.status === "completed").length,
      failed: failed.length,
      pending: metadata.items.filter((item) => ["queued", "running"].includes(item.status)).length,
      failures: failed.map((item) => ({ index: item.index + 1, ...(item.error ? { error: item.error } : {}) })),
    }];
  });
}

export function requireFailedIterationNode(graph: CanvasGraph, nodeRuns: CanvasNodeRun[], nodeId: string) {
  const region = canvasScheduleIterationSummary(graph, nodeRuns).find((entry) => entry.nodeId === nodeId);
  if (!region || !region.failed || region.pending) throw new Error("This iteration region has no finished failed images to retry.");
  return nodeId;
}
