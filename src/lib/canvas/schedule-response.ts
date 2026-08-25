import type { CanvasGraph, CanvasLatestNodeAttempt, CanvasLatestSuccessfulNodeRun, CanvasRun, CanvasSchedule, CanvasWorkflow } from "./types";

export function canvasScheduleResponse(schedule: CanvasSchedule) {
  const response = structuredClone(schedule);
  if (response.definition) {
    response.definition.parameters = response.definition.parameters.map((parameter) => parameter.source.mode !== "competitor-workbook" ? parameter : {
      ...parameter,
      source: { ...parameter.source, filePath: undefined },
    });
  }
  if (response.workflowSnapshot) {
    response.workflowSnapshot = redactCompetitorWorkbookGraph(response.workflowSnapshot);
  }
  return response;
}

export function canvasWorkflowResponse(workflow: CanvasWorkflow) {
  return { ...structuredClone(workflow), graph: redactCompetitorWorkbookGraph(workflow.graph) };
}

export function canvasRunResponse(run: CanvasRun) {
  return { ...structuredClone(run), graphSnapshot: redactCompetitorWorkbookGraph(run.graphSnapshot) };
}

export function canvasRunHistoryResponse(history: {
  runs: CanvasRun[];
  latestNodeAttempts: CanvasLatestNodeAttempt[];
  latestSuccessfulNodeRuns: CanvasLatestSuccessfulNodeRun[];
}) {
  return {
    runs: history.runs.map(canvasRunResponse),
    latestNodeAttempts: history.latestNodeAttempts.map(redactCanvasNodeRunProjection),
    latestSuccessfulNodeRuns: history.latestSuccessfulNodeRuns.map(redactCanvasNodeRunProjection),
  };
}

function redactCanvasNodeRunProjection<T extends CanvasLatestNodeAttempt>(item: T): T {
  if (item.nodeRun.nodeType !== "input.competitor-workbook") return structuredClone(item);
  return {
    ...structuredClone(item),
    nodeConfig: { ...structuredClone(item.nodeConfig), path: "" },
  };
}

export function redactCompetitorWorkbookGraph(graph: CanvasGraph): CanvasGraph {
  return {
    ...structuredClone(graph),
    nodes: graph.nodes.map((node) => node.type !== "input.competitor-workbook" ? structuredClone(node) : {
      ...structuredClone(node),
      config: { ...structuredClone(node.config), path: "" },
    }),
  };
}
