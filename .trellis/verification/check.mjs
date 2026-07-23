import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const nodeCommand = process.execPath;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

const nodeChecks = [
  ["PostgreSQL schema check", "postgres_schema_check.mjs"],
  ["Workspace accounts check", "workspace_accounts_check.mjs"],
  ["Compact-only workspace check", "compact_only_workspace_check.mjs"],
  ["Advanced config admin boundary check", "advanced_config_check.mjs"],
  ["TOS runtime media storage check", "tos_runtime_media_check.mjs"],
  ["Feishu CLI identity auto-init check", "feishu_cli_identity_check.mjs"],
  ["Ubuntu VPS deployment check", "vps_deployment_check.mjs"],
  ["Execution log append check", "execution_log_append_check.mjs"],
  ["Keyword relevance check", "keyword_relevance_check.mjs"],
  ["Xiaohongshu note type check", "xiaohongshu_note_type_check.mjs"],
  ["Weibo search mapping check", "weibo_search_mapping_check.mjs"],
  ["Weibo image cleanup check", "weibo_image_cleanup_check.mjs"],
  ["Douyin search mapping check", "douyin_search_mapping_check.mjs"],
  ["Douyin carousel image check", "douyin_carousel_image_check.mjs"],
  ["Media request headers check", "media_request_headers_check.mjs"],
  ["Media URL filter check", "media_url_filter_check.mjs"],
  ["Media cache image format check", "media_cache_image_format_check.mjs"],
  ["HEIC review delivery check", "heic_review_delivery_check.mjs"],
  ["Video download fallback check", "video_download_fallback_check.mjs"],
  ["Video frame policy check", "video_frame_policy_check.mjs"],
  ["Video quality selection check", "video_quality_selection_check.mjs"],
  ["Video frame original-reference check", "video_frame_original_reference_check.mjs"],
  ["Video transcription check", "video_transcription_check.mjs"],
  ["Source video reference check", "source_video_reference_check.mjs"],
  ["Concurrency integration check", "concurrency_check.mjs"],
  ["Feishu publish resume check", "feishu_publish_resume_check.mjs"],
  ["Feishu publish queue check", "feishu_publish_queue_check.mjs"],
  ["Feishu publish media recovery check", "feishu_publish_media_recovery_check.mjs"],
  ["Feishu vehicle options check", "feishu_vehicle_options_check.mjs"],
  ["Simple crawl top-up and media policy check", "simple_crawl_media_policy_check.mjs"],
  ["Source safety filter check", "source_safety_filter_check.mjs"],
  ["Source import retirement check", "source_import_feishu_check.mjs"],
  ["Feishu content import check", "feishu_content_import_check.mjs"],
  ["Distribution check", "distribution_check.mjs"],
  ["Lark task launcher check", "lark_task_launcher_check.mjs"],
  ["Simple config sync check", "simple_config_sync_check.mjs"],
  ["User text instruction priority check", "user_text_instruction_priority_check.mjs"],
  ["Crawl strategy save check", "crawl_strategy_save_check.mjs"],
  ["Xiaopeng BBS import check", "xiaopeng_bbs_import_check.mjs"],
  ["Dongchedi import check", "dongchedi_import_check.mjs"],
  ["Link import check", "link_import_check.mjs"],
  ["Content desk check", "content_desk_check.mjs"],
  ["Simple link run check", "simple_link_run_check.mjs"],
  ["Simple viral run check", "simple_viral_run_check.mjs"],
  ["Simple original run check", "simple_original_run_check.mjs"],
  ["Viral replication regression check", "viral_replication_regression_check.mjs"],
  ["Simple queue and Feishu chunking check", "simple_queue_check.mjs"],
  ["Simple run persistence check", "simple_run_persistence_check.mjs"],
  ["Title prompt guard check", "title_prompt_guard_check.mjs"],
  ["Image prompt guard check", "image_prompt_guard_check.mjs"],
  ["Image generation toggle check", "image_generation_toggle_check.mjs"],
  ["Material library preview check", "material_library_preview_check.mjs"],
  ["Review preview layout check", "review_preview_layout_check.mjs"],
  ["Review desk workflow check", "review_desk_workflow_check.mjs"],
  ["Review desk scroll layout check", "review_desk_scroll_layout_check.mjs"],
  ["Image task fallback check", "image_task_fallback_check.mjs"],
  ["ToAPIs GPT-Image-2 adapter check", "toapis_image_api_check.mjs"],
  ["Image provider profiles check", "image_provider_profiles_check.mjs"],
  ["GPT image size request check", "gpt_image_size_request_check.mjs"],
  ["ComfyUI Klein integration check", "comfyui_klein_check.mjs"],
  ["Source tagging image check", "source_tagging_image_check.mjs"],
  ["Content projects row-level mutation check", "content_projects_upsert_check.mjs"],
  ["Generated posts row-level mutation check", "generated_posts_upsert_check.mjs"],
];

process.chdir(projectRoot);
assertTrellisContext();

const jsonFiles = [
  "package.json",
  "tsconfig.json",
  ".trellis/spec/fluxpost/feature_list.json",
  "data/content-pool.json",
  "data/execution-log.json",
  "data/batch-production.json",
].filter(existsRelative);
runStep("Parse project JSON", nodeCommand, [".trellis/verification/json_check.mjs", ...jsonFiles]);

for (const [name, script] of nodeChecks) {
  runStep(name, nodeCommand, [`.trellis/verification/${script}`]);
}
runStep("OpenAI image SSE check", nodeCommand, [
  "--experimental-strip-types",
  "--no-warnings",
  ".trellis/verification/openai_image_sse_check.mjs",
]);
runStep("Lint", npmCommand, ["run", "lint"]);
runStep("TypeScript noEmit", npxCommand, ["--no-install", "tsc", "--noEmit"]);
runStep("Next build", npmCommand, ["run", "build"]);

const smokePort = parseSmokePort(process.env.TRELLIS_SMOKE_PORT ?? "3310");
await runHttpSmoke(smokePort);
runStep("SQLite store check", nodeCommand, [".trellis/verification/db_check.mjs"]);
console.log("Baseline verification passed.");

function assertTrellisContext() {
  const requiredFiles = [
    "AGENTS.md",
    ".trellis/spec/fluxpost/project_brief.md",
    ".trellis/spec/fluxpost/feature_list.json",
    ".trellis/spec/fluxpost/progress.md",
    ".trellis/spec/fluxpost/handoff.md",
    ".trellis/spec/fluxpost/decisions.md",
    ".trellis/spec/fluxpost/verification.md",
    ".trellis/spec/fluxpost/pitfalls.md",
    ".trellis/spec/fluxpost/architecture_rules.md",
    ".trellis/verification/init.ps1",
    ".trellis/verification/handoff.ps1",
    ".trellis/verification/check.ps1",
    ".trellis/verification/check.mjs",
    ".trellis/verification/json_check.mjs",
    ".trellis/verification/http_smoke.js",
  ];
  for (const file of requiredFiles) {
    if (!existsRelative(file)) throw new Error(`Required file is missing: ${file}`);
  }

  const featureList = readJson(".trellis/spec/fluxpost/feature_list.json");
  const expectedStatuses = ["not_started", "in_progress", "ready_for_review", "done", "blocked"];
  if (JSON.stringify(featureList.status_values) !== JSON.stringify(expectedStatuses)) {
    throw new Error(`feature_list.json status_values must be: ${expectedStatuses.join(", ")}`);
  }
  if (!Array.isArray(featureList.features) || featureList.features.length === 0) {
    throw new Error("feature_list.json must contain at least one feature.");
  }
  for (const feature of featureList.features) {
    if (!feature.id) throw new Error("Every feature must have an id.");
    if (!expectedStatuses.includes(feature.status)) {
      throw new Error(`Feature '${feature.id}' has invalid status '${feature.status}'.`);
    }
    const evidenceCount = Array.isArray(feature.evidence) ? feature.evidence.length : 0;
    if (evidenceCount > 3) {
      throw new Error(`Feature '${feature.id}' has ${evidenceCount} evidence entries; keep 1-3 and archive details.`);
    }
    if (feature.status === "done" && evidenceCount === 0) {
      throw new Error(`Feature '${feature.id}' is done but has no evidence.`);
    }
  }

  const defaultStartup = [
    "AGENTS.md",
    ".trellis/spec/fluxpost/status.md",
    ".trellis/spec/fluxpost/feature_list.json",
    ".trellis/spec/fluxpost/rules.md",
  ];
  const typicalCodeTask = [
    ...defaultStartup,
    ".trellis/spec/fluxpost/project_brief.md",
    ".trellis/spec/fluxpost/verification.md",
  ];
  assertContextBudget("Default startup", defaultStartup, 45 * 1024);
  assertContextBudget("Typical code task", typicalCodeTask, 70 * 1024);
  assertLatestMarker(".trellis/spec/fluxpost/handoff.md");
  assertLatestMarker(".trellis/spec/fluxpost/progress.md");
}

function assertContextBudget(name, files, limitBytes) {
  const total = files.reduce((sum, file) => sum + statSync(resolveRelative(file)).size, 0);
  console.log(`== Trellis context budget: ${name} = ${(total / 1024).toFixed(2)} KB / ${(limitBytes / 1024).toFixed(2)} KB`);
  if (total > limitBytes) {
    throw new Error(`${name} Trellis context is ${total} bytes, over budget ${limitBytes} bytes.`);
  }
}

function assertLatestMarker(relativePath) {
  const source = readText(relativePath);
  if (!source.includes("## \u6700\u8fd1\u4e00\u6761")) {
    throw new Error(`${relativePath} must contain the required latest-entry heading.`);
  }
  const start = "<!-- TRELLIS-LATEST-START -->";
  const end = "<!-- TRELLIS-LATEST-END -->";
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end);
  if (startIndex < 0 || endIndex <= startIndex) {
    throw new Error(`${relativePath} must contain a valid TRELLIS-LATEST marker block.`);
  }
  const latest = source.slice(startIndex + start.length, endIndex);
  const latestBytes = Buffer.byteLength(latest, "utf8");
  console.log(`== Trellis latest block: ${relativePath} = ${latestBytes} bytes / 8192 bytes`);
  if (latestBytes > 8192) throw new Error(`${relativePath} latest block exceeds 8192 bytes.`);
}

function runStep(name, command, args) {
  console.log(`== ${name}`);
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: process.env,
    shell: process.platform === "win32" && command.endsWith(".cmd"),
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${name} failed with exit code ${result.status}`);
}

async function runHttpSmoke(port) {
  const nextBin = resolveRelative("node_modules/next/dist/bin/next");
  if (!existsSync(nextBin)) throw new Error(`Next CLI not found at ${nextBin}. Run npm ci before baseline verification.`);
  const baseUrl = `http://127.0.0.1:${port}`;
  const outPath = path.join(os.tmpdir(), `fluxpost-trellis-next-${port}.out.log`);
  const errPath = path.join(os.tmpdir(), `fluxpost-trellis-next-${port}.err.log`);
  const outFd = openSync(outPath, "w");
  const errFd = openSync(errPath, "w");
  const child = spawn(nodeCommand, [nextBin, "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: projectRoot,
    env: process.env,
    stdio: ["ignore", outFd, errFd],
  });

  try {
    console.log(`== Start Next production smoke server on ${baseUrl}`);
    await waitForHttp(`${baseUrl}/api/config`, child, errPath);
    runStep("HTTP smoke", nodeCommand, [".trellis/verification/http_smoke.js", baseUrl]);
  } finally {
    await stopChild(child);
    closeSync(outFd);
    closeSync(errFd);
  }
}

async function waitForHttp(url, child, errorLog) {
  for (let attempt = 0; attempt < 35; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Next smoke server exited before becoming ready. Error log: ${safeRead(errorLog)}`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.status >= 200 && response.status < 500) return;
    } catch {
      // Retry until the bounded startup window expires.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Next smoke server did not become ready at ${url}. Error log: ${safeRead(errorLog)}`);
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

function parseSmokePort(value) {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("TRELLIS_SMOKE_PORT must be an integer between 1024 and 65535.");
  }
  return port;
}

function resolveRelative(relativePath) {
  return path.join(projectRoot, relativePath);
}

function existsRelative(relativePath) {
  return existsSync(resolveRelative(relativePath));
}

function readText(relativePath) {
  return readFileSync(resolveRelative(relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function safeRead(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}
