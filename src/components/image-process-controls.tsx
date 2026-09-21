"use client";

import { defaultImageProcessConfig, validateImageProcessConfig } from "@/lib/canvas/image-process-contract";
import type { CanvasNodeConfig } from "@/lib/canvas/types";

export function ImageProcessControls({ value, onChange, disabled = false }: {
  value: CanvasNodeConfig;
  onChange: (patch: CanvasNodeConfig) => void;
  disabled?: boolean;
}) {
  const config = { ...defaultImageProcessConfig, ...(value || {}) };
  const errors = validateImageProcessConfig(value);
  const select = (key: keyof typeof defaultImageProcessConfig, label: string, options: [string, string][]) => <label className="min-w-0"><span>{label}</span><select aria-label={label} value={String(config[key])} disabled={disabled} onChange={(event) => onChange(key === "format" && event.target.value === "jpeg" && config.background === "transparent" ? { format: "jpeg", background: "#ffffff" } : { [key]: event.target.value })}>{options.map(([option, text]) => <option key={option} value={option}>{text}</option>)}</select></label>;
  const number = (key: keyof typeof defaultImageProcessConfig, label: string, min: number, max: number) => <label className="min-w-0"><span>{label}</span><input aria-label={label} type="number" min={min} max={max} step={1} value={String(config[key] ?? "")} disabled={disabled} onChange={(event) => onChange({ [key]: event.target.value === "" ? null : Number(event.target.value) })} /></label>;
  return <div className="canvas-image-process-controls nodrag nopan nowheel" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} onKeyUp={(event) => event.stopPropagation()}>
      {select("format", "输出格式", [["jpeg", "JPEG"], ["png", "PNG · 无损"], ["webp", "WebP"]])}
      {select("compressionMode", "压缩方式", [["quality", config.format === "png" ? "无损压缩" : "按画质"], ["percent", "原文件百分比"], ["size", "单张大小上限"]])}
      {config.format !== "png" ? <>
        <label className="canvas-image-process-quality"><span>{config.compressionMode === "quality" ? "画质" : "最高画质"}</span><div><input aria-label="画质滑杆" type="range" min={1} max={100} value={Number(config.quality)} disabled={disabled} onChange={(event) => onChange({ quality: Number(event.target.value) })} /><input aria-label="画质" type="number" min={1} max={100} value={String(config.quality ?? "")} disabled={disabled} onChange={(event) => onChange({ quality: event.target.value === "" ? null : Number(event.target.value) })} /></div></label>
        {config.compressionMode !== "quality" ? number("minQuality", "最低画质", 1, 100) : null}
      </> : <small>保留完整色彩和透明度，不减色。</small>}
      {config.compressionMode === "percent" ? number("targetPercent", "不超过原文件 %", 1, 100) : null}
      {config.compressionMode === "size" ? number("targetKB", "单张上限 KB", 1, 30720) : null}
      {select("resizeMode", "分辨率", [["original", "保持原尺寸"], ["percent", "按百分比缩放"], ["longest", "指定最长边"], ["custom", "自定义宽高"]])}
      {config.resizeMode === "percent" ? number("scalePercent", "缩放 %", 1, 400) : null}
      {config.resizeMode === "longest" ? number("longestEdge", "最长边 px", 1, 8192) : null}
      {config.resizeMode === "custom" ? <>{number("width", "宽度 px", 1, 8192)}{number("height", "高度 px", 1, 8192)}{select("fit", "尺寸适配", [["inside", "等比包含 · 不补边"], ["cover", "居中裁剪填满"], ["contain", "等比补边"]])}</> : null}
      {config.format === "jpeg" || (config.resizeMode === "custom" && config.fit === "contain") ? <>{config.format !== "jpeg" ? <label><span>透明补边</span><input aria-label="透明补边" type="checkbox" checked={config.background === "transparent"} disabled={disabled} onChange={(event) => onChange({ background: event.target.checked ? "transparent" : "#ffffff" })} /></label> : null}{config.background !== "transparent" ? <label><span>背景颜色</span><input aria-label="背景颜色" type="color" value={String(config.background)} disabled={disabled} onChange={(event) => onChange({ background: event.target.value })} /></label> : null}</> : null}
      {errors.length ? <small role="alert">{errors.join(" ")}</small> : null}
  </div>;
}
