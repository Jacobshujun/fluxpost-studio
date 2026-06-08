export type Platform = "wechat_channels" | "xiaohongshu" | "douyin" | "weibo";

export type CrawlStatus = "queued" | "running" | "completed" | "failed" | "needs_config";

export type ReviewStatus = "draft" | "editing" | "approved" | "published";

export type BatchProductionStatus = "queued" | "running" | "completed" | "partial" | "failed";

export type ProductionTaskStatus = "queued" | "running" | "completed" | "failed" | "skipped";

export type SourceUsageStatus = "new" | "analyzed" | "rewritten" | "approved" | "published";

export type ExecutionLogStatus = "running" | "success" | "error" | "info";

export type SimpleRunStatus = "queued" | "running" | "completed" | "partial" | "failed";

export type SimpleRunQueueStatus = "queued" | "running" | "completed" | "failed";

export type SimpleRunStageId = "crawl" | "tag" | "produce" | "publish";

export type SimpleRunStageStatus = "queued" | "running" | "success" | "warning" | "error" | "skipped";

export const contentTagOptions = [
  "民族情绪",
  "车圈吃瓜",
  "实测试驾",
  "美女车图",
  "竞品对比",
  "选车建议",
  "价格标签",
  "经验干货",
  "新车曝光",
  "问车咨询",
  "参数解读",
] as const;

export const visualTagOptions = ["内饰空间", "汽车外观", "带文字图", "人车美图"] as const;

export type ContentTag = (typeof contentTagOptions)[number];

export type VisualTag = (typeof visualTagOptions)[number];

export type SourceTaggingStatus = "pending" | "success" | "failed" | "skipped";

export type SourceSafetyDecision = "allow" | "review" | "filter";

export type SourceSafetyCategory =
  | "profanity"
  | "insult"
  | "strong_negative_sentiment"
  | "competitor_bashing";

export type SourceSafetySeverity = "low" | "medium" | "high";

export type SourceSafetyAssessment = {
  decision: SourceSafetyDecision;
  categories: SourceSafetyCategory[];
  severity: SourceSafetySeverity;
  confidence?: number;
  reasons: string[];
  model?: string;
  status: SourceTaggingStatus;
  source: "local" | "model" | "local_model";
  error?: string;
  assessedAt?: string;
};

export type SourceContentTagging = {
  tags: ContentTag[];
  confidence?: number;
  reasons: string[];
  model?: string;
  taggedAt?: string;
  status: SourceTaggingStatus;
  error?: string;
  updatedBy?: "ai" | "user";
  updatedAt?: string;
};

export type SourceVisualTaggingAsset = {
  id: string;
  index: number;
  kind: "image" | "video_frame";
  url: string;
  localPath?: string;
  tag: VisualTag;
  confidence?: number;
  reason?: string;
  model?: string;
  taggedAt?: string;
  updatedBy?: "ai" | "user";
  updatedAt?: string;
};

export type SourceVisualTagging = {
  assets: SourceVisualTaggingAsset[];
  model?: string;
  taggedAt?: string;
  status: SourceTaggingStatus;
  error?: string;
};

export type ExecutionLogEntry = {
  id: string;
  createdAt: string;
  scope: string;
  action: string;
  status: ExecutionLogStatus;
  message: string;
  durationMs?: number;
  details?: Record<string, string | number | boolean | null>;
};

export type ViralAnalysis = {
  hook: string;
  angle: string;
  structure: string;
  emotion: string;
  rewriteDirection: string;
  visualSuggestion: string;
  risk: string;
  keywords: string[];
};

export type ContentDirection = "industry" | "competitor" | "xpeng" | "unknown";

export type ProductionDecision = "adopt" | "observe_only" | "needs_review";

export type TextProductionStrategy =
  | "source_rewrite"
  | "xpeng_original_from_materials"
  | "creative_reframe_with_xpeng"
  | "video_extract_rewrite"
  | "not_adopt";

export type ImageProductionStrategy =
  | "use_source_image"
  | "redesign_source_image"
  | "redesign_source_or_xpeng_assets"
  | "creative_analysis_rebuild_with_xpeng_assets"
  | "video_keyframe_reference"
  | "none"
  | "not_adopt";

export type SourceImageTaskMode = "wash" | "reconstruct" | "keep";

export type SourceImageTask = {
  id: string;
  url: string;
  kind: "source_image" | "video_frame";
  label: string;
  selected: boolean;
  mode: SourceImageTaskMode;
  prompt: string;
  timestamp?: number;
};

export type ImageGenerationQuality = "low" | "medium" | "high";

export type ImageStrategyPrompts = {
  carExterior: string;
  textImage: string;
  peopleWithCar: string;
};

export type PlatformCrawlSetting = {
  mode?: "keyword" | "challenge";
  sort?: string;
  noteType?: number;
  searchType?: string;
  includeType?: string;
  timeScope?: string;
  contentType?: string;
};

export type PlatformCrawlSettings = Partial<Record<Platform, PlatformCrawlSetting>>;

export type ImageGenerationOptions = {
  size: string;
  quality: ImageGenerationQuality;
  taskConcurrency?: number;
};

export type FeishuAttachmentStatus = "pending" | "uploaded" | "failed" | "skipped";

export type FeishuPostPublishState = {
  recordId?: string;
  recordCreatedAt?: string;
  payloadPath?: string;
  attachmentStatus?: FeishuAttachmentStatus;
  attachmentFileCount?: number;
  attachmentUploadedAt?: string;
  attachmentError?: string;
};

export type WorkspacePromptSettings = {
  textInstruction: string;
  imageWashPrompt: string;
  imageStrategyPrompts: ImageStrategyPrompts;
  imageSize: string;
  imageQuality: ImageGenerationQuality;
  platformCrawlSettings: PlatformCrawlSettings;
  updatedAt: string;
};

export type ProductionPlan = {
  contentDirection: ContentDirection;
  decision: ProductionDecision;
  reason: string;
  textStrategy: TextProductionStrategy;
  imageStrategy: ImageProductionStrategy;
  materialRequirements: {
    vehicleDocs: boolean;
    vehicleImages: boolean;
    sourceImages: boolean;
    videoKeyframes: boolean;
    videoPublicPoints: boolean;
  };
  promptGuidance: {
    textBrief: string;
    imageBrief: string;
  };
  workflow: string[];
  riskFlags: string[];
};

export type CrawlInput = {
  platform: Platform;
  query: string;
  targetCount: number;
  mode?: "keyword" | "challenge";
  sort?: string;
  noteType?: number;
  searchType?: string;
  includeType?: string;
  timeScope?: string;
  contentType?: string;
  cookie?: string;
};

export type CrawlJob = {
  id: string;
  status: CrawlStatus;
  input: CrawlInput;
  createdAt: string;
  updatedAt: string;
  warning?: string;
  error?: string;
  items: NormalizedSourceItem[];
};

export type VideoFrameAsset = {
  id: string;
  url: string;
  timestamp?: number;
  score: number;
  type: "cover" | "interval" | "scene_change" | "highlight";
  reason: string;
  width?: number;
  height?: number;
};

export type SourceMediaCacheState = "none" | "local_complete" | "partial" | "remote_only" | "failed";

export type SourceMediaCacheStatus = {
  status: SourceMediaCacheState;
  imageTotal: number;
  localImages: number;
  remoteImages: number;
  videoPresent: boolean;
  localVideo: boolean;
  frameCount: number;
  errorCount: number;
  errors: string[];
  updatedAt?: string;
};

export type NormalizedSourceItem = {
  id: string;
  platform: Platform;
  sourceId: string;
  mediaType?: "video" | "image" | "text" | "mixed" | "unknown";
  sourceUrl?: string;
  authorName?: string;
  title?: string;
  contentText?: string;
  images: string[];
  videoUrl?: string;
  mediaUrls: string[];
  downloadedImages?: string[];
  downloadedVideoUrl?: string;
  videoFrames?: VideoFrameAsset[];
  downloadErrors?: string[];
  mediaCache?: SourceMediaCacheStatus;
  crawledAt?: string;
  publishedAt?: string;
  publishedLabel?: string;
  poolStatus?: SourceUsageStatus;
  hotScore?: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
  usedCount?: number;
  analysis?: ViralAnalysis;
  productionPlan?: ProductionPlan;
  safetyAssessment?: SourceSafetyAssessment;
  contentTagging?: SourceContentTagging;
  visualTagging?: SourceVisualTagging;
  metrics: {
    views?: number;
    reads?: number;
    plays?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    collects?: number;
  };
  raw: unknown;
};

export type ContentProject = {
  id: string;
  query: string;
  normalizedQuery: string;
  createdAt: string;
  updatedAt: string;
  lastCrawledAt?: string;
  totalItems: number;
  newItems: number;
  analyzedItems: number;
  rewrittenItems: number;
  approvedItems: number;
  publishedItems: number;
  platforms: Partial<Record<Platform, number>>;
  items: NormalizedSourceItem[];
};

export type ContentPoolSnapshot = {
  projects: ContentProject[];
  activeProject?: ContentProject;
};

export type GeneratedPost = {
  id: string;
  sourceItemId: string;
  createdAt?: string;
  parentPostId?: string;
  version?: number;
  title: string;
  body: string;
  platform: Platform;
  imagePrompt: string;
  imageUrls: string[];
  contentTags?: ContentTag[];
  productionPlanOverride?: ProductionPlan;
  imageTasks?: SourceImageTask[];
  materialPaths: string[];
  feishu?: FeishuPostPublishState;
  status: ReviewStatus;
  aiNotes: string[];
  updatedAt: string;
};

export type ProductionTask = {
  id: string;
  sourceItemId: string;
  sourceTitle?: string;
  platform: Platform;
  status: ProductionTaskStatus;
  contentDirection: ContentDirection;
  decision: ProductionDecision;
  reason: string;
  postId?: string;
  post?: GeneratedPost;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
};

export type BatchProductionJob = {
  id: string;
  title: string;
  status: BatchProductionStatus;
  instruction: string;
  materialPaths: string[];
  sourceItemIds: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  skippedTasks: number;
  tasks: ProductionTask[];
};

export type SimpleRunInput = {
  keyword: string;
  targetCount: number;
  platforms: Platform[];
  materialPaths: string[];
};

export type SimpleRunStage = {
  id: SimpleRunStageId;
  title: string;
  status: SimpleRunStageStatus;
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  message?: string;
  updatedAt: string;
};

export type SimpleRunPlatformResult = {
  platform: Platform;
  requested: number;
  crawled: number;
  filteredUnsafe?: number;
  taggedContent: number;
  taggedVisual: number;
  error?: string;
};

export type SimpleRunPostResult = {
  postId: string;
  sourceItemId: string;
  platform: Platform;
  title: string;
  status: ReviewStatus;
  imageCount: number;
  contentTags: ContentTag[];
  error?: string;
};

export type SimpleRunPublishResult = {
  status: "published" | "attachment_failed" | "needs_config" | "skipped" | "failed";
  postCount: number;
  payloadPath?: string;
  message?: string;
  notificationStatus?: string;
  error?: string;
};

export type SimpleRun = {
  id: string;
  status: SimpleRunStatus;
  input: SimpleRunInput;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  textInstruction: string;
  imageWashPrompt: string;
  imageStrategyPrompts?: ImageStrategyPrompts;
  imageSize: string;
  imageQuality: ImageGenerationQuality;
  platformCrawlSettings?: PlatformCrawlSettings;
  stages: SimpleRunStage[];
  platformResults: SimpleRunPlatformResult[];
  posts: SimpleRunPostResult[];
  publish?: SimpleRunPublishResult;
  errors: string[];
};

export type SimpleRunQueueItem = {
  id: string;
  runId: string;
  status: SimpleRunQueueStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  runAfter: string;
  lockedBy?: string;
  lockedUntil?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
};

export type MaterialAsset = {
  id: string;
  path: string;
  name: string;
  extension: string;
};

export type MaterialAssetKind = "image" | "document" | "other";

export type MaterialFolder = {
  id: string;
  name: string;
  parentId?: string;
  createdAt: string;
  updatedAt: string;
};

export type MaterialLibraryAsset = {
  id: string;
  folderId: string;
  path: string;
  name: string;
  extension: string;
  kind: MaterialAssetKind;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type MaterialLibrarySnapshot = {
  folders: MaterialFolder[];
  assets: MaterialLibraryAsset[];
};

export type ConfigStatus = {
  tikhubConfigured: boolean;
  openaiConfigured: boolean;
  runningHubConfigured: boolean;
  feishuConfigured: boolean;
  databaseBackend: "sqlite" | "postgres";
  postgresConfigured: boolean;
  textModel: string;
  imageModel: string;
  imageProvider: string;
  openaiBaseUrl: string;
  openaiTextBaseUrl: string;
  openaiImageBaseUrl: string;
  runningHubBaseUrl: string;
  tikhubBaseUrl: string;
  feishuCliBin?: string;
  feishuNotifyConfigured: boolean;
};
