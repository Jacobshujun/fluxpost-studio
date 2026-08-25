import type { CanvasGraph, CanvasLatestSuccessfulNodeRun, CanvasRun, CanvasSchedule, CanvasWorkflow } from "./types";

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

export function canvasRunHistoryResponse(history: { runs: CanvasRun[]; latestSuccessfulNodeRuns: CanvasLatestSuccessfulNodeRun[] }) {
  const workbookNodeIds = new Set(history.runs.flatMap((run) => run.graphSnapshot.nodes
    .filter((node) => node.type === "input.competitor-workbook")
    .map((node) => node.id)));
  return {
    runs: history.runs.map(canvasRunResponse),
    latestSuccessfulNodeRuns: history.latestSuccessfulNodeRuns.map((item) => workbookNodeIds.has(item.nodeRun.nodeId) ? {
      ...structuredClone(item),
      nodeConfig: { ...structuredClone(item.nodeConfig), path: "" },
    } : structuredClone(item)),
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
