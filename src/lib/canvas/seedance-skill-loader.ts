import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { appConfig } from "../config";

const MAX_SKILL_BYTES = 96 * 1024;

/** Creative guidance used only when no operator-managed Skill path is configured. */
export const DEFAULT_SEEDANCE_PROMPT_SKILL = [
  "Keep each short video focused on one visual idea.",
  "Lead with a concrete opening hook, then describe subject, action, environment, lighting, camera, sound, and ending.",
  "Use explicit time ranges for videos longer than 12 seconds and make transitions physically plausible.",
  "Prefer specific Chinese visual details over generic cinematic filler; preserve reference-image identity and sequence.",
].join("\n");

export type SeedancePromptSkillMetadata = {
  source: "configured-file" | "builtin";
  version: string;
  updatedAt: string | null;
};

export type SeedancePromptSkill = {
  content: string;
  metadata: SeedancePromptSkillMetadata;
};

export class SeedancePromptSkillLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedancePromptSkillLoadError";
  }
}

type FileCache = SeedancePromptSkill & {
  resolvedPath: string;
  mtimeMs: number;
  size: number;
};

let fileCache: FileCache | undefined;

const builtinSkill: SeedancePromptSkill = {
  content: DEFAULT_SEEDANCE_PROMPT_SKILL,
  metadata: {
    source: "builtin",
    version: hashContent(DEFAULT_SEEDANCE_PROMPT_SKILL),
    updatedAt: null,
  },
};

export function loadSeedancePromptSkill(): SeedancePromptSkill {
  const configuredPath = appConfig.seedancePromptSkillPath;
  if (!configuredPath) return builtinSkill;

  const resolvedPath = path.resolve(configuredPath);
  if (path.basename(resolvedPath).toLowerCase() !== "skill.md") {
    throw new SeedancePromptSkillLoadError("Configured Seedance Prompt Skill path must point to a SKILL.md file.");
  }
  let stats;
  let realPath: string;
  try {
    stats = statSync(resolvedPath);
    realPath = realpathSync(resolvedPath);
  } catch {
    throw new SeedancePromptSkillLoadError("Configured Seedance Prompt Skill file is not readable.");
  }
  if (!stats.isFile()) throw new SeedancePromptSkillLoadError("Configured Seedance Prompt Skill path is not a file.");
  if (path.basename(realPath).toLowerCase() !== "skill.md") {
    throw new SeedancePromptSkillLoadError("Configured Seedance Prompt Skill target must be a SKILL.md file.");
  }
  if (stats.size > MAX_SKILL_BYTES) {
    throw new SeedancePromptSkillLoadError(`Configured Seedance Prompt Skill file exceeds ${MAX_SKILL_BYTES} bytes.`);
  }
  if (fileCache && fileCache.resolvedPath === resolvedPath && fileCache.mtimeMs === stats.mtimeMs && fileCache.size === stats.size) {
    return fileCache;
  }

  let content: string;
  try {
    content = readFileSync(resolvedPath, "utf8");
  } catch {
    throw new SeedancePromptSkillLoadError("Configured Seedance Prompt Skill file cannot be read.");
  }
  if (!content.trim()) throw new SeedancePromptSkillLoadError("Configured Seedance Prompt Skill file is empty.");
  const loaded: FileCache = {
    content,
    metadata: {
      source: "configured-file",
      version: hashContent(content),
      updatedAt: stats.mtime.toISOString(),
    },
    resolvedPath,
    mtimeMs: stats.mtimeMs,
    size: stats.size,
  };
  fileCache = loaded;
  return loaded;
}

export function clearSeedancePromptSkillCache() {
  fileCache = undefined;
}

function hashContent(content: string) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}
