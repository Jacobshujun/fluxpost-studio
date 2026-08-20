import type { CanvasBatchBindableField, CanvasGraph, CanvasNode, CanvasNodeConfig, CanvasNodeDefinition, CanvasNodeExecutionMode, CanvasNodeType } from "./types";
import { toApis4kImageRatios, toApisImageRatios } from "../toapis-image-api";
import { validateCanvasImageFilenamePrefix } from "./save-images";
import { canvasPromptPresets, canvasVisionPresets, parseCanvasImageSelection, parseCanvasVideoTimestamps, resolveCanvasImageDimensions } from "./node-utils";
import { defaultCanvasSourceVideoProjectName, isCanvasSourceVideoSnapshotCurrent } from "./source-video-contract";
import { feishuPublishModeOptions, normalizeFeishuPublishMode } from "../feishu-publish-mode";
import { validateSeedanceReferenceConfig } from "./seedance-references";
import { canvasSubtitleStyleConfig, defaultCanvasSubtitleStyle, validateCanvasSubtitleStyle } from "./subtitle-style";
import { validateCanvasVideoLoaderConfig } from "./video-loader";

const canvasNodeDefinitionVersions: CanvasNodeDefinition[] = [
  {
    type: "input.text",
    version: 1,
    label: "文字",
    description: "输入提示词、标题或正文。",
    category: "input",
    icon: "Type",
    color: "#3b82f6",
    inputs: [],
    outputs: [{ id: "text", label: "文字", kind: "text" }],
    fields: [{ key: "text", label: "内容", kind: "textarea", placeholder: "输入要传给下游的文字" }],
    defaultConfig: { text: "" },
  },
  {
    type: "input.images",
    version: 1,
    label: "图片",
    description: "引用素材库、TOS 或本地媒体 URL。",
    category: "input",
    icon: "Image",
    color: "#0f9f7f",
    inputs: [],
    outputs: [{ id: "images", label: "图片", kind: "images" }],
    fields: [{ key: "urls", label: "图片 URL", kind: "url-list", placeholder: "每行一个图片 URL" }],
    defaultConfig: { urls: [] },
  },
  {
    type: "input.videos",
    version: 1,
    label: "视频素材",
    description: "引用现有视频作为下游输入。",
    category: "input",
    icon: "Video",
    color: "#e8791c",
    inputs: [],
    outputs: [{ id: "videos", label: "视频", kind: "videos" }],
    fields: [{ key: "urls", label: "视频 URL", kind: "url-list", placeholder: "每行一个视频 URL" }],
    defaultConfig: { urls: [] },
  },
  {
    type: "input.video-loader",
    version: 1,
    label: "视频加载",
    description: "从本地加载视频队列，普通运行输出当前选中的一个视频。",
    category: "input",
    icon: "FileUp",
    color: "#d45d2c",
    inputs: [],
    outputs: [{ id: "videos", label: "当前视频", kind: "videos" }],
    fields: [],
    defaultConfig: { videos: [], selectedVideoId: "" },
  },
  {
    type: "input.source-video",
    version: 1,
    label: "源视频",
    description: "解析链接、写入内容池并冻结可运行的视频快照。",
    category: "input",
    icon: "FileVideo2",
    color: "#c2410c",
    inputs: [],
    outputs: [{ id: "videos", label: "源视频", kind: "videos" }],
    fields: [
      { key: "sourceUrl", label: "源链接", kind: "text", placeholder: "粘贴平台分享链接或直接视频 URL" },
      { key: "projectName", label: "内容池项目", kind: "text", placeholder: defaultCanvasSourceVideoProjectName },
    ],
    defaultConfig: { sourceUrl: "", projectName: defaultCanvasSourceVideoProjectName },
  },
  {
    type: "input.content-pool",
    version: 1,
    label: "内容池素材",
    description: "选择内容池条目并冻结标题、正文和媒体快照。",
    category: "input",
    icon: "Database",
    color: "#2563eb",
    inputs: [],
    outputs: [
      { id: "title", label: "标题", kind: "text" },
      { id: "body", label: "正文", kind: "text" },
      { id: "source", label: "来源", kind: "text" },
      { id: "images", label: "图片", kind: "images" },
      { id: "videos", label: "视频", kind: "videos" },
    ],
    fields: [{ key: "sourceItemId", label: "内容池条目", kind: "content-pool-picker" }],
    defaultConfig: { sourceItemId: "", snapshotAt: "", snapshotTitle: "", snapshotBody: "", snapshotSourceUrl: "", snapshotImageUrls: [], snapshotVideoUrls: [] },
  },
  {
    type: "input.library-images",
    version: 1,
    label: "素材库图片",
    description: "从图片素材库选择并冻结有序图片快照。",
    category: "input",
    icon: "Library",
    color: "#15803d",
    inputs: [],
    outputs: [{ id: "images", label: "图片", kind: "images" }],
    fields: [{ key: "assetIds", label: "素材库图片", kind: "library-image-picker" }],
    defaultConfig: { assetIds: [], assetNames: [], urls: [], snapshotAt: "" },
  },
  {
    type: "input.copy-library",
    version: 1,
    label: "文案库",
    description: "选择文案并冻结标题、正文和标签快照。",
    category: "input",
    icon: "BookOpenText",
    color: "#b45309",
    inputs: [],
    outputs: [
      { id: "title", label: "标题", kind: "text" },
      { id: "body", label: "正文", kind: "text" },
    ],
    fields: [{ key: "entryId", label: "文案库记录", kind: "copy-library-picker" }],
    defaultConfig: { entryId: "", entryTitle: "", snapshotTitle: "", snapshotBody: "", snapshotTags: [], snapshotAt: "" },
  },
  {
    type: "model.gpt-text",
    version: 1,
    label: "GPT 文本",
    description: "基于上游文字和指令生成新文本。",
    category: "model",
    icon: "Sparkles",
    color: "#7c5ce7",
    inputs: [{ id: "prompt", label: "输入", kind: "text", required: true, multiple: true }],
    outputs: [{ id: "text", label: "结果", kind: "text" }],
    fields: [{ key: "instruction", label: "指令", kind: "textarea", placeholder: "例如：改写为小红书正文" }],
    defaultConfig: { instruction: "请根据输入生成适合社交媒体发布的中文内容。" },
    capability: "text_model",
    bypass: { inputPort: "prompt", outputPort: "text" },
  },
  {
    type: "model.gpt-image",
    version: 1,
    label: "GPT-Image-2",
    description: "生成图片或使用参考图编辑。",
    category: "model",
    icon: "WandSparkles",
    color: "#d9467c",
    inputs: [
      { id: "prompt", label: "提示词", kind: "text", required: true, multiple: true },
      { id: "references", label: "参考图", kind: "images", multiple: true },
    ],
    outputs: [{ id: "images", label: "图片", kind: "images" }],
    fields: [
      { key: "count", label: "数量", kind: "number", min: 1, max: 4 },
      {
        key: "size",
        label: "尺寸",
        kind: "select",
        options: [
          { value: "1024x1024", label: "1:1" },
          { value: "1024x1536", label: "2:3" },
          { value: "1536x1024", label: "3:2" },
        ],
      },
      {
        key: "quality",
        label: "质量",
        kind: "select",
        options: [
          { value: "low", label: "低" },
          { value: "medium", label: "中" },
          { value: "high", label: "高" },
        ],
      },
    ],
    defaultConfig: { count: 1, size: "1024x1024", quality: "medium" },
    capability: "image_model",
    bypass: { inputPort: "references", outputPort: "images" },
  },
  {
    type: "model.gpt-vision",
    version: 1,
    label: "视觉理解",
    description: "分析最多 8 张图片并输出可用于下游的文字。",
    category: "model",
    icon: "ScanSearch",
    color: "#9333ea",
    inputs: [
      { id: "images", label: "图片", kind: "images", required: true, multiple: true },
      { id: "instruction", label: "用户提示词", kind: "text", multiple: true },
    ],
    outputs: [{ id: "text", label: "分析结果", kind: "text" }],
    fields: [
      { key: "preset", label: "分析预设", kind: "select", options: Object.keys(canvasVisionPresets).map((value) => ({ value, label: visionPresetLabel(value) })) },
      { key: "instruction", label: "默认节点指令", kind: "textarea", placeholder: "未连接用户提示词时，追加到分析预设" },
      { key: "maxImages", label: "最大图片数", kind: "number", min: 1, max: 8 },
    ],
    defaultConfig: { preset: "describe", instruction: "", maxImages: 8 },
    capability: "text_model",
  },
  {
    type: "model.seedance",
    version: 1,
    label: "Seedance 2.5",
    description: "通过火山方舟 Seedance 2.5 生成或编辑 4-15 秒视频。",
    category: "model",
    icon: "Clapperboard",
    color: "#ef4444",
    inputs: [
      { id: "prompt", label: "外部提示词", kind: "text", multiple: true },
      { id: "images", label: "参考图", kind: "images", multiple: true },
      { id: "videos", label: "参考视频", kind: "videos", multiple: true },
    ],
    outputs: [{ id: "videos", label: "视频", kind: "videos" }],
    fields: [
      { key: "duration", label: "时长（秒）", kind: "number", min: 4, max: 15 },
      {
        key: "ratio",
        label: "比例",
        kind: "select",
        options: ["9:16", "16:9", "1:1", "3:4", "4:3", "21:9"].map((value) => ({ value, label: value })),
      },
      {
        key: "resolution",
        label: "清晰度",
        kind: "select",
        options: [
          { value: "720p", label: "720p" },
          { value: "1080p", label: "1080p" },
        ],
      },
      { key: "generateAudio", label: "生成音频", kind: "boolean" },
      { key: "watermark", label: "添加水印", kind: "boolean" },
      {
        key: "complianceRisk",
        label: "合规风险",
        kind: "select",
        options: [
          { value: "low", label: "低" },
          { value: "medium", label: "中" },
          { value: "high", label: "高（禁止提交）" },
        ],
      },
    ],
    defaultConfig: {
      prompt: "",
      referenceUrls: [],
      mentionIds: [],
      mentionUrls: [],
      duration: 8,
      ratio: "9:16",
      resolution: "720p",
      generateAudio: true,
      watermark: true,
      complianceRisk: "low",
    },
    capability: "video_model",
    bypass: { inputPort: "videos", outputPort: "videos" },
  },
  {
    type: "utility.image-preview",
    version: 1,
    label: "图片预览",
    description: "保留并输出上游最近一次成功图片结果。",
    category: "utility",
    icon: "Images",
    color: "#0d9488",
    inputs: [{ id: "images", label: "图片", kind: "images", required: true }],
    outputs: [{ id: "images", label: "图片", kind: "images" }],
    fields: [],
    defaultConfig: {},
    bypass: { inputPort: "images", outputPort: "images" },
    passiveSink: true,
  },
  {
    type: "utility.save-images",
    version: 1,
    label: "保存图片",
    description: "将上游图片保留为可逐张下载的浏览器结果。",
    category: "utility",
    icon: "Download",
    color: "#0f766e",
    inputs: [{ id: "images", label: "图片", kind: "images", required: true, multiple: true }],
    outputs: [],
    fields: [{ key: "filenamePrefix", label: "文件名前缀", kind: "text", placeholder: "FluxPost" }],
    defaultConfig: { filenamePrefix: "FluxPost" },
    passiveSink: true,
  },
  {
    type: "utility.display-any",
    version: 1,
    label: "展示任何",
    description: "展示任意上游节点的输出内容。",
    category: "utility",
    icon: "Eye",
    color: "#7c3aed",
    inputs: [{ id: "value", label: "任意", kind: "any", required: true }],
    outputs: [],
    fields: [],
    defaultConfig: {},
    passiveSink: true,
  },
  {
    type: "utility.video-reconstruct",
    version: 1,
    label: "视频内容重构",
    description: "保留源视频第一音轨，以单图或循环视频替换画面。",
    category: "utility",
    icon: "RefreshCw",
    color: "#0891b2",
    inputs: [
      { id: "source", label: "源视频", kind: "videos", required: true },
      { id: "replacement", label: "替代画面", kind: "visual", required: true },
    ],
    outputs: [{ id: "videos", label: "重构视频", kind: "videos" }],
    fields: [],
    defaultConfig: {},
    bypass: { inputPort: "source", outputPort: "videos" },
  },
  {
    type: "utility.prompt-template",
    version: 1,
    label: "提示词模板",
    description: "按连接顺序把多路文字填入可复用模板。",
    category: "utility",
    icon: "Braces",
    color: "#475569",
    inputs: [{ id: "values", label: "文字", kind: "text", required: true, multiple: true }],
    outputs: [{ id: "text", label: "提示词", kind: "text" }],
    fields: [
      { key: "preset", label: "预设", kind: "select", options: Object.keys(canvasPromptPresets).map((value) => ({ value, label: promptPresetLabel(value) })) },
      { key: "template", label: "自定义模板", kind: "textarea", placeholder: "使用 {{input}} 或 {{input1}}" },
    ],
    defaultConfig: { preset: "custom", template: "{{input}}" },
    bypass: { inputPort: "values", outputPort: "text" },
  },
  {
    type: "utility.text-concatenate",
    version: 1,
    label: "文本拼接",
    description: "按顺序用指定分隔符合并最多四路文本。",
    category: "utility",
    icon: "Combine",
    color: "#16a34a",
    inputs: [
      { id: "text_a", label: "文本 A", kind: "text" },
      { id: "text_b", label: "文本 B", kind: "text" },
      { id: "text_c", label: "文本 C", kind: "text" },
      { id: "text_d", label: "文本 D", kind: "text" },
    ],
    outputs: [{ id: "text", label: "文字", kind: "text" }],
    fields: [
      { key: "delimiter", label: "分隔符", kind: "text", placeholder: "例如：\\n" },
      { key: "clean_whitespace", label: "清理首尾空白", kind: "boolean" },
    ],
    defaultConfig: { delimiter: ", ", clean_whitespace: false },
  },
  {
    type: "utility.prompt-switch",
    version: 1,
    label: "提示词 Switch",
    description: "按批次策略选择一条生图提示词。",
    category: "utility",
    icon: "GitBranch",
    color: "#0891b2",
    inputs: [
      { id: "scene", label: "场景参考", kind: "text", required: true },
      { id: "sceneModification", label: "场景+改装参考", kind: "text", required: true },
      { id: "scenePerson", label: "场景+人物参考", kind: "text", required: true },
    ],
    outputs: [{ id: "text", label: "提示词", kind: "text" }],
    fields: [{
      key: "strategy",
      label: "当前策略",
      kind: "select",
      options: [
        { value: "scene", label: "场景参考" },
        { value: "scene-modification", label: "场景+改装参考" },
        { value: "scene-person", label: "场景+人物参考" },
      ],
    }],
    defaultConfig: { strategy: "scene" },
  },
  {
    type: "utility.text-split",
    version: 1,
    label: "文本拆分",
    description: "按首行或分隔符拆成首段和剩余文本。",
    category: "utility",
    icon: "Split",
    color: "#64748b",
    inputs: [{ id: "text", label: "文字", kind: "text", required: true }],
    outputs: [{ id: "head", label: "首段", kind: "text" }, { id: "tail", label: "剩余", kind: "text" }],
    fields: [
      { key: "mode", label: "拆分方式", kind: "select", options: [{ value: "first-line", label: "第一行" }, { value: "delimiter", label: "自定义分隔符" }] },
      { key: "delimiter", label: "分隔符", kind: "text", placeholder: "例如：---" },
    ],
    defaultConfig: { mode: "first-line", delimiter: "---" },
  },
  {
    type: "utility.image-select",
    version: 1,
    label: "图片选择",
    description: "按 1 开始的索引筛选并重排图片。",
    category: "utility",
    icon: "ListOrdered",
    color: "#0f766e",
    inputs: [{ id: "images", label: "图片", kind: "images", required: true, multiple: true }],
    outputs: [{ id: "images", label: "图片", kind: "images" }],
    fields: [{ key: "indices", label: "图片序号", kind: "text", placeholder: "1,3,2" }],
    defaultConfig: { indices: "1" },
    bypass: { inputPort: "images", outputPort: "images" },
  },
  {
    type: "utility.image-transform",
    version: 1,
    label: "图片变换",
    description: "本地裁剪、缩放并转换图片格式。",
    category: "utility",
    icon: "Crop",
    color: "#0369a1",
    inputs: [{ id: "images", label: "图片", kind: "images", required: true, multiple: true }],
    outputs: [{ id: "images", label: "图片", kind: "images" }],
    fields: [
      { key: "preset", label: "尺寸预设", kind: "select", options: [{ value: "xiaohongshu", label: "小红书 3:4" }, { value: "square", label: "方图" }, { value: "landscape", label: "横图 16:9" }, { value: "custom", label: "自定义" }] },
      { key: "width", label: "宽度", kind: "number", min: 64, max: 4096 },
      { key: "height", label: "高度", kind: "number", min: 64, max: 4096 },
      { key: "fit", label: "适配", kind: "select", options: [{ value: "cover", label: "裁剪填满" }, { value: "contain", label: "完整包含" }] },
      { key: "format", label: "格式", kind: "select", options: [{ value: "jpeg", label: "JPEG" }, { value: "png", label: "PNG" }, { value: "webp", label: "WebP" }] },
      { key: "quality", label: "质量", kind: "number", min: 1, max: 100 },
    ],
    defaultConfig: { preset: "xiaohongshu", width: 1080, height: 1440, fit: "cover", format: "jpeg", quality: 90 },
    bypass: { inputPort: "images", outputPort: "images" },
  },
  {
    type: "utility.video-frames",
    version: 1,
    label: "视频抽帧",
    description: "按封面、等间隔或指定时间点提取图片。",
    category: "utility",
    icon: "Film",
    color: "#c2410c",
    inputs: [{ id: "videos", label: "视频", kind: "videos", required: true, multiple: true }],
    outputs: [{ id: "images", label: "帧图片", kind: "images" }],
    fields: [
      { key: "mode", label: "抽帧方式", kind: "select", options: [{ value: "cover", label: "封面" }, { value: "even", label: "等间隔" }, { value: "timestamps", label: "指定时间点" }] },
      { key: "coverSeconds", label: "封面秒数", kind: "number", min: 0, max: 86400 },
      { key: "count", label: "每个视频帧数", kind: "number", min: 1, max: 20 },
      { key: "timestamps", label: "时间点（秒）", kind: "text", placeholder: "0.5,2,5" },
      { key: "maxEdge", label: "最长边", kind: "number", min: 320, max: 1920 },
      { key: "quality", label: "JPEG 质量", kind: "number", min: 1, max: 100 },
    ],
    defaultConfig: { mode: "even", coverSeconds: 0.5, count: 4, timestamps: "0.5,2,5", maxEdge: 1920, quality: 90 },
  },
  {
    type: "utility.video-subtitles",
    version: 1,
    label: "视频字幕",
    description: "自动识别视频语音并烧录可配置的硬字幕。",
    category: "utility",
    icon: "Captions",
    color: "#b45309",
    inputs: [{ id: "videos", label: "视频", kind: "videos", required: true }],
    outputs: [
      { id: "videos", label: "字幕视频", kind: "videos" },
      { id: "text", label: "字幕文本", kind: "text" },
    ],
    fields: [
      { key: "fontFamily", label: "字体", kind: "text" },
      { key: "fontSizePercent", label: "字号比例", kind: "number", min: 2, max: 12 },
      { key: "bold", label: "粗体", kind: "boolean" },
      { key: "textColor", label: "文字颜色", kind: "text" },
      { key: "outlineColor", label: "描边颜色", kind: "text" },
      { key: "outlineWidthPercent", label: "描边宽度", kind: "number", min: 0, max: 1.5 },
      { key: "backgroundEnabled", label: "背景", kind: "boolean" },
      { key: "backgroundColor", label: "背景颜色", kind: "text" },
      { key: "backgroundOpacity", label: "背景不透明度", kind: "number", min: 0, max: 100 },
      { key: "verticalPosition", label: "垂直位置", kind: "select", options: [{ value: "top", label: "顶部" }, { value: "middle", label: "居中" }, { value: "bottom", label: "底部" }] },
      { key: "horizontalAlign", label: "水平对齐", kind: "select", options: [{ value: "left", label: "左对齐" }, { value: "center", label: "居中" }, { value: "right", label: "右对齐" }] },
      { key: "verticalMarginPercent", label: "垂直边距", kind: "number", min: 0, max: 30 },
      { key: "maxCharsPerLine", label: "每行最大字数", kind: "number", min: 8, max: 30 },
    ],
    defaultConfig: canvasSubtitleStyleConfig(defaultCanvasSubtitleStyle),
    capability: "text_model",
    bypass: { inputPort: "videos", outputPort: "videos" },
  },
  {
    type: "compose.social-post",
    version: 1,
    label: "内容组装",
    description: "把标题、正文和媒体组装为可审核内容。",
    category: "compose",
    icon: "PanelsTopLeft",
    color: "#64748b",
    inputs: [
      { id: "title", label: "标题", kind: "text" },
      { id: "body", label: "正文", kind: "text", required: true },
      { id: "vehicle", label: "车型", kind: "text" },
      { id: "images", label: "图片", kind: "images", multiple: true },
      { id: "videos", label: "视频", kind: "videos", multiple: true },
    ],
    outputs: [{ id: "post", label: "内容", kind: "socialPost" }],
    fields: [{ key: "fallbackTitle", label: "默认标题", kind: "text", placeholder: "上游未连接标题时使用" }],
    defaultConfig: { fallbackTitle: "画布生成内容" },
  },
  {
    type: "publish.feishu",
    version: 1,
    label: "飞书发布",
    description: "将组装内容加入现有飞书发布队列。",
    category: "publish",
    icon: "Send",
    color: "#155eef",
    inputs: [{ id: "post", label: "内容", kind: "socialPost", required: true }],
    outputs: [{ id: "job", label: "发布任务", kind: "publishJobRef" }],
    fields: [],
    defaultConfig: {},
    capability: "external_write",
  },
];

const gptImageV2Definition: CanvasNodeDefinition = {
  type: "model.gpt-image",
  version: 2,
  label: "GPT-Image-2",
  description: "通用多图生成与编辑，最多 16 张参考图片。",
  category: "model",
  icon: "WandSparkles",
  color: "#d9467c",
  inputs: [
    { id: "prompt", label: "提示词", kind: "text", required: true, multiple: true },
    { id: "references", label: "参考图片", kind: "images", multiple: true },
  ],
  outputs: [{ id: "images", label: "图片", kind: "images" }],
  fields: [
    { key: "ratio", label: "比例", kind: "select", options: toApisImageRatios.map((value) => ({ value, label: value })) },
    { key: "resolution", label: "分辨率", kind: "select", options: ["1k", "2k", "4k"].map((value) => ({ value, label: value.toUpperCase() })) },
    { key: "quality", label: "质量", kind: "select", options: ["low", "medium", "high"].map((value) => ({ value, label: value })) },
    { key: "count", label: "输出数量", kind: "number", min: 1, max: 10 },
    { key: "outputFormat", label: "格式", kind: "select", options: [{ value: "png", label: "PNG" }, { value: "jpeg", label: "JPEG" }] },
    { key: "outputCompression", label: "JPEG 压缩", kind: "number", min: 0, max: 100 },
  ],
  defaultConfig: {
    referenceUrls: [],
    ratio: "1:1",
    resolution: "1k",
    quality: "medium",
    count: 1,
    outputFormat: "png",
    outputCompression: 100,
  },
  capability: "image_model",
  bypass: { inputPort: "references", outputPort: "images" },
};

const promptSwitchV2Definition: CanvasNodeDefinition = {
  type: "utility.prompt-switch",
  version: 2,
  label: "提示词 Switch",
  description: "从三路文字节点中选择一路生图提示词。",
  category: "utility",
  icon: "GitBranch",
  color: "#0891b2",
  inputs: [
    { id: "input1", label: "输入 1", kind: "text", required: true },
    { id: "input2", label: "输入 2", kind: "text", required: true },
    { id: "input3", label: "输入 3", kind: "text", required: true },
  ],
  outputs: [{ id: "text", label: "提示词", kind: "text" }],
  fields: [{
    key: "selectedInput",
    label: "选择输入",
    kind: "select",
    options: [
      { value: "1", label: "输入 1" },
      { value: "2", label: "输入 2" },
      { value: "3", label: "输入 3" },
    ],
  }],
  defaultConfig: { selectedInput: "1" },
};

const textSplitV2Definition: CanvasNodeDefinition = {
  type: "utility.text-split",
  version: 2,
  label: "文本分割",
  description: "按第一行或指定的第 N 个分隔符拆出标题和正文。",
  category: "utility",
  icon: "Split",
  color: "#64748b",
  inputs: [{ id: "text", label: "文字", kind: "text", required: true }],
  outputs: [{ id: "head", label: "标题", kind: "text" }, { id: "tail", label: "正文", kind: "text" }],
  fields: [
    { key: "mode", label: "分割方式", kind: "select", options: [{ value: "first-line", label: "第一行" }, { value: "delimiter", label: "自定义分隔符" }] },
    { key: "delimiter", label: "分隔符", kind: "text", placeholder: "例如：---" },
    { key: "delimiterIndex", label: "第几个分隔符", kind: "number", min: 1 },
  ],
  defaultConfig: { mode: "first-line", delimiter: "---", delimiterIndex: 1 },
};

const feishuPublishV2Definition: CanvasNodeDefinition = {
  type: "publish.feishu",
  version: 2,
  label: "飞书发布",
  description: "按所选内容类别加入现有飞书发布队列。",
  category: "publish",
  icon: "Send",
  color: "#155eef",
  inputs: [{ id: "post", label: "内容", kind: "socialPost", required: true }],
  outputs: [{ id: "job", label: "发布任务", kind: "publishJobRef" }],
  fields: [{ key: "publishMode", label: "写入模式", kind: "select", options: [...feishuPublishModeOptions] }],
  defaultConfig: { publishMode: "full" },
  capability: "external_write",
};

export const canvasNodeDefinitions = canvasNodeDefinitionVersions.map((definition) =>
  definition.type === "model.gpt-image"
    ? gptImageV2Definition
    : definition.type === "utility.prompt-switch"
      ? promptSwitchV2Definition
    : definition.type === "utility.text-split"
      ? textSplitV2Definition
    : definition.type === "publish.feishu"
      ? feishuPublishV2Definition
      : definition,
);

const definitionMap = new Map(canvasNodeDefinitions.map((definition) => [definition.type, definition]));
const definitionVersionMap = new Map(
  [...canvasNodeDefinitionVersions, gptImageV2Definition, promptSwitchV2Definition, textSplitV2Definition, feishuPublishV2Definition].map((definition) => [`${definition.type}@${definition.version}`, definition]),
);

export function getCanvasNodeDefinition(type: CanvasNodeType, version?: number) {
  return version === undefined ? definitionMap.get(type) : definitionVersionMap.get(`${type}@${version}`);
}

export function getCanvasBatchBindableFields(node: Pick<CanvasNode, "type" | "version">): CanvasBatchBindableField[] {
  const definition = getCanvasNodeDefinition(node.type, node.version);
  if (!definition) return [];
  if (node.type === "input.video-loader") {
    return [{ key: "videos", label: "视频队列", parameterTypes: ["video"], adapter: "video-input" }];
  }
  return definition.fields.flatMap((field): CanvasBatchBindableField[] => {
    if (node.type === "input.source-video" && field.key === "sourceUrl") {
      return [{ key: field.key, label: field.label, parameterTypes: ["source-video"], adapter: "source-video-input" }];
    }
    if (node.type === "input.library-images" && field.key === "assetIds") {
      return [{ key: field.key, label: field.label, parameterTypes: ["image", "image-group"], adapter: "image-input" }];
    }
    if (node.type === "input.images" && field.key === "urls") {
      return [{ key: field.key, label: field.label, parameterTypes: ["image", "image-group"], adapter: "image-input" }];
    }
    if (node.type === "input.copy-library" && field.key === "entryId") {
      return [{ key: field.key, label: field.label, parameterTypes: ["copy"], adapter: "copy-input" }];
    }
    if (field.kind === "text" || field.kind === "textarea") {
      return [{ key: field.key, label: field.label, parameterTypes: ["text"], adapter: "config-value" }];
    }
    if (field.kind === "number") {
      return [{ key: field.key, label: field.label, parameterTypes: ["number"], adapter: "config-value" }];
    }
    if (field.kind === "boolean") {
      return [{ key: field.key, label: field.label, parameterTypes: ["boolean"], adapter: "config-value" }];
    }
    if (field.kind === "select") {
      return [{ key: field.key, label: field.label, parameterTypes: ["enum"], adapter: "config-value" }];
    }
    return [];
  });
}

export function createCanvasNode(type: CanvasNodeType, id: string, position: { x: number; y: number }): CanvasNode {
  const definition = getCanvasNodeDefinition(type);
  if (!definition) throw new Error(`Unknown canvas node type: ${type}`);
  return {
    id,
    type,
    version: definition.version,
    position,
    config: structuredClone(definition.defaultConfig),
    executionMode: "enabled",
  };
}

export function getCanvasNodeExecutionMode(node: Pick<CanvasNode, "executionMode">): CanvasNodeExecutionMode {
  return node.executionMode === "bypass" || node.executionMode === "disabled" ? node.executionMode : "enabled";
}

export function validateCanvasNodeConfig(type: CanvasNodeType, config: CanvasNodeConfig, version?: number) {
  const definition = getCanvasNodeDefinition(type, version);
  if (!definition) return [`Unknown canvas node type: ${type}`];
  const errors: string[] = [];
  for (const field of definition.fields) {
    if (type === "utility.text-split" && field.key === "delimiterIndex" && config.mode !== "delimiter") continue;
    const value = config[field.key];
    if (field.kind === "number") {
      const number = Number(value);
      if (!Number.isFinite(number)) errors.push(`${definition.label}: ${field.label} must be a number.`);
      if (field.min !== undefined && number < field.min) errors.push(`${definition.label}: ${field.label} must be at least ${field.min}.`);
      if (field.max !== undefined && number > field.max) errors.push(`${definition.label}: ${field.label} must be at most ${field.max}.`);
    }
    if (field.kind === "select" && value !== undefined && !field.options?.some((option) => option.value === value)) {
      errors.push(`${definition.label}: ${field.label} is invalid.`);
    }
    if (field.kind === "url-list" && value !== undefined && !Array.isArray(value)) {
      errors.push(`${definition.label}: ${field.label} must be a URL list.`);
    }
    if (field.kind === "boolean" && typeof value !== "boolean") {
      errors.push(`${definition.label}: ${field.label} must be a boolean.`);
    }
  }
  if (type === "input.text" && !String(config.text || "").trim()) errors.push("文字节点内容不能为空。");
  if ((type === "input.images" || type === "input.videos") && !normalizeUrlList(config.urls).length) {
    errors.push(`${definition.label}至少需要一个 URL。`);
  }
  if (type === "input.video-loader") errors.push(...validateCanvasVideoLoaderConfig(config));
  if (type === "input.source-video") {
    if (!String(config.sourceUrl || "").trim()) errors.push("源视频链接不能为空。");
    if (!String(config.projectName || "").trim()) errors.push("源视频内容池项目不能为空。");
    if (!isCanvasSourceVideoSnapshotCurrent(config)) errors.push("源视频尚未解析，或冻结快照已失效。");
  }
  if (type === "model.gpt-text" && !String(config.instruction || "").trim()) errors.push("GPT 文本节点指令不能为空。");
  if (type === "input.content-pool") {
    if (!String(config.sourceItemId || "").trim()) errors.push("Content-pool input requires a selected source item.");
    const hasSnapshot = [config.snapshotTitle, config.snapshotBody, config.snapshotSourceUrl].some((value) => String(value || "").trim())
      || normalizeUrlList(config.snapshotImageUrls).length
      || normalizeUrlList(config.snapshotVideoUrls).length;
    if (!hasSnapshot) errors.push("Content-pool input snapshot is empty.");
  }
  if (type === "input.library-images") {
    const urls = normalizeUrlList(config.urls);
    if (!urls.length) errors.push("Library image input requires at least one selected image.");
    if (urls.length > 30) errors.push("Library image input accepts at most 30 images.");
  }
  if (type === "input.copy-library") {
    if (!String(config.entryId || "").trim()) errors.push("Copy-library input requires a selected entry.");
    if (!String(config.snapshotTitle || "").trim()) errors.push("Copy-library input title snapshot is empty.");
    if (!String(config.snapshotBody || "").trim()) errors.push("Copy-library input body snapshot is empty.");
    if (!String(config.snapshotAt || "").trim()) errors.push("Copy-library input snapshot time is missing.");
  }
  if (type === "utility.prompt-template" && config.preset === "custom" && !String(config.template || "").trim()) {
    errors.push("Custom prompt template cannot be empty.");
  }
  if (type === "utility.prompt-switch" && version === 1 && !["scene", "scene-modification", "scene-person"].includes(String(config.strategy || ""))) {
    errors.push("Prompt Switch strategy is invalid.");
  }
  if (type === "utility.prompt-switch" && version !== 1 && !["1", "2", "3"].includes(String(config.selectedInput || ""))) {
    errors.push("Prompt Switch selected input is invalid.");
  }
  if (type === "utility.text-split" && config.mode === "delimiter" && !String(config.delimiter || "")) {
    errors.push("Text split delimiter cannot be empty.");
  }
  if (type === "utility.text-split" && version === 2 && config.mode === "delimiter") {
    const delimiterIndex = Number(config.delimiterIndex);
    if (!Number.isInteger(delimiterIndex) || delimiterIndex < 1) errors.push("Text split delimiter index must be a positive integer.");
  }
  if (type === "utility.image-select") {
    try { parseCanvasImageSelection(config.indices); } catch (error) { errors.push(error instanceof Error ? error.message : "Image selection is invalid."); }
  }
  if (type === "utility.image-transform") {
    try { resolveCanvasImageDimensions(config); } catch (error) { errors.push(error instanceof Error ? error.message : "Image transform dimensions are invalid."); }
  }
  if (type === "utility.video-frames") {
    try { parseCanvasVideoTimestamps(config); } catch (error) { errors.push(error instanceof Error ? error.message : "Video frame settings are invalid."); }
  }
  if (type === "utility.video-subtitles") errors.push(...validateCanvasSubtitleStyle(config));
  if (type === "utility.save-images") {
    const prefixError = validateCanvasImageFilenamePrefix(config.filenamePrefix);
    if (prefixError) errors.push(prefixError);
  }
  if (type === "publish.feishu" && version !== 1) {
    try { normalizeFeishuPublishMode(config.publishMode); } catch (error) { errors.push(error instanceof Error ? error.message : "Feishu publish mode is invalid."); }
  }
  if (type === "model.gpt-image" && definition.version === 2) {
    const referenceUrls = normalizeUrlList(config.referenceUrls);
    if (referenceUrls.length > 16) errors.push("GPT-Image-2 direct reference images cannot exceed 16.");
    if (config.resolution === "4k" && !toApis4kImageRatios.includes(String(config.ratio) as (typeof toApis4kImageRatios)[number])) {
      errors.push(`GPT-Image-2 4K does not support ratio ${String(config.ratio)}.`);
    }
    if (config.outputFormat === "jpeg") {
      const compression = Number(config.outputCompression);
      if (!Number.isInteger(compression) || compression < 0 || compression > 100) errors.push("GPT-Image-2 JPEG compression must be an integer from 0 to 100.");
    }
  }
  if (type === "model.seedance") {
    errors.push(...validateSeedanceReferenceConfig(config));
    if (config.complianceRisk === "high") errors.push("Seedance 高合规风险任务禁止提交。");
  }
  return errors;
}

export function upgradeCanvasNode(node: CanvasNode): CanvasNode {
  if (node.type === "publish.feishu" && node.version === 1) {
    return {
      ...structuredClone(node),
      version: 2,
      executionMode: getCanvasNodeExecutionMode(node),
      config: { ...structuredClone(node.config), publishMode: "full" },
    };
  }
  if (node.type === "utility.prompt-switch" && node.version === 1) {
    const selectedInput = node.config.strategy === "scene-modification" ? "2" : node.config.strategy === "scene-person" ? "3" : "1";
    return {
      ...structuredClone(node),
      version: 2,
      executionMode: getCanvasNodeExecutionMode(node),
      config: { ...promptSwitchV2Definition.defaultConfig, selectedInput },
    };
  }
  if (node.type === "utility.text-split" && node.version === 1) {
    return {
      ...structuredClone(node),
      version: 2,
      executionMode: getCanvasNodeExecutionMode(node),
      config: {
        ...textSplitV2Definition.defaultConfig,
        ...structuredClone(node.config),
        delimiterIndex: 1,
      },
    };
  }
  if (node.type !== "model.gpt-image" || node.version !== 1) {
    return { ...structuredClone(node), executionMode: getCanvasNodeExecutionMode(node) };
  }
  const dimensions = legacyGptImageSize(String(node.config.size || "1024x1024"));
  return {
    ...structuredClone(node),
    version: 2,
    executionMode: getCanvasNodeExecutionMode(node),
    config: {
      ...gptImageV2Definition.defaultConfig,
      count: Math.min(10, Math.max(1, Number(node.config.count || 1))),
      quality: node.config.quality === "low" || node.config.quality === "high" ? node.config.quality : "medium",
      ratio: dimensions.ratio,
      resolution: dimensions.resolution,
    },
  };
}

export function upgradeCanvasGraph(graph: CanvasGraph): CanvasGraph {
  const cloned = structuredClone(graph);
  const legacySwitchIds = new Set(cloned.nodes
    .filter((node) => node.type === "utility.prompt-switch" && node.version === 1)
    .map((node) => node.id));
  const legacyPorts: Record<string, string> = {
    scene: "input1",
    sceneModification: "input2",
    scenePerson: "input3",
  };
  return {
    ...cloned,
    nodes: cloned.nodes.map(upgradeCanvasNode),
    edges: cloned.edges.map((edge) => legacySwitchIds.has(edge.target)
      ? { ...edge, targetPort: legacyPorts[edge.targetPort] || edge.targetPort }
      : edge),
  };
}

function legacyGptImageSize(size: string) {
  const mapped: Record<string, { ratio: string; resolution: "1k" | "2k" | "4k" }> = {
    "1024x1024": { ratio: "1:1", resolution: "1k" },
    "1024x1536": { ratio: "2:3", resolution: "1k" },
    "1536x1024": { ratio: "3:2", resolution: "1k" },
    "2048x2048": { ratio: "1:1", resolution: "2k" },
    "2048x1152": { ratio: "16:9", resolution: "2k" },
    "1152x2048": { ratio: "9:16", resolution: "2k" },
    "3840x2160": { ratio: "16:9", resolution: "4k" },
    "2160x3840": { ratio: "9:16", resolution: "4k" },
  };
  return mapped[size] || { ratio: "1:1", resolution: "1k" as const };
}

export function normalizeUrlList(value: CanvasNodeConfig[string]) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\r?\n/) : [];
  return Array.from(new Set(values.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)));
}

function promptPresetLabel(value: string) {
  return ({ custom: "自定义", title: "标题生成", body: "正文改写", image_prompt: "图片提示词", video_storyboard: "视频分镜" } as Record<string, string>)[value] || value;
}

function visionPresetLabel(value: string) {
  return ({ describe: "图片描述", selling_points: "卖点提取", composition: "构图分析", ocr: "OCR 识别", image_prompt: "图片提示词" } as Record<string, string>)[value] || value;
}
