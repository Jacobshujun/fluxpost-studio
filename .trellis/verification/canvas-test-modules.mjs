import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Load the real pure Canvas contracts without importing provider/config/storage runtime.
const cache = new Map();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export function loadCanvasContract(relative) {
  if (cache.has(relative)) return cache.get(relative).exports;
  const loadedModule = { exports: {} };
  cache.set(relative, loadedModule);
  const source = readFileSync(path.join(root, relative), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  Function("require", "module", "exports", output)((name) => {
    if (name === "../toapis-image-api") return { toApisImageRatios: ["1:1"], toApisImageResolutions: ["1k", "2k", "4k"] };
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(relative), `${name}.ts`));
    if (!name.startsWith(".") || /(?:database|config|executors|runs|workflows)\.ts$/.test(resolved)) throw new Error(`Unexpected runtime dependency in pure Canvas fixture: ${resolved}`);
    return loadCanvasContract(resolved);
  }, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
