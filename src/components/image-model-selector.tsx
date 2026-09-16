"use client";

import { useEffect, useRef, useState } from "react";
import { imageModelPresets, type ToApisRequestFormat } from "@/lib/image-model-options";

export function ImageModelSelector({ model, requestFormat, onChange, disabled, labelClassName, inputClassName }: {
  model?: string;
  requestFormat?: ToApisRequestFormat;
  onChange: (patch: { model?: string; requestFormat?: ToApisRequestFormat }) => void;
  disabled?: boolean;
  labelClassName?: string;
  inputClassName?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [customEditing, setCustomEditing] = useState(false);
  useEffect(() => { if (document.activeElement !== inputRef.current) setCustomEditing(false); }, [model]);
  const selected = model === undefined ? "default" : !customEditing && imageModelPresets.some((preset) => preset.model === model) ? model : "custom";
  return <>
    <label className={labelClassName}><span>图片模型</span><select className={inputClassName} aria-label="图片模型" disabled={disabled} value={selected} onChange={(event) => {
      const value = event.target.value;
      setCustomEditing(value === "custom");
      const preset = imageModelPresets.find((item) => item.model === value);
      onChange(value === "default" ? { model: undefined, requestFormat: undefined }
        : value === "custom" ? { model: "" } : { model: value, requestFormat: preset?.format });
    }}>
      <option value="default">默认模型</option>
      {imageModelPresets.map((preset) => <option key={preset.model} value={preset.model}>{preset.model}</option>)}
      <option value="custom">自定义</option>
    </select></label>
    {selected === "custom" ? <label className={labelClassName}><span>自定义模型 ID</span><input className={inputClassName} ref={inputRef} aria-label="自定义模型 ID" disabled={disabled} value={model ?? ""} onChange={(event) => { setCustomEditing(true); onChange({ model: event.target.value }); }} onBlur={(event) => onChange({ model: event.target.value.trim() })} aria-invalid={!model?.trim()} /></label> : null}
    {model !== undefined ? <label className={labelClassName}><span>ToAPIs 请求格式</span><select className={inputClassName} aria-label="ToAPIs 请求格式" disabled={disabled} value={requestFormat ?? ""} onChange={(event) => onChange({ requestFormat: (event.target.value || undefined) as ToApisRequestFormat | undefined })}>
      <option value="">沿用通道配置</option><option value="ratio">比例 + 分辨率</option><option value="pixels">像素尺寸</option><option value="legacy">旧版图像接口</option>
    </select></label> : null}
  </>;
}
