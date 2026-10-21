import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const projectRoot = process.cwd();
const efforts = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];
const requests = [];

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function loadTsModule(relativePath, requireMap = {}, sandboxExtras = {}) {
  const sourcePath = path.join(projectRoot, relativePath);
  const transpiled = ts.transpileModule(read(relativePath), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  });
  const cjsModule = { exports: {} };
  vm.runInNewContext(
    transpiled.outputText,
    {
      Buffer,
      URL,
      process: { env: {} },
      console,
      module: cjsModule,
      exports: cjsModule.exports,
      setTimeout,
      clearTimeout,
      ...sandboxExtras,
      require: (name) => {
        if (Object.hasOwn(requireMap, name)) return requireMap[name];
        throw new Error(`Unexpected import in ${relativePath}: ${name}`);
      },
    },
    { filename: sourcePath },
  );
  return cjsModule.exports;
}

function makeResponse(endpoint, text) {
  return {
    ok: true,
    status: 200,
    async json() {
      return endpoint === "chat"
        ? { choices: [{ message: { content: text } }] }
        : { output_text: text };
    },
    async text() {
      return text;
    },
  };
}

function installFetch(endpoint) {
  requests.length = 0;
  return async (url, options = {}) => {
    const body = JSON.parse(String(options.body || "{}"));
    requests.push({ url: String(url), body });
    return makeResponse(endpoint, JSON.stringify({
      title: "fixture title",
      body: "fixture body",
      imagePrompt: "",
      aiNotes: [],
      riskScore: 10,
      categoryIds: [],
      reasons: [],
      distribution: "可分发",
      score: 80,
      prediction: "可测试",
      confidence: 0.8,
      riskTags: [],
      contentTags: [],
      visualTags: [],
      frames: [{ id: "frame-1", aestheticScore: 80, clarityScore: 80, compositionScore: 80, contentValueScore: 80, usableForPost: true }],
      imageType: "photo",
      shotSize: "wide",
      vehiclePart: "full_vehicle",
      angle: "front",
      composition: "wide composition",
      hasPeople: false,
      hasText: false,
      colorPalette: "neutral",
      recommendedStrategy: "car_reference",
      stylePrompt: "clean automotive photo",
      aestheticKeywords: [],
    }));
  };
}

const textReasoning = loadTsModule("src/lib/text-reasoning.ts");
assert.deepEqual(
  [...textReasoning.textReasoningEffortValues],
  ["default", ...efforts],
  "The reasoning effort enum must include the provider default and every supported effort.",
);
assert.deepEqual(JSON.parse(JSON.stringify(textReasoning.buildTextReasoningRequest("responses", "default"))), {});
assert.deepEqual(JSON.parse(JSON.stringify(textReasoning.buildTextReasoningRequest("chat", "default"))), {});
assert.throws(() => textReasoning.normalizeTextReasoningEffort("invalid"), /OPENAI_TEXT_REASONING_EFFORT/);
for (const effort of efforts) {
  assert.deepEqual(
    JSON.parse(JSON.stringify(textReasoning.buildTextReasoningRequest("responses", effort))),
    { reasoning: { effort } },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(textReasoning.buildTextReasoningRequest("chat", effort))),
    { reasoning_effort: effort },
  );
}

const activityLog = {
  compactError: (error) => (error instanceof Error ? error.message : String(error)),
  recordExecutionLog: async () => undefined,
};
const concurrency = {
  concurrencyConfig: { gpt: 4 },
  mapWithConcurrency: async (items, _limit, mapper) => Promise.all(items.map(mapper)),
  runWithConcurrencyPool: async (_pool, task) => task(),
};
const contentSafetyPolicy = loadTsModule("src/lib/content-safety-policy.ts", {
  "./activity-log": activityLog,
  "./database": {
    compareAndSetAppMetaValue: async () => true,
    readAppMetaValue: async () => undefined,
  },
});
const modelImageInput = {
  toModelImageUrl: async (url) => `data:image/png;base64,${Buffer.from(url).toString("base64")}`,
};

for (const endpoint of ["responses", "chat"]) {
  for (const effort of ["default", ...efforts]) {
    const fetchMock = installFetch(endpoint);
    const config = {
      appConfig: {
        openaiApiKey: "test-key",
        openaiTextEndpoint: endpoint,
        openaiTextModel: "text-model",
        openaiLibraryTaggingModel: "library-model",
        openaiTextReasoningEffort: effort,
        feishuCliBin: "fixture-feishu",
        feishuAppId: "fixture-app",
        feishuAppSecret: "fixture-secret",
        feishuDistributionCheckBaseToken: "fixture-base",
        feishuDistributionCheckTableId: "fixture-table",
        feishuDistributionCheckFieldMap: "",
      },
      openaiTextUrl: (suffix) => `https://openai.example.invalid/${suffix}`,
    };
    const common = {
      "./activity-log": activityLog,
      "./config": config,
      "./concurrency": concurrency,
      "./text-reasoning": textReasoning,
      "./types": {},
    };
    const openai = loadTsModule("src/lib/openai.ts", {
      ...common,
      "./creation-controls": { formatImageTasksForPrompt: () => "" },
      "./finished-body-policy": loadTsModule("src/lib/finished-body-policy.ts"),
      "./mock-data": {},
      "./model-image-input": modelImageInput,
      "./source-video-reference": { resolveSourceVideoUrls: () => [] },
      "./title-guard": {
        clampGeneratedTitleMax: (value) => value,
        countVisibleTitleChars: (value) => Array.from(value).length,
        formatTitleStrategyInstruction: () => "",
        formatTitleStyleInstruction: () => "",
        isGeneratedTitleLengthValid: () => true,
        normalizeGeneratedTitle: (value) => value,
        pickTitleLengthProfile: () => ({ label: "test", min: 1, max: 30 }),
        truncateFinishedBody: (value) => value,
      },
    }, { fetch: fetchMock });

    await openai.callOpenAIForJson("fixture prompt");
    assertRequest("common text", endpoint, effort, requests.at(-1));
    assert.equal(requests.at(-1).body.model, "text-model");
    assertPreservedFields(endpoint, requests.at(-1).body);

    await openai.callOpenAIForVisionText("fixture vision prompt", ["https://example.invalid/image.png"]);
    assertRequest("vision text", endpoint, effort, requests.at(-1));
    assertPreservedFields(endpoint, requests.at(-1).body, { vision: true, visionRequest: true });

    const sourceTagging = loadTsModule("src/lib/source-tagging.ts", {
      ...common,
      "./media-url-filter": {},
      "./model-image-input": modelImageInput,
      "./video-frame-policy": {},
    }, { fetch: fetchMock });
    await sourceTagging.callTaggingModel(
      "fixture tagging prompt",
      [{ id: "image-1", imageUrl: "data:image/png;base64,AA==" }],
      "library-model",
    );
    assertRequest("source/library tagging", endpoint, effort, requests.at(-1));
    assert.equal(requests.at(-1).body.model, "library-model", "reference-library tagging must keep its independent model");

    const sourceSafety = loadTsModule("src/lib/source-safety.ts", {
      ...common,
      "./content-safety-policy": contentSafetyPolicy,
    }, { fetch: fetchMock });
    await sourceSafety.assessSourceSafety(
      {
        id: "source-1",
        sourceId: "source-1",
        platform: "douyin",
        mediaType: "text",
        title: "fixture",
        contentText: "fixture content",
        images: [],
        mediaUrls: [],
        metrics: {},
        raw: {},
      },
      undefined,
      { forceModel: true },
    );
    assertRequest("source safety", endpoint, effort, requests.at(-1));

    const videoFrameReview = loadTsModule("src/lib/video-frame-review.ts", {
      ...common,
      "./model-image-input": modelImageInput,
    }, { fetch: fetchMock });
    await videoFrameReview.reviewVideoFramesWithAi([
      {
        id: "frame-1",
        url: "https://example.invalid/frame.png",
        timestamp: 1,
        score: 80,
        type: "cover",
        reason: "fixture",
        qualityScore: 80,
      },
    ]);
    assertRequest("video frame review", endpoint, effort, requests.at(-1));

    const viralReplication = loadTsModule("src/lib/viral-replication.ts", {
      ...common,
      "node:fs/promises": { stat: async () => ({ isFile: () => true }) },
      "node:path": path,
      "./creation-controls": {},
      "./model-image-input": modelImageInput,
      "./openai": { generatePost: async () => ({}) },
      "./source-link-import": { resolveSourceLinks: async () => ({ items: [], results: [] }) },
    }, { fetch: fetchMock });
    await viralReplication.analyzeViralImages(["https://example.invalid/viral.png"]);
    assertRequest("viral image analysis", endpoint, effort, requests.at(-1));

    let distributionCliCalls = 0;
    const distributionCheck = loadTsModule("src/lib/distribution-check.ts", {
      ...common,
      "node:crypto": { randomUUID: () => "fixture-uuid" },
      "node:child_process": {
        execFile: (_file, _args, _options, callback) => {
          distributionCliCalls += 1;
          const stdout = distributionCliCalls === 1
            ? JSON.stringify([
                { field_name: "编号", type: "text" },
                { field_name: "动态标题", type: "text" },
                { field_name: "动态正文", type: "text" },
                { field_name: "动态素材", type: "attachment" },
                { field_name: "车型", type: "text" },
                { field_name: "是否分发", type: "single_select" },
                { field_name: "内容评分", type: "number" },
              ])
            : distributionCliCalls === 2
              ? JSON.stringify([{ record_id: "recFixture1", fields: { 编号: "fixture-1", 动态标题: "fixture title", 动态正文: "fixture body", 车型: "fixture model" } }])
              : "{}";
          callback(null, stdout, "");
          return { on: () => undefined };
        },
      },
      "node:util": {
        promisify: (value) => (...args) => new Promise((resolve, reject) => {
          value(...args, (error, stdout, stderr) => error ? reject(error) : resolve({ stdout, stderr }));
        }),
      },
      "./database": {},
      "./distribution-check-prompt": { defaultDistributionCheckPrompt: "fixture distribution prompt" },
      "./feishu-cli": {
        ensureConfiguredFeishuCliIdentity: async () => undefined,
        resolveFeishuCliInvocation: () => ({ file: "feishu", argsPrefix: [] }),
      },
      "./workspace-ownership": { filterWorkspaceOwnedRecords: (value) => value },
    }, { fetch: fetchMock });
    await distributionCheck.runDistributionCheck("fixture-1");
    assertRequest("distribution check", endpoint, effort, requests.at(-1));
  }
}

function assertRequest(label, endpoint, effort, request) {
  assert.ok(request, `${label} must send a request`);
  assert.equal(
    request.url,
    endpoint === "chat" ? "https://openai.example.invalid/chat/completions" : "https://openai.example.invalid/responses",
  );
  if (effort === "default") {
    assert.ok(!("reasoning" in request.body), `${label} default must omit reasoning`);
    assert.ok(!("reasoning_effort" in request.body), `${label} default must omit reasoning_effort`);
    return;
  }
  if (endpoint === "chat") {
    assert.equal(request.body.reasoning_effort, effort, `${label} must send chat reasoning_effort`);
    assert.ok(!("reasoning" in request.body), `${label} chat must not send Responses reasoning`);
  } else {
    assert.deepEqual(
      JSON.parse(JSON.stringify(request.body.reasoning)),
      { effort },
      `${label} must send Responses reasoning.effort`,
    );
    assert.ok(!("reasoning_effort" in request.body), `${label} Responses must not send chat reasoning_effort`);
  }
}

function assertPreservedFields(endpoint, body, options = {}) {
  if (endpoint === "chat") {
    assert.ok(Array.isArray(body.messages), "Chat requests must retain messages");
    if (!options.visionRequest) {
      assert.deepEqual(JSON.parse(JSON.stringify(body.response_format)), { type: "json_object" });
    }
  } else if (options.visionRequest) {
    assert.ok("input" in body, "Responses vision requests must retain input");
  } else {
    assert.ok("input" in body, "Responses requests must retain input");
    assert.deepEqual(JSON.parse(JSON.stringify(body.text)), { format: { type: "json_object" } });
  }
  if (options.vision) {
    const content = endpoint === "chat" ? body.messages.at(-1)?.content : body.input?.[0]?.content;
    assert.ok(Array.isArray(content) && content.some((part) => part.type === "image_url" || part.type === "input_image"));
  }
}

console.log("Text reasoning effort config and all text request contracts passed (offline mocks).");
