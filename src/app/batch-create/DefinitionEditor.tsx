"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  CanvasScheduleParameterSourceEditor, CanvasScheduleSampleCountEditor, CanvasScheduleV2Editor,
  canvasNodeDisplayName, canvasScheduleParameterTypes, canvasScheduleParameterTypeLabel,
  canvasScheduleParameterSampleCount, canvasScheduleSharedOutputCandidates,
  defaultCanvasScheduleParameterSource, nextCanvasScheduleParameterId, api, errorMessage, type PreviewState,
} from "@/components/canvas-schedule/shared";
import { canvasBatchBindingKey, getCanvasBatchBindings } from "@/lib/canvas/registry";
import { getCanvasIterationOutputPorts } from "@/lib/canvas/iteration";
import type { CanvasDirectoryGroup, CanvasDirectorySnapshot, CanvasGraph, CanvasSchedule, CanvasScheduleParameter, CanvasScheduleParameterType, CanvasScheduleV2Definition } from "@/lib/canvas/types";

type Props = {
  schedule: CanvasSchedule;
  graph: CanvasGraph;
  stage: "inputs" | "generation";
  busy: boolean;
  onChange: (definition: CanvasScheduleV2Definition) => void;
  onPreview: (preview: Extract<NonNullable<PreviewState>, { kind: "image" }>) => void;
};

export function DefinitionEditor({ schedule, graph, stage, busy, onChange, onPreview }: Props) {
  const definition = schedule.definition;
  if (!definition) return <p role="alert">这项任务缺少生成配置，请在原调度中检查。</p>;
  const bindings = getCanvasBatchBindings(graph);
  const patch = (next: Partial<CanvasScheduleV2Definition>) => onChange({ ...definition, ...next });
  const update = (parameter: CanvasScheduleParameter) => patch({ parameters: definition.parameters.map((item) => item.id === parameter.id ? parameter : item) });
  const outputs = graph.nodes.flatMap((node) => getCanvasIterationOutputPorts(node)
    .filter((port) => ["text", "images", "videos"].includes(port.kind)).map((port) => ({ node, port })));
  const shared = canvasScheduleSharedOutputCandidates(graph, definition);
  const validShared = (output: NonNullable<CanvasScheduleV2Definition["sharedOutputs"]>[number]) => shared.some((item) => item.node.id === output.nodeId && item.port.id === output.outputPort && item.artifactKind === output.artifactKind);
  const invalidShared = definition.sharedOutputs?.filter((item) => !validShared(item)) || [];
  const workbook = definition.parameters.find((item) => item.source.mode === "competitor-workbook")?.source;
  const setWorkbook = (values: Partial<Extract<CanvasScheduleParameter["source"], { mode: "competitor-workbook" }>>) => patch({ parameters: definition.parameters.map((item) => item.source.mode === "competitor-workbook" ? { ...item, source: { ...item.source, ...values, snapshot: undefined } } : item) });

  function addInput() {
    const type = bindings[0]?.field.parameterTypes[0];
    if (!type) return;
    patch({ parameters: [...definition!.parameters, {
      id: nextCanvasScheduleParameterId(), name: `内容 ${definition!.parameters.length + 1}`,
      scope: "main", valueType: type, expansion: type === "video" ? "each" : "fixed",
      source: defaultCanvasScheduleParameterSource(type), binding: { nodeId: "", fieldKey: "" },
    }] });
  }

  function changeType(parameter: CanvasScheduleParameter, valueType: CanvasScheduleParameterType) {
    update({ ...parameter, valueType, binding: { nodeId: "", fieldKey: "" }, source: defaultCanvasScheduleParameterSource(valueType),
      scope: valueType === "content-pool" ? "main" : parameter.scope,
      expansion: valueType === "video" ? "each" : "fixed", sampleCount: undefined, randomCount: undefined });
  }

  return <div className="batch-definition">
    {stage === "inputs" ? <>
      <CanvasScheduleV2Editor presetsOnly schedule={schedule} graph={graph} busy={busy} onDefinitionChange={onChange} onAction={() => {}} onPreview={onPreview} />
      {definition.parameters.map((parameter, index) => {
        const compatible = bindings.filter((item) => item.field.parameterTypes.includes(parameter.valueType));
        const selected = compatible.find((item) => canvasBatchBindingKey(item.binding) === canvasBatchBindingKey(parameter.binding));
        return <section className="batch-input" key={parameter.id} id={`input-${parameter.id}`}>
          <header><span className="batch-input-number">{index + 1}</span><label><span className="batch-sr-only">内容名称 {index + 1}</span><input aria-label={`内容名称 ${index + 1}`} maxLength={80} value={parameter.name} onChange={(event) => update({ ...parameter, name: event.target.value })} /></label><button type="button" aria-label={`移除 ${parameter.name}`} onClick={() => patch({ parameters: definition.parameters.filter((item) => item.id !== parameter.id) })}><Trash2 /></button></header>
          <div className="batch-fields">
            <label><span>内容类型</span><select value={parameter.valueType} onChange={(event) => changeType(parameter, event.target.value as CanvasScheduleParameterType)}>{canvasScheduleParameterTypes.filter((type) => type === parameter.valueType || bindings.some((item) => item.field.parameterTypes.includes(type))).map((type) => <option key={type} value={type}>{type === "boolean" ? "开关" : type === "enum" ? "选项" : canvasScheduleParameterTypeLabel(type)}</option>)}</select></label>
            <label><span>用在什么位置</span><select aria-invalid={!selected} value={selected ? canvasBatchBindingKey(parameter.binding) : ""} onChange={(event) => {
              const option = compatible.find((item) => canvasBatchBindingKey(item.binding) === event.target.value);
              if (option) update({ ...parameter, binding: option.binding, source: parameter.valueType === "video" ? { mode: "video-loader-queue", nodeId: option.node.id } : parameter.source });
            }}><option value="">请选择使用位置</option>{compatible.map((item, i) => <option key={canvasBatchBindingKey(item.binding)} value={canvasBatchBindingKey(item.binding)}>{item.region ? `${canvasNodeDisplayName(item.region)} / ` : ""}{canvasNodeDisplayName(item.node)} · {item.field.label}（{i + 1}）</option>)}</select></label>
          </div>
          {!selected ? <p className="batch-field-error">请选择兼容的使用位置。原位置可能已被移除。</p> : null}
          {parameter.source.mode === "competitor-workbook" ? <p>从 Excel 读取：{({ title: "标题", body: "正文", card: "参数卡片" })[parameter.source.field]}，工作表设置见下方。</p> : parameter.valueType === "directory-group" ? <DirectoryGroupInput key={canvasBatchBindingKey(parameter.binding)} parameter={parameter} snapshotId={String(selected?.node.config.snapshotId || "")} onChange={update} /> : <CanvasScheduleParameterSourceEditor parameter={parameter} graph={graph} onChange={update} onPreview={onPreview} browserKey={`schedule:${schedule.id}:${parameter.id}`} />}
        </section>;
      })}
      {!definition.parameters.length ? <p className="batch-empty">添加需要变化的内容，例如多段文案或一组参考图片。无需变化的内容沿用工作流设置。</p> : null}
      <button type="button" className="batch-add" disabled={!bindings.length} onClick={addInput}><Plus />添加内容或素材</button>
      {!bindings.length ? <p>此工作流没有可批量填写的位置，可以沿用固定配置，或前往画布添加输入。</p> : null}
      {workbook?.mode === "competitor-workbook" ? <section className="batch-input"><h3>Excel 来源</h3><p>已有文件由服务器保留；仅在更换文件时填写本机路径。</p><label><span>更换工作簿路径</span><input value={workbook.filePath || ""} onChange={(event) => setWorkbook({ filePath: event.target.value || undefined })} /></label><div className="batch-fields"><label><span>工作表</span><input value={workbook.worksheet} onChange={(event) => setWorkbook({ worksheet: event.target.value })} /></label><label><span>起始行</span><input type="number" min={2} value={workbook.rowStart ?? 2} onChange={(event) => setWorkbook({ rowStart: Number(event.target.value) })} /></label><label><span>结束行（留空为全部）</span><input type="number" min={2} value={workbook.rowEnd ?? ""} onChange={(event) => setWorkbook({ rowEnd: event.target.value ? Number(event.target.value) : undefined })} /></label></div></section> : null}
    </> : <>
      <section className="batch-input"><h3>希望得到什么结果</h3><label><span>生成结果</span><select value={`${definition.childResult.nodeId}::${definition.childResult.outputPort}`} onChange={(event) => {
        const selected = outputs.find((item) => `${item.node.id}::${item.port.id}` === event.target.value);
        if (selected && (selected.port.kind === "text" || selected.port.kind === "images" || selected.port.kind === "videos")) patch({ childResult: { nodeId: selected.node.id, outputPort: selected.port.id, artifactKind: selected.port.kind } });
      }}><option value="::">请选择输出</option>{outputs.map((item, index) => <option key={`${item.node.id}:${item.port.id}`} value={`${item.node.id}::${item.port.id}`}>{canvasNodeDisplayName(item.node)} · {item.port.label}（{index + 1}）</option>)}</select></label></section>
      {(["main", "child"] as const).map((scope) => <section className="batch-input" key={scope}><h3>{scope === "main" ? "每组内容" : "组内结果"}</h3><p>{scope === "main" ? "不同的内容分别组成任务。例如，每篇文案是一组。" : "在同一组内容下生成不同版本。例如，同篇文案搭配不同图片。"}</p>
        {definition.parameters.filter((item) => item.scope === scope).map((parameter) => <div className="batch-generation-row" key={parameter.id}><strong>{parameter.name}</strong><div className="batch-fields"><label><span>安排到</span><select value={parameter.scope} onChange={(event) => update({ ...parameter, scope: event.target.value as "main" | "child" })}><option value="main">每组内容</option><option value="child" disabled={parameter.valueType === "content-pool"}>组内结果</option></select></label><label><span>如何使用</span><select value={parameter.expansion} onChange={(event) => {
          const expansion = event.target.value as CanvasScheduleParameter["expansion"];
          const source = parameter.source.mode === "fixed" || parameter.source.mode === "manual-list" ? { ...parameter.source, mode: expansion === "fixed" ? "fixed" as const : "manual-list" as const } : parameter.source;
          update({ ...parameter, source, expansion, sampleCount: expansion === "random" ? canvasScheduleParameterSampleCount(parameter) : undefined, randomCount: undefined });
        }}><option value="fixed" disabled={parameter.valueType === "video"}>固定使用</option><option value="each">逐项生成</option><option value="random" disabled={parameter.valueType === "video"}>随机选取</option></select></label></div>{parameter.expansion === "random" ? <CanvasScheduleSampleCountEditor parameter={parameter} sampleCount={canvasScheduleParameterSampleCount(parameter)} onChange={update} /> : null}</div>)}
        <label><span>多项内容如何搭配</span><select value={definition.expansion[scope]} onChange={(event) => patch({ expansion: { ...definition.expansion, [scope]: event.target.value as "zip" | "cartesian" } })}><option value="cartesian">全部组合</option><option value="zip">按顺序配对</option></select></label>
        <p className="batch-hint">{definition.expansion[scope] === "cartesian" ? "示例估算：2 段文案 × 3 张图片 = 6 种组合。" : "示例估算：第 1 段文案配第 1 张图，第 2 段配第 2 张图。实际配对以预览为准。"}</p>
      </section>)}
      <details className="batch-advanced"><summary>高级设置 <span>共享 {definition.sharedOutputs?.length || 0} 项 · {definition.mainTargetNodeId ? "已设置组完成后的处理" : "仅汇总结果"} · {definition.aggregationPolicy === "all" ? "全部成功才完成" : "允许部分成功"}</span></summary>
        <label><span>每组完成后继续处理（可选）</span><select value={definition.mainTargetNodeId || ""} onChange={(event) => patch({ mainTargetNodeId: event.target.value || undefined })}><option value="">仅汇总结果</option>{graph.nodes.filter((node) => node.type !== "publish.feishu").map((node, index) => <option key={node.id} value={node.id}>{canvasNodeDisplayName(node)}（{index + 1}）</option>)}</select></label>
        <label><span>遇到失败时</span><select value={definition.aggregationPolicy} onChange={(event) => patch({ aggregationPolicy: event.target.value as "all" | "at-least-one" })}><option value="at-least-one">至少一个结果成功即可继续</option><option value="all">全部结果成功才继续</option></select></label>
        <h3>同组共用的处理结果</h3><p>选中的步骤每组只执行一次，供组内结果重复使用。</p>
        {invalidShared.length ? <p role="alert">有 {invalidShared.length} 项共享选择已失效。<button type="button" onClick={() => patch({ sharedOutputs: definition.sharedOutputs?.filter(validShared) })}>移除失效选择</button></p> : null}
        {shared.map((candidate) => <label className="batch-checkbox" key={`${candidate.node.id}:${candidate.port.id}`}><input type="checkbox" checked={definition.sharedOutputs?.some((item) => item.nodeId === candidate.node.id && item.outputPort === candidate.port.id) || false} onChange={(event) => {
          const grouped = ["input.content-collection", "utility.image-iterate"].includes(candidate.node.type);
          const retained = (definition.sharedOutputs || []).filter((item) => item.nodeId !== candidate.node.id || (!grouped && item.outputPort !== candidate.port.id));
          const chosen = shared.filter((item) => item.node.id === candidate.node.id && (grouped || item.port.id === candidate.port.id)).map((item) => ({ nodeId: item.node.id, outputPort: item.port.id, artifactKind: item.artifactKind }));
          patch({ sharedOutputs: event.target.checked ? [...retained, ...chosen] : retained });
        }} /><span>{canvasNodeDisplayName(candidate.node)} · {candidate.port.label}</span></label>)}
        {!shared.length ? <p>此工作流暂时没有可共用的处理结果。</p> : null}
      </details>
    </>}
  </div>;
}

function DirectoryGroupInput({ parameter, snapshotId, onChange }: { parameter: CanvasScheduleParameter; snapshotId: string; onChange: (parameter: CanvasScheduleParameter) => void }) {
  const [snapshot, setSnapshot] = useState<CanvasDirectorySnapshot>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const values = parameter.source.mode === "fixed" || parameter.source.mode === "manual-list" ? parameter.source.values : [];
  const selected = values.filter((item): item is CanvasDirectoryGroup => Boolean(item && typeof item === "object" && !Array.isArray(item) && "images" in item && "audios" in item));
  async function load() {
    setBusy(true); setError("");
    try {
      const data = await api<{ snapshot: CanvasDirectorySnapshot }>(`/api/canvas/local-directory/snapshot?id=${encodeURIComponent(snapshotId)}`);
      setSnapshot(data.snapshot);
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }
  return <div><p>已选择 {selected.length} 个目录媒体组。使用画布中已扫描的目录，不会自动重新扫描。</p><button type="button" disabled={busy || !snapshotId} onClick={() => void load()}>{busy ? "读取中…" : "选择目录媒体组"}</button>{!snapshotId ? <p>请先在画布的本地目录输入中扫描目录并保存。</p> : null}{error ? <p role="alert">{error}</p> : null}{!snapshot ? selected.map((group) => <p key={group.id}>{group.name} · {group.images.length} 张图片</p>) : snapshot.groups.map((group) => <label className="batch-checkbox" key={group.id}><input type="checkbox" checked={selected.some((item) => item.id === group.id)} disabled={!group.valid} onChange={(event) => {
    const next = event.target.checked ? [...selected.filter((item) => item.id !== group.id), { ...group, snapshotId: snapshot.id }] : selected.filter((item) => item.id !== group.id);
    onChange({ ...parameter, source: { mode: "manual-list", values: next }, expansion: "each" });
  }} /><span>{group.name} · {group.images.length} 张图片{!group.valid ? ` · ${group.errors.join("；")}` : ""}</span></label>)}</div>;
}
