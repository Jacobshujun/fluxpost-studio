"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2, Upload } from "lucide-react";
import { toRemoteImagePreviewSrc } from "@/lib/media-preview";

type Props = {
  title: string; contentText: string; images: string[]; previewImages: string[]; busy: boolean; dirty: boolean;
  onChange: (patch: { title?: string; contentText?: string; images?: string[] }) => void;
  onUpload: (files: File[], index?: number) => void;
  onPreview: (index: number) => void;
  onSave: () => void; onDiscard: () => void;
};

export function ContentSourceEditor({ title, contentText, images, previewImages, busy, dirty, onChange, onUpload, onPreview, onSave, onDiscard }: Props) {
  const [drag, setDrag] = useState<number | null>(null);
  const dragIndex = useRef<number | null>(null);
  function move(from: number, to: number) {
    if (busy || from === to || to < 0 || to >= images.length) return;
    const next = [...images];
    next.splice(to, 0, next.splice(from, 1)[0]);
    onChange({ images: next });
  }
  return <section className="content-cluster content-source-editor" aria-label="图文编辑" tabIndex={0}
    onPaste={(event) => {
      const files = Array.from(event.clipboardData.files);
      if (!files.length) return;
      event.preventDefault();
      if (!busy) onUpload(files);
    }}
    onDragOverCapture={(event) => {
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = busy ? "none" : "copy";
    }}
    onDropCapture={(event) => {
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault(); event.stopPropagation();
      if (!busy && event.dataTransfer.files.length) onUpload(Array.from(event.dataTransfer.files));
    }}>
    <div className="content-source-editor-heading">
      <h2 className="text-base font-black">图文编辑</h2>
      <span role="status" className="text-xs text-white/55">{busy ? "正在处理…" : dirty ? "有未保存修改" : "已保存"}</span>
      <div className="content-source-editor-actions">
        <button type="button" className="soft-button" disabled={busy || !dirty} onClick={onDiscard}>放弃修改</button>
        <button type="button" className="primary-button" disabled={busy || !dirty} onClick={onSave}>保存修改</button>
      </div>
    </div>
    <fieldset disabled={busy} className="min-w-0">
      <label className="mt-3 block text-xs font-bold">标题
        <input className="field mt-2" value={title} onChange={(event) => onChange({ title: event.target.value })} />
      </label>
      <label className="mt-3 block text-xs font-bold">正文
        <textarea aria-label="正文" className="field mt-2 min-h-48 leading-7" value={contentText} onChange={(event) => onChange({ contentText: event.target.value })} />
      </label>
      <div className="mt-4 flex items-center justify-between text-xs"><span className="font-bold">配图</span><span>{images.length} 张</span></div>
      <div className="content-source-gallery">
        {images.map((url, index) => <article key={`${url}-${index}`} className={`review-gallery-tile ${drag === index ? "opacity-50" : ""}`}
          onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
            if (dragIndex.current === null) return;
            event.preventDefault(); event.stopPropagation();
            move(dragIndex.current, index); dragIndex.current = null; setDrag(null);
          }}>
          <button type="button" className="review-gallery-preview" aria-label={`预览配图 ${index + 1}`} onClick={() => onPreview(index)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt={`配图 ${index + 1}`} src={toRemoteImagePreviewSrc(previewImages[index])} referrerPolicy="no-referrer" loading="lazy" draggable={false} />
            <span className="review-gallery-index">{index + 1}</span>
          </button>
          <div className="content-source-image-tools">
            <button type="button" className="review-gallery-tool" aria-label={`拖动配图 ${index + 1}`} draggable={!busy}
              onDragStart={(event) => { dragIndex.current = index; setDrag(index); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(index)); }}
              onDragEnd={() => { dragIndex.current = null; setDrag(null); }}><GripVertical size={14} /></button>
            <button type="button" className="review-gallery-tool" aria-label={`上移配图 ${index + 1}`} disabled={busy || index === 0 || drag !== null} onClick={() => move(index, index - 1)}><ArrowUp size={14} /></button>
            <button type="button" className="review-gallery-tool" aria-label={`下移配图 ${index + 1}`} disabled={busy || index === images.length - 1 || drag !== null} onClick={() => move(index, index + 1)}><ArrowDown size={14} /></button>
            <button type="button" className="review-gallery-tool review-gallery-tool-danger" aria-label={`删除配图 ${index + 1}`} disabled={busy || drag !== null} onClick={() => onChange({ images: images.filter((_, at) => at !== index) })}><Trash2 size={14} /></button>
          </div>
          <label className="content-source-replace" tabIndex={busy ? -1 : 0} onPaste={(event) => {
            const files = Array.from(event.clipboardData.files);
            if (files.length) { event.preventDefault(); event.stopPropagation(); if (!busy) onUpload(files.slice(0, 1), index); }
          }}><Upload size={14} />替换图片
            <input className="sr-only" type="file" accept="image/*" aria-label={`替换配图 ${index + 1}`} disabled={busy || drag !== null} onChange={(event) => {
              const file = event.target.files?.[0]; event.target.value = ""; if (file) onUpload([file], index);
            }} />
          </label>
        </article>)}
        <div className="content-source-add" tabIndex={busy ? -1 : 0} aria-label="粘贴或拖入图片">
          <label className="cursor-pointer flex flex-col items-center gap-2"><Plus size={24} /><span>新增图片</span>
            <input className="sr-only" type="file" accept="image/*" multiple aria-label="新增图片" onChange={(event) => {
              const files = Array.from(event.target.files || []); event.target.value = ""; if (files.length) onUpload(files);
            }} />
          </label>
          <span className="text-[11px] text-white/45">粘贴或拖入图片</span>
        </div>
      </div>
    </fieldset>
  </section>;
}

export function ContentSourceEditGuard({ busy, onCancel, onDiscard, onSave }: { busy: boolean; onCancel: () => void; onDiscard: () => void; onSave: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  return <dialog ref={dialog} className="content-source-guard review-upload-panel" aria-label="未保存修改" onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}>
    <h3 className="text-lg font-bold">保存当前样本的修改？</h3>
    <p className="my-4 text-sm text-white/60">当前图文或样本信息尚未保存。</p>
    <div className="flex flex-wrap justify-end gap-2">
      <button type="button" className="soft-button" disabled={busy} onClick={onCancel}>取消</button>
      <button type="button" className="soft-button" disabled={busy} onClick={onDiscard}>放弃并继续</button>
      <button type="button" className="primary-button" disabled={busy} onClick={onSave}>保存并继续</button>
    </div>
  </dialog>;
}
