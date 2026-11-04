import { canvasBatchBindingKey, getCanvasBatchBindings } from "./registry";
import { getCanvasIterationOutputPorts } from "./iteration";
import type { CanvasGraph, CanvasSchedule, CanvasScheduleV2Definition } from "./types";

export function editBatchDraft(schedule: CanvasSchedule, patch: { name?: string; definition?: CanvasScheduleV2Definition }): CanvasSchedule {
  return { ...schedule, ...patch, status: "draft", previewRevision: undefined, mainTasks: [], totalMainTasks: 0, totalChildTasks: 0 };
}

export function batchInputIssues(definition: CanvasScheduleV2Definition, graph: CanvasGraph) {
  const bindings = getCanvasBatchBindings(graph);
  return definition.parameters.flatMap((parameter) => {
    const name = parameter.name || "未命名内容";
    if (!bindings.some((item) => item.field.parameterTypes.includes(parameter.valueType) && canvasBatchBindingKey(item.binding) === canvasBatchBindingKey(parameter.binding))) return [`${name}：请选择有效的使用位置。`];
    const source = parameter.source;
    if ((source.mode === "fixed" || source.mode === "manual-list") && (!source.values.length || source.values.some((value) => typeof value === "string" && !value.trim()))) return [`${name}：请填写内容。`];
    if ((source.mode === "fixed" || source.mode === "manual-list") && parameter.expansion === "fixed" && source.values.length !== 1) return [`${name}：固定使用需要一项内容。请改为逐项生成，或在素材步骤保留一项。`];
    if (source.mode === "source-video-links" && !source.links.length) return [`${name}：请填写源视频链接。`];
    if (source.mode === "library-filter" && source.filter.mode === "manual" && !source.filter.assetIds.length) return [`${name}：请选择图片。`];
    if (source.mode === "content-pool-filter" && source.filter.mode === "manual" && !source.filter.itemIds.length) return [`${name}：请选择内容池素材。`];
    return [];
  });
}

export function batchOutputIssue(definition: CanvasScheduleV2Definition, graph: CanvasGraph) {
  const node = graph.nodes.find((item) => item.id === definition.childResult.nodeId);
  return node && getCanvasIterationOutputPorts(node).some((port) => port.id === definition.childResult.outputPort && port.kind === definition.childResult.artifactKind)
    ? "" : "请选择有效的生成结果，原输出可能已被移除。";
}

export function batchCanvasHref(workflowId: string, scheduleId?: string) {
  const query = new URLSearchParams({ workflowId });
  if (scheduleId) { query.set("scheduleId", scheduleId); query.set("panel", "schedules"); }
  return `/canvas?${query}`;
}
