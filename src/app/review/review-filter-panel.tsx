"use client";
import { useEffect, useRef, useState } from "react";
import { datePresets, emptyReviewFilters, parseReviewFilters, reviewFields, reviewPlatforms, reviewStatuses, textOperators, type ReviewCondition, type ReviewFilters, type ReviewGroup, type ReviewMatch } from "@/lib/review-filters";
import type { ReviewMetadata } from "@/lib/review-contract";

const labels: Record<string, string> = { title: "标题", body: "正文", taskKeyword: "任务关键词", imagePrompt: "图片提示词", vehicle: "车型", author: "作者", platform: "平台", status: "状态", createdAt: "创建时间", updatedAt: "更新时间", contains: "包含", notContains: "不包含", eq: "等于", ne: "不等于", empty: "为空", notEmpty: "不为空", in: "属于", notIn: "不属于", preset: "相对日期", on: "指定日期", between: "日期范围", before: "早于", after: "晚于", interval: "精确时间边界", today: "今天", yesterday: "昨天", thisWeek: "本周", lastWeek: "上周", thisMonth: "本月", lastMonth: "上月", "7d": "近7天", "30d": "近30天", lastDays: "自定义近N天", draft: "草稿", editing: "编辑中", approved: "已审查", published: "已发布", xiaohongshu: "小红书", douyin: "抖音", weibo: "微博", wechat_channels: "视频号", xiaopeng_bbs: "小鹏社区", dongchedi: "懂车帝", feishu: "飞书", original: "原创" };
const label = (value: string) => labels[value] || value;
const newCondition = (): ReviewCondition => ({ field: "title", op: "contains", value: "" });
const newGroup = (): ReviewGroup => ({ match: "all", children: [newCondition()] });
function Match({ value, onChange }: { value: ReviewMatch; onChange: (value: ReviewMatch) => void }) {
  return <select className="field" aria-label="条件关系" value={value} onChange={(e) => onChange(e.target.value as ReviewMatch)}><option value="all">全部满足（且）</option><option value="any">任一满足（或）</option></select>;
}
function conditionValue(child: ReviewCondition): string {
  if (Array.isArray(child.value)) return child.value.map(label).join(" / ");
  const value = String(child.value ?? "");
  const date = child.field === "createdAt" || child.field === "updatedAt";
  return date && child.op === "preset" ? label(value) : value;
}
function description(group: ReviewGroup): string {
  return `(${group.children.map((child) => "children" in child ? description(child) : `${label(child.field)} ${label(child.op)} ${conditionValue(child)}${child.end ? ` 至 ${child.end}` : ""}`).join(group.match === "all" ? " 且 " : " 或 ")})`;
}

export function ReviewFilterPanel({ filters, error, metadata, onApply }: { filters: ReviewFilters; error?: string; metadata: ReviewMetadata; onApply: (value: ReviewFilters) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(filters);
  const [validation, setValidation] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  function apply() {
    try { const value = parseReviewFilters(JSON.stringify(draft)); onApply(value); setOpen(false); }
    catch (error) { setValidation(error instanceof Error ? error.message : "筛选无效"); }
  }
  return <>
    <div className="review-filter-entry">
      <button className="soft-button" type="button" onClick={() => { setDraft(filters); setValidation(""); setOpen(true); }}>筛选条件</button>
      <button className="soft-button" type="button" onClick={() => onApply(emptyReviewFilters())}>清除筛选</button>
    </div>
    <div className="review-filter-summary" aria-label="已应用条件">
      {error ? <p role="alert">{error}</p> : filters.groups.length ? filters.groups.map((group, index) => <button key={index} className="filter-chip" title={`${description(group)}；点击移除`} onClick={() => onApply({ ...filters, groups: filters.groups.filter((_, i) => i !== index) })}>{description(group)} ×</button>) : <span>全部状态 · 全部时间</span>}
      <span>搜索与条件：全部满足（AND）</span>
    </div>
    <dialog ref={dialog} className="review-overlay review-filter-dialog" onCancel={() => setOpen(false)} onClose={() => setOpen(false)}>
      <h2>高级筛选</h2><p>搜索框 AND 以下条件 · 北京时间 UTC+8 · 全部时间无需添加日期条件</p>
      <label>组间关系 <Match value={draft.match} onChange={(match) => setDraft({ ...draft, match })} /></label>
      {draft.groups.map((group, index) => <GroupEditor key={index} value={group} depth={1} metadata={metadata}
        onChange={(value) => setDraft({ ...draft, groups: draft.groups.map((row, i) => i === index ? value : row) })}
        onRemove={() => setDraft({ ...draft, groups: draft.groups.filter((_, i) => i !== index) })} />)}
      <div className="review-filter-entry"><button className="soft-button" onClick={() => setDraft({ ...draft, groups: [...draft.groups, newGroup()] })}>添加条件组</button>
        <button className="soft-button" onClick={() => setDraft({ ...draft, groups: [...draft.groups, { match: "all", children: [{ field: "updatedAt", op: "preset", value: "today" }] }] })}>添加时间条件</button></div>
      {validation ? <p role="alert">{validation}</p> : null}
      <div className="review-filter-actions"><button className="soft-button" onClick={() => setOpen(false)}>取消</button><button className="primary-button" onClick={apply}>应用筛选</button></div>
    </dialog>
  </>;
}

function GroupEditor({ value, depth, metadata, onChange, onRemove }: { value: ReviewGroup; depth: number; metadata: ReviewMetadata; onChange: (value: ReviewGroup) => void; onRemove: () => void }) {
  return <fieldset className="review-condition-group"><legend>{depth === 1 ? "条件组" : "子组"}</legend>
    <div className="review-filter-entry"><Match value={value.match} onChange={(match) => onChange({ ...value, match })} /><button className="soft-button" onClick={onRemove}>删除组</button></div>
    {value.children.map((child, index) => {
      const update = (next: ReviewCondition | ReviewGroup) => onChange({ ...value, children: value.children.map((row, i) => i === index ? next : row) });
      const remove = () => value.children.length === 1 ? onRemove() : onChange({ ...value, children: value.children.filter((_, i) => i !== index) });
      return "children" in child ? <GroupEditor key={index} value={child} depth={depth + 1} metadata={metadata} onChange={update} onRemove={remove} /> : <ConditionEditor key={index} value={child} metadata={metadata} onChange={update} onRemove={remove} />;
    })}
    <div className="review-filter-entry"><button className="soft-button" onClick={() => onChange({ ...value, children: [...value.children, newCondition()] })}>添加条件</button>
      {depth < 2 ? <button className="soft-button" onClick={() => onChange({ ...value, children: [...value.children, newGroup()] })}>添加子组</button> : null}</div>
  </fieldset>;
}

function ConditionEditor({ value, metadata, onChange, onRemove }: { value: ReviewCondition; metadata: ReviewMetadata; onChange: (value: ReviewCondition) => void; onRemove: () => void }) {
  const date = value.field === "createdAt" || value.field === "updatedAt";
  const enumeration = ["vehicle", "status", "platform"].includes(value.field);
  const operators = date ? ["preset", "on", "between", "before", "after", ...(value.op === "interval" ? ["interval"] : [])] : enumeration ? ["in", "notIn", ...(value.field === "vehicle" ? ["empty", "notEmpty"] : [])] : [...textOperators];
  const options = value.field === "vehicle" ? metadata.vehicles || [] : value.field === "status" ? reviewStatuses : reviewPlatforms;
  const noValue = value.op === "empty" || value.op === "notEmpty";
  return <div className="review-condition">
    <select className="field" aria-label="条件字段" value={value.field} onChange={(e) => {
      const field = e.target.value as ReviewCondition["field"];
      onChange({ field, op: field.endsWith("At") ? "preset" : ["vehicle", "status", "platform"].includes(field) ? "in" : "contains", value: field.endsWith("At") ? "today" : ["vehicle", "status", "platform"].includes(field) ? [] : "" });
    }}>{reviewFields.map((field) => <option key={field} value={field}>{label(field)}</option>)}</select>
    <select className="field" aria-label="运算符" value={value.op} onChange={(e) => onChange({ ...value, op: e.target.value, value: date ? e.target.value === "preset" ? "today" : "" : value.value, end: undefined })}>{operators.map((op) => <option key={op} value={op}>{label(op)}</option>)}</select>
    {!noValue && (enumeration ? <div className="review-enum-options">{[...new Set([...options, ...(Array.isArray(value.value) ? value.value : [])])].map((option) => <label key={option}><input type="checkbox" checked={Array.isArray(value.value) && value.value.includes(option)} onChange={(e) => { const values = Array.isArray(value.value) ? value.value : []; onChange({ ...value, value: e.target.checked ? [...values, option] : values.filter((v) => v !== option) }); }} />{label(option)}</label>)}{!options.length ? <span>当前范围没有候选</span> : null}</div> : value.op === "preset" ? <>
      <select className="field" aria-label="时间预设" value={String(value.value)} onChange={(e) => e.target.value === "all" ? onRemove() : onChange({ ...value, value: e.target.value, end: e.target.value === "lastDays" ? "7" : undefined })}><option value="all">全部时间（移除此条件）</option>{datePresets.map((preset) => <option key={preset} value={preset}>{label(preset)}</option>)}</select>
      {value.value === "lastDays" ? <input className="field" type="number" min={1} max={36500} aria-label="近N天" value={value.end || ""} onChange={(e) => onChange({ ...value, end: e.target.value })} /> : null}
    </> : <><input className="field" type={date && value.op !== "interval" ? "date" : "text"} aria-label="条件值" value={String(value.value || "")} onChange={(e) => onChange({ ...value, value: e.target.value })} />
      {value.op === "between" || value.op === "interval" ? <input className="field" type={value.op === "between" ? "date" : "text"} aria-label="结束日期" value={value.end || ""} onChange={(e) => onChange({ ...value, end: e.target.value })} /> : null}</>)}
    <button className="soft-button" aria-label="删除条件" onClick={onRemove}>×</button>
  </div>;
}
