import { randomUUID } from "node:crypto";
import {
  createCanvasSubtitlePresetInDb,
  deleteCanvasSubtitlePresetFromDb,
  getCanvasSubtitlePresetFromDb,
  listCanvasSubtitlePresetsFromDb,
  updateCanvasSubtitlePresetInDb,
} from "../database";
import type { WorkspaceAccessActor } from "../workspace-ownership";
import { assertCanAccessWorkspaceRecord, filterWorkspaceOwnedRecords, scopeWorkspaceOwner } from "../workspace-ownership";
import { builtInCanvasSubtitlePresets, normalizeCanvasSubtitlePresetName, normalizeCanvasSubtitleStyle, validateCanvasSubtitleStyle } from "./subtitle-style";
import type { CanvasSubtitleStyle } from "./types";

const maxPresetsPerOwner = 100;

export class CanvasSubtitlePresetConflictError extends Error {}
export class CanvasSubtitlePresetNotFoundError extends Error {}

export async function listCanvasSubtitlePresets(account: WorkspaceAccessActor) {
  const stored = filterWorkspaceOwnedRecords(await listCanvasSubtitlePresetsFromDb(), account);
  return [...builtInCanvasSubtitlePresets(), ...stored];
}

export async function createCanvasSubtitlePreset(account: WorkspaceAccessActor, input: { name?: string; style?: unknown }) {
  const name = validatePresetName(input.name);
  const normalizedName = normalizeCanvasSubtitlePresetName(name);
  const owner = scopeWorkspaceOwner(account);
  const existing = (await listCanvasSubtitlePresetsFromDb()).filter((preset) => preset.ownerUserId === owner.ownerUserId);
  if (existing.length >= maxPresetsPerOwner) throw new Error(`Subtitle preset limit reached (${maxPresetsPerOwner}).`);
  if (existing.some((preset) => preset.normalizedName === normalizedName)) throw new CanvasSubtitlePresetConflictError("A subtitle preset with this name already exists.");
  const style = validatePresetStyle(input.style);
  const now = new Date().toISOString();
  try {
    return await createCanvasSubtitlePresetInDb({
      id: `canvas-subtitle-preset-${randomUUID()}`,
      ...owner,
      name,
      normalizedName,
      revision: 1,
      style,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new CanvasSubtitlePresetConflictError("A subtitle preset with this name already exists.");
    throw error;
  }
}

export async function updateCanvasSubtitlePreset(account: WorkspaceAccessActor, presetId: string, input: { name?: string; style?: unknown; revision?: number }) {
  if (presetId.startsWith("builtin-")) throw new Error("Built-in subtitle presets are read-only.");
  const current = await getCanvasSubtitlePresetFromDb(presetId);
  try {
    assertCanAccessWorkspaceRecord(account, current, "Subtitle preset not found.");
  } catch {
    throw new CanvasSubtitlePresetNotFoundError("Subtitle preset not found.");
  }
  if (!current) throw new CanvasSubtitlePresetNotFoundError("Subtitle preset not found.");
  const revision = Number(input.revision);
  if (!Number.isInteger(revision) || revision !== current.revision) throw new CanvasSubtitlePresetConflictError("Subtitle preset revision conflict.");
  const name = validatePresetName(input.name ?? current.name);
  const normalizedName = normalizeCanvasSubtitlePresetName(name);
  const duplicate = (await listCanvasSubtitlePresetsFromDb()).find((preset) => preset.id !== current.id && preset.ownerUserId === current.ownerUserId && preset.normalizedName === normalizedName);
  if (duplicate) throw new CanvasSubtitlePresetConflictError("A subtitle preset with this name already exists.");
  const next = {
    ...current,
    name,
    normalizedName,
    revision: current.revision + 1,
    style: input.style === undefined ? current.style : validatePresetStyle(input.style),
    updatedAt: new Date().toISOString(),
  };
  try {
    if (!await updateCanvasSubtitlePresetInDb(next, revision)) throw new CanvasSubtitlePresetConflictError("Subtitle preset revision conflict.");
  } catch (error) {
    if (error instanceof CanvasSubtitlePresetConflictError) throw error;
    if (isUniqueConstraintError(error)) throw new CanvasSubtitlePresetConflictError("A subtitle preset with this name already exists.");
    throw error;
  }
  return next;
}

export async function deleteCanvasSubtitlePreset(account: WorkspaceAccessActor, presetId: string, revision: number) {
  if (presetId.startsWith("builtin-")) throw new Error("Built-in subtitle presets cannot be deleted.");
  const current = await getCanvasSubtitlePresetFromDb(presetId);
  try {
    assertCanAccessWorkspaceRecord(account, current, "Subtitle preset not found.");
  } catch {
    throw new CanvasSubtitlePresetNotFoundError("Subtitle preset not found.");
  }
  if (!current) throw new CanvasSubtitlePresetNotFoundError("Subtitle preset not found.");
  if (!Number.isInteger(revision) || revision !== current.revision || !await deleteCanvasSubtitlePresetFromDb(presetId, revision)) {
    throw new CanvasSubtitlePresetConflictError("Subtitle preset revision conflict.");
  }
}

function validatePresetName(value: unknown) {
  const name = String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!name || name.length > 60) throw new Error("Subtitle preset name must contain 1 to 60 characters.");
  return name;
}

function validatePresetStyle(value: unknown): CanvasSubtitleStyle {
  const errors = validateCanvasSubtitleStyle(value);
  if (errors.length) throw new Error(errors[0]);
  return normalizeCanvasSubtitleStyle(value);
}

function isUniqueConstraintError(error: unknown) {
  const code = String((error as { code?: unknown } | undefined)?.code || "");
  const message = error instanceof Error ? error.message : String(error || "");
  return code === "23505" || code === "SQLITE_CONSTRAINT_UNIQUE" || /unique constraint|UNIQUE constraint failed/i.test(message);
}
