import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const config = { seedancePromptSkillPath: "" };
const nodeRequire = createRequire(import.meta.url);

function loadLoader() {
  const relative = "src/lib/canvas/seedance-skill-loader.ts";
  const source = readFileSync(path.join(root, relative), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: relative,
  }).outputText;
  const cjsModule = { exports: {} };
  vm.runInNewContext(output, {
    module: cjsModule,
    exports: cjsModule.exports,
    require: (id) => id === "../config" ? { appConfig: config } : nodeRequire(id),
    console,
    process,
    Error,
    Set,
    Map,
    JSON,
    Number,
    String,
    Object,
  }, { filename: relative });
  return cjsModule.exports;
}

const loader = loadLoader();
const tempDir = mkdtempSync(path.join(os.tmpdir(), "fluxpost-seedance-skill-"));
const skillPath = path.join(tempDir, "SKILL.md");
try {
  const first = "first runtime skill";
  writeFileSync(skillPath, first, "utf8");
  config.seedancePromptSkillPath = skillPath;
  // The loader imports the same object returned by this stub, so changing its path is deterministic.
  loader.clearSeedancePromptSkillCache();
  const loadedFirst = loader.loadSeedancePromptSkill();
  assert.equal(loadedFirst.content, first);
  assert.equal(loadedFirst.metadata.source, "configured-file");
  assert.match(loadedFirst.metadata.version, /^[a-f0-9]{64}$/);

  writeFileSync(skillPath, "second runtime skill", "utf8");
  const statTime = new Date(Date.now() + 2000);
  utimesSync(skillPath, statTime, statTime);
  const loadedSecond = loader.loadSeedancePromptSkill();
  assert.equal(loadedSecond.content, "second runtime skill");
  assert.notEqual(loadedSecond.metadata.version, loadedFirst.metadata.version);
  assert.equal(loader.loadSeedancePromptSkill(), loadedSecond);

  config.seedancePromptSkillPath = path.join(tempDir, "missing", "SKILL.md");
  loader.clearSeedancePromptSkillCache();
  assert.throws(() => loader.loadSeedancePromptSkill(), (error) => {
    assert.match(error.message, /not readable/);
    assert.doesNotMatch(error.message, /fluxpost-seedance-skill-/);
    return true;
  });

  const configSource = readFileSync(path.join(root, "src/lib/config.ts"), "utf8");
  assert.match(configSource, /SEEDANCE_PROMPT_SKILL_PATH/);
  assert.match(configSource, /configField\("SEEDANCE_PROMPT_SKILL_PATH"/);
  console.log("Seedance runtime skill check passed.");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
