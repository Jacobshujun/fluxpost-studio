"use client";

import Image from "next/image";
import { defaultImageProcessConfig, imageProcessConfigKey, validateImageProcessConfig } from "@/lib/canvas/image-process-contract";
import type { CanvasNode, CanvasNodeConfig, CanvasNodeRun } from "@/lib/canvas/types";

export function CanvasImageProcessControls({ node, onPatch }: { node: CanvasNode; onPatch: (patch: CanvasNodeConfig) => void }) {
  const config = { ...defaultImageProcessConfig, ...node.config };
  const errors = validateImageProcessConfig(node.config);
  const select = (key: string, label: string, options: [string, string][]) => <label><span>{label}</span><select aria-label={label} value={String(config[key as keyof typeof config])} onChange={(event) => {
    const value = event.target.value;
    onPatch(key === "format" && value === "jpeg" && config.background === "transparent" ? { format: value, background: "#ffffff" } : { [key]: value });
  }}>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>;
  const number = (key: string, label: string, min: number, max: number) => <label><span>{label}</span><input aria-label={label} type="number" min={min} max={max} step={1} value={String(config[key as keyof typeof config] ?? "")} onChange={(event) => onPatch({ [key]: event.target.value === "" ? null : Number(event.target.value) })} /></label>;
  return <div className="canvas-image-process-controls nodrag nopan nowheel" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} onKeyUp={(event) => event.stopPropagation()}>
    {select("format", "输出格式", [["jpeg", "JPEG"], ["png", "PNG · 无损"], ["webp", "WebP"]])}
    {select("compressionMode", "压缩方式", [["quality", config.format === "png" ? "无损压缩" : "按画质"], ["percent", "原文件百分比"], ["size", "单张大小上限"]])}
    {config.format !== "png" ? <>
      <label className="canvas-image-process-quality"><span>{config.compressionMode === "quality" ? "画质" : "最高画质"}</span><div><input aria-label="画质滑杆" type="range" min={1} max={100} value={Number(config.quality)} onChange={(event) => onPatch({ quality: Number(event.target.value) })} /><input aria-label="画质" type="number" min={1} max={100} value={String(config.quality ?? "")} onChange={(event) => onPatch({ quality: event.target.value === "" ? null : Number(event.target.value) })} /></div></label>
      {config.compressionMode !== "quality" ? number("minQuality", "最低画质", 1, 100) : null}
    </> : <small>保留完整色彩和透明度，不减色。</small>}
    {config.compressionMode === "percent" ? number("targetPercent", "不超过原文件 %", 1, 100) : null}
    {config.compressionMode === "size" ? number("targetKB", "单张上限 KB", 1, 30720) : null}
    {select("resizeMode", "分辨率", [["original", "保持原尺寸"], ["percent", "按百分比缩放"], ["longest", "指定最长边"], ["custom", "自定义宽高"]])}
    {config.resizeMode === "percent" ? number("scalePercent", "缩放 %", 1, 400) : null}
    {config.resizeMode === "longest" ? number("longestEdge", "最长边 px", 1, 8192) : null}
    {config.resizeMode === "custom" ? <>
      {number("width", "宽度 px", 1, 8192)}{number("height", "高度 px", 1, 8192)}
      {select("fit", "尺寸适配", [["inside", "等比包含 · 不补边"], ["cover", "居中裁剪填满"], ["contain", "等比补边"]])}
    </> : null}
    {config.format === "jpeg" || (config.resizeMode === "custom" && config.fit === "contain") ? <>
      {config.format !== "jpeg" ? <label><span>透明补边</span><input aria-label="透明补边" type="checkbox" checked={config.background === "transparent"} onChange={(event) => onPatch({ background: event.target.checked ? "transparent" : "#ffffff" })} /></label> : null}
      {config.background !== "transparent" ? <label><span>背景颜色</span><input aria-label="背景颜色" type="color" value={String(config.background)} onChange={(event) => onPatch({ background: event.target.value })} /></label> : null}
    </> : null}
    {errors.length ? <small role="alert">{errors.join(" ")}</small> : null}
  </div>;
}

const bytesLabel = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`;

export function CanvasImageProcessResult({ node, nodeRun, latestSuccessful, onPreview }: {
  node: CanvasNode; nodeRun?: CanvasNodeRun; latestSuccessful?: CanvasNodeRun;
  onPreview: (url: string, index: number) => void;
}) {
  const currentSuccess = nodeRun && ["completed", "reused"].includes(nodeRun.status);
  const displayed = currentSuccess ? nodeRun : latestSuccessful;
  const artifact = displayed?.outputs.images;
  const items = artifact?.kind === "images" ? artifact.items : [];
  let configKey: string | undefined;
  try { configKey = imageProcessConfigKey(node.config); } catch { /* Invalid drafts are labelled stale until corrected. */ }
  const stale = items.some((item) => item.imageProcessing?.configKey !== configKey);
  return <div className="canvas-image-process-result nodrag nopan nowheel" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
    {nodeRun?.error ? <small role="alert">{nodeRun.error}</small> : null}
    {nodeRun && ["running", "queued"].includes(nodeRun.status) ? <small role="status">{nodeRun.status === "running" ? "正在处理图片…" : "等待处理…"}</small> : null}
    {!items.length ? <small>连接图片后运行，查看处理前后对比。</small> : <>
      <strong>{items.length} 张 · {stale ? "参数已修改，请重新运行" : currentSuccess ? "当前参数结果" : "上次成功结果"}</strong>
      {items.map((item, index) => {
        const report = item.imageProcessing;
        if (!report) return <small key={`${item.url}-${index}`}>图片 {index + 1} · 旁路原图</small>;
        return <details key={`${item.url}-${index}`} open={index === 0 ? true : undefined}>
          <summary>图片 {index + 1} · {report.savingsPercent >= 0 ? `节省 ${report.savingsPercent.toFixed(1)}%` : `增加 ${Math.abs(report.savingsPercent).toFixed(1)}%`}</summary>
          <div className="canvas-image-process-pair">{([
            ["原图", report.sourceUrl, report.sourceWidth, report.sourceHeight, report.sourceBytes],
            ["成品", item.url, report.outputWidth, report.outputHeight, report.outputBytes],
          ] as const).map(([label, url, width, height, bytes]) => <div key={label}>
            <button type="button" aria-label={`预览${label} ${index + 1}`} onClick={() => onPreview(url, index)}><Image src={url} alt={label} width={160} height={120} unoptimized loading="lazy" draggable={false} referrerPolicy="no-referrer" /></button>
            <small>{label} {width}×{height}<br />{bytesLabel(bytes)}</small>
          </div>)}</div>
          <small>{report.quality === undefined ? "PNG 无损" : `画质 ${report.quality}`}{report.targetBytes !== undefined ? ` · 上限 ${bytesLabel(report.targetBytes)}` : ""}</small>
        </details>;
      })}
    </>}
  </div>;
}
