"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, Star } from "lucide-react";
import { api, errorMessage } from "./shared";
import type { CanvasScheduleFavorite } from "@/lib/canvas/types";
import "./favorites.css";

export function ScheduleFavoriteControl({ scheduleId, favorite: initialFavorite, disabled = false, onChange }: {
  scheduleId: string;
  favorite?: CanvasScheduleFavorite | null;
  disabled?: boolean;
  onChange?: () => void;
}) {
  const [favorite, setFavorite] = useState(initialFavorite);
  const [editing, setEditing] = useState(false);
  const [alias, setAlias] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const revision = useRef(0);

  useEffect(() => {
    const sync = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; favorite: CanvasScheduleFavorite | null }>).detail;
      if (detail.id === scheduleId) { revision.current += 1; setFavorite(detail.favorite); }
    };
    window.addEventListener("canvas-schedule-favorite-changed", sync);
    return () => window.removeEventListener("canvas-schedule-favorite-changed", sync);
  }, [scheduleId]);

  useEffect(() => {
    let disposed = false;
    const expected = revision.current;
    if (initialFavorite !== undefined) return;
    void api<{ favorite: CanvasScheduleFavorite | null }>(`/api/canvas/schedules/${encodeURIComponent(scheduleId)}/favorite`)
      .then((data) => { if (!disposed && revision.current === expected) setFavorite(data.favorite); })
      .catch((cause) => { if (!disposed) setError(errorMessage(cause)); });
    return () => { disposed = true; };
  }, [scheduleId, initialFavorite]);

  async function update(remove = false, saveEdit = false) {
    setBusy(true); setError("");
    try {
      const data = await api<{ favorite: CanvasScheduleFavorite | null }>(`/api/canvas/schedules/${encodeURIComponent(scheduleId)}/favorite`, {
        method: remove ? "DELETE" : "PUT", ...(!remove ? { body: JSON.stringify(saveEdit ? { alias, note } : {}) } : {}),
      });
      setFavorite(data.favorite); setEditing(false);
      window.dispatchEvent(new CustomEvent("canvas-schedule-favorite-changed", { detail: { id: scheduleId, favorite: data.favorite } }));
      onChange?.();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  const value = favorite;
  return <div className="schedule-favorite-control">
    <div className="schedule-favorite-actions">
      <button type="button" aria-pressed={Boolean(value)} disabled={disabled || busy || value === undefined} onClick={() => void update(Boolean(value))}>
        <Star fill={value ? "currentColor" : "none"} />{value ? "取消收藏" : "收藏任务"}
      </button>
      {value ? <button type="button" disabled={disabled || busy} onClick={() => { setAlias(value.alias); setNote(value.note); setEditing(true); }}><Pencil />编辑收藏</button> : null}
    </div>
    {editing ? <div className="schedule-favorite-editor">
      <label>收藏名称<input aria-label="收藏名称" maxLength={100} value={alias} disabled={disabled || busy} onChange={(event) => setAlias(event.target.value)} /></label>
      <label>备注<textarea aria-label="收藏备注" maxLength={1000} value={note} disabled={disabled || busy} onChange={(event) => setNote(event.target.value)} /></label>
      <div className="schedule-favorite-actions"><button type="button" disabled={disabled || busy || !alias.trim()} onClick={() => void update(false, true)}>保存收藏</button><button type="button" disabled={busy} onClick={() => setEditing(false)}>取消编辑</button></div>
    </div> : null}
    {error ? <p className="schedule-favorite-error" role="alert">{error}<button type="button" disabled={disabled || busy} onClick={() => void api<{ favorite: CanvasScheduleFavorite | null }>(`/api/canvas/schedules/${encodeURIComponent(scheduleId)}/favorite`).then((data) => { setFavorite(data.favorite); setError(""); }).catch((cause) => setError(errorMessage(cause)))}>重新读取收藏</button></p> : null}
  </div>;
}
