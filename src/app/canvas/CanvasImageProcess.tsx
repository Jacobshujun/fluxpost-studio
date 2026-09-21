"use client";

import Image from "next/image";
import { imageProcessConfigKey } from "@/lib/canvas/image-process-contract";
import type { CanvasNode, CanvasNodeConfig, CanvasNodeRun } from "@/lib/canvas/types";
import { ImageProcessControls } from "@/components/image-process-controls";

export function CanvasImageProcessControls({ node, onPatch }: { node: CanvasNode; onPatch: (patch: CanvasNodeConfig) => void }) {
  return <ImageProcessControls value={node.config} onChange={onPatch} />;
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
