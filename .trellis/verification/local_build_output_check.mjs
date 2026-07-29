import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const projectRoot = process.cwd();
const configPath = path.join(projectRoot, "next.config.ts");
const configSource = readFileSync(configPath, "utf8");
const dockerfile = readFileSync(path.join(projectRoot, "Dockerfile"), "utf8");

const localConfig = evaluateConfig({});
const dockerConfig = evaluateConfig({ FLUXPOST_STANDALONE_BUILD: "1" });

if (localConfig.output !== undefined) {
  throw new Error(`Default local build must not enable standalone output, got ${String(localConfig.output)}.`);
}

if (dockerConfig.output !== "standalone") {
  throw new Error(`Docker build mode must enable standalone output, got ${String(dockerConfig.output)}.`);
}

const globalExcludes = dockerConfig.outputFileTracingExcludes?.["*"] || [];
for (const expected of ["public/generated/**/*", "public/media/**/*", "data/**/*", "test-artifacts/**/*"]) {
  if (!globalExcludes.includes(expected)) throw new Error(`Missing output trace exclusion: ${expected}`);
}

if (!/FROM node:24-bookworm-slim AS builder[\s\S]*ENV FLUXPOST_STANDALONE_BUILD=1[\s\S]*RUN npm run build/.test(dockerfile)) {
  throw new Error("Docker builder must enable standalone output before running the Next build.");
}

console.log("Local and Docker Next build output contract check passed.");

function evaluateConfig(environment) {
  const compiled = ts.transpileModule(configSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: configPath,
  }).outputText;
  const moduleContainer = { exports: {} };
  vm.runInNewContext(compiled, {
    module: moduleContainer,
    exports: moduleContainer.exports,
    process: { cwd: () => projectRoot, env: environment },
  }, { filename: configPath });
  return moduleContainer.exports.default;
}
