import type { ImageProviderProfile, ImageProviderRoute } from "./image-providers/contracts";
import type { FeishuPublishMode } from "./feishu-publish-mode";

export type { FeishuPublishMode } from "./feishu-publish-mode";

export type CrawlPlatform = "wechat_channels" | "xiaohongshu" | "douyin" | "weibo";

export type SourceLinkPlatform = CrawlPlatform | "xiaopeng_bbs" | "dongchedi";

export type Platform = SourceLinkPlatform | "feishu" | "original";

export type CrawlStatus = "queued" | "running" | "completed" | "failed" | "needs_config";

export type ReviewStatus = "draft" | "editing" | "approved" | "published";

export type SourceUsageStatus = "new" | "analyzed" | "rewritten" | "approved" | "published";

export type ExecutionLogStatus = "running" | "success" | "error" | "info";

export type SimpleRunStatus = "queued" | "running" | "paused" | "completed" | "partial" | "failed";

export type SimpleRunQueueStatus = "queued" | "running" | "paused" | "completed" | "failed";

export type ImageGenerationQueueStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type ImageGenerationQueueProvider = "comfyui_klein";

export type FeishuPublishQueueStatus =
  | "queued"
  | "running"
  | "completed"
  | "partial"
  | "needs_config"
  | "failed"
  | "cancelled";

export type FeishuPublishJobSource = "manual" | "simple";

export type FeishuPublishProgressStage = "queued" | "preparing" | "publishing" | "finalizing";

export type FeishuPublishItemFailureStage = "validation" | "media" | "record" | "attachment";

export type FeishuPublishItemFailure = {
  postId: string;
  stage: FeishuPublishItemFailureStage;
  error: string;
  retrySafe: boolean;
};

export type FeishuPublishJobProgress = {
  stage: FeishuPublishProgressStage;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  chunkSize: number;
  chunkCount: number;
  completedChunks: number;
};

export type DistributionDecision = "可分发" | "不可分发";

export type DistributionCheckQueueStatus = "queued" | "running" | "completed" | "partial" | "failed" | "cancelled";

export type WorkspaceAccountRole = "admin" | "operator";

export type WorkspaceAccountStatus = "active" | "disabled";

export type WorkspaceAccount = {
  id: string;
  username: string;
  displayName: string;
  role: WorkspaceAccountRole;
  status: WorkspaceAccountStatus;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  passwordSet?: boolean;
};

export type WorkspaceAccountRecord = WorkspaceAccount & {
  passwordHash: string;
};

export type WorkspaceSession = {
  id: string;
  accountId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt?: string;
  revokedAt?: string;
};

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
  "提车记录",
] as const;

export const visualTagOptions = ["APP", "内饰空间", "汽车外观", "车型美图", "带文字图", "人车美图"] as const;

export type ContentTag = (typeof contentTagOptions)[number];

export type VisualTag = (typeof visualTagOptions)[number];

export type SourceTaggingStatus = "pending" | "success" | "failed" | "skipped";

export type SourceSafetyDecision = "allow" | "review" | "filter";

export type SourceSafetyCategory = string;

export type ContentSafetyPolicyField = "title" | "body" | "author";

export type ContentSafetyPolicyCategory = {
  id: string;
  label: string;
  description?: string;
};

export type ContentSafetyPolicyConditionGroup = {
  fields: ContentSafetyPolicyField[];
  mode: "any" | "all" | "at_least";
  atLeast?: number;
  terms: string[];
};

export type ContentSafetyPolicyRule = {
  id: string;
  name: string;
  enabled: boolean;
  action: SourceSafetyDecision;
  categoryIds: string[];
  groups: ContentSafetyPolicyConditionGroup[];
};

export type ContentSafetyPolicy = {
  schemaVersion: 1;
  revision: number;
  enabled: boolean;
  categories: ContentSafetyPolicyCategory[];
  local: {
    enabled: boolean;
    rules: ContentSafetyPolicyRule[];
  };
  model: {
    enabled: boolean;
    scope: "local_review" | "all_non_filtered";
    prompt: string;
    reviewThreshold: number;
    filterThreshold: number;
  };
  updatedAt?: string;
  updatedBy?: {
    id: string;
    displayName: string;
  };
};

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
  riskScore?: number;
  matchedRuleId?: string;
  policyRevision?: number;
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
  ownerUserId?: string;
  ownerDisplayName?: string;
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

export type ViralStyleAnalysis = {
  titlePattern: string;
  paragraphCount: number;
  approximateLength: number;
  tone: string;
  structure: string;
  interactionPattern: string;
  imageCount: number;
  imageRhythm: string;
  sourceBrandCandidates: string[];
};

export type ViralImageSpec = {
  id: string;
  index: number;
  sourceUrl: string;
  imageType: "photo" | "info_card" | "poster" | "comparison" | "screenshot" | "unknown";
  shotSize: "wide" | "medium" | "close" | "detail" | "unknown";
  vehiclePart: "full_vehicle" | "front" | "side" | "rear" | "interior" | "wheel" | "light" | "screen" | "detail" | "unknown";
  angle: "front" | "front_three_quarter" | "side" | "rear" | "rear_three_quarter" | "top" | "interior" | "unknown";
  composition: string;
  hasPeople: boolean;
  hasText: boolean;
  colorPalette: string;
  stylePrompt: string;
  aestheticKeywords: string[];
  confidence?: number;
  recommendedStrategy: "car_reference" | "people_with_car" | "text_image" | "keep_layout";
};

export type MaterialVisualProfile = {
  source: "ai" | "filename";
  vehicleKeywords: string[];
  imageType: ViralImageSpec["imageType"];
  shotSize: ViralImageSpec["shotSize"];
  vehiclePart: ViralImageSpec["vehiclePart"];
  angle: ViralImageSpec["angle"];
  hasPeople: boolean;
  hasText: boolean;
  quality: "high" | "medium" | "low";
  indexedAt: string;
  model?: string;
  error?: string;
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

export type SourceImageTaskProvider = "openai_images" | "comfyui_klein";

export type SourceImageTaskReferencePolicy = "best_effort" | "strict_dual_reference";

export type SourceImageTask = {
  id: string;
  url: string;
  kind: "source_image" | "video_frame";
  label: string;
  selected: boolean;
  mode: SourceImageTaskMode;
  prompt: string;
  referenceUrls?: string[];
  referencePolicy?: SourceImageTaskReferencePolicy;
  timestamp?: number;
  provider?: SourceImageTaskProvider;
  strategyKey?: keyof ImageStrategyPrompts;
};

export type ImageGenerationQuality = "low" | "medium" | "high";

export type ImageStrategyPrompts = {
  carExterior: string;
  textImage: string;
  peopleWithCar: string;
};

export type SimpleRunMediaSettings = {
  generateImages: boolean;
  useComfyUiKlein: boolean;
  directOriginalReference: boolean;
  includeSourceVideo: boolean;
  enableVideoTranscription: boolean;
};

export const defaultSimpleRunMediaSettings: SimpleRunMediaSettings = {
  generateImages: true,
  useComfyUiKlein: false,
  directOriginalReference: false,
  includeSourceVideo: false,
  enableVideoTranscription: false,
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

export type PlatformCrawlSettings = Partial<Record<CrawlPlatform, PlatformCrawlSetting>>;

export type ImageGenerationOptions = {
  size: string;
  quality: ImageGenerationQuality;
  taskConcurrency?: number;
  ratio?: string;
  resolution?: "1k" | "2k" | "4k";
  outputFormat?: "png" | "jpeg";
  outputCompression?: number;
  strictReferencePreparation?: boolean;
};

export type FeishuAttachmentStatus = "pending" | "uploaded" | "failed" | "skipped";

export type FeishuPostPublishState = {
  recordId?: string;
  recordCreatedAt?: string;
  recordStatus?: "verified" | "failed";
  recordVerifiedAt?: string;
  recordError?: string;
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
  distributionCheckPrompt: string;
  imageSize: string;
  imageQuality: ImageGenerationQuality;
  platformCrawlSettings: PlatformCrawlSettings;
  simpleRunMediaSettings: SimpleRunMediaSettings;
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
  platform: CrawlPlatform;
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
  enableVideoTranscription?: boolean;
};

export type CrawlJob = {
  id: string;
  status: CrawlStatus;
  ownerUserId?: string;
  ownerDisplayName?: string;
  input: CrawlInput;
  contentSafetyPolicy?: ContentSafetyPolicy;
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
  perceptualHash?: string;
  qualityScore?: number;
  aestheticScore?: number;
  aiScore?: number;
  selectionReason?: string;
  visualDiversityScore?: number;
  similarityGroup?: number;
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

export type SourceVideoTranscript = {
  status: "success" | "failed";
  provider: "volcengine_asr" | "ark_video";
  model?: string;
  text?: string;
  audioUrl?: string;
  requestId?: string;
  transcribedAt: string;
  error?: string;
};

export type NormalizedSourceItem = {
  id: string;
  ownerUserId?: string;
  ownerDisplayName?: string;
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
  videoFrameOriginalReference?: boolean;
  videoTranscript?: SourceVideoTranscript;
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
  ownerUserId?: string;
  ownerDisplayName?: string;
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
  ownerUserId?: string;
  ownerDisplayName?: string;
  sourceItemId: string;
  createdAt?: string;
  parentPostId?: string;
  version?: number;
  title: string;
  body: string;
  taskKeyword?: string;
  feishuVehicle?: string;
  platform: Platform;
  sourceUrl?: string;
  sourceSafetyAssessment?: SourceSafetyAssessment;
  imagePrompt: string;
  imageUrls: string[];
  videoUrls?: string[];
  contentTags?: ContentTag[];
  productionPlanOverride?: ProductionPlan;
  imageTasks?: SourceImageTask[];
  materialPaths: string[];
  feishu?: FeishuPostPublishState;
  status: ReviewStatus;
  aiNotes: string[];
  sourceBatchId?: string;
  sourceBatchItemId?: string;
  xhsSeries?: XhsCardSeries;
  updatedAt: string;
};

export type XhsStrategy = "a" | "b" | "c";
export type XhsStyle = "cute" | "fresh" | "warm" | "bold" | "minimal" | "retro" | "pop" | "notion" | "chalkboard" | "study-notes" | "screen-print" | "sketch-notes";
export type XhsLayout = "sparse" | "balanced" | "dense" | "list" | "comparison" | "flow" | "mindmap" | "quadrant";
export type XhsPalette = "macaron" | "warm" | "neon";
export type XhsCardRole = "cover" | "content" | "ending";
export type XhsCardStatus = "planned" | "generating" | "validating" | "completed" | "needs_review" | "failed";
export type XhsQaStatus = "pending" | "passed" | "failed" | "unavailable";

export type XhsCardQa = {
  status: XhsQaStatus;
  attempts: number;
  issues: string[];
  checkedAt?: string;
};

export type XhsCard = {
  id: string;
  index: number;
  role: XhsCardRole;
  layout: XhsLayout;
  hook?: string;
  coreMessage: string;
  title: string;
  subtitle?: string;
  points: string[];
  visualConcept: string;
  swipeHook?: string;
  prompt: string;
  candidateUrls: string[];
  imageUrl?: string;
  providerTaskId?: string;
  providerTaskRoute?: "primary" | "backup";
  providerStatus?: string;
  status: XhsCardStatus;
  qa: XhsCardQa;
  error?: string;
};

export type XhsCardSeries = {
  schemaVersion: 1;
  source: {
    name: "baoyu-xhs-images";
    version: "2.0.1";
    commit: "6b7a2e417500561a5ecdd0b168332f4142584617";
  };
  strategy: XhsStrategy;
  style: XhsStyle;
  defaultLayout: XhsLayout;
  palette?: XhsPalette;
  effectiveRatio: "3:4" | "2:3";
  cards: XhsCard[];
};

export type OriginalBatchStatus = "queued" | "running" | "paused" | "completed" | "partial" | "failed" | "cancelled";
export type OriginalBatchItemStatus = "queued" | "planning" | "writing" | "generating" | "validating" | "completed" | "needs_review" | "failed" | "cancelled";
export type OriginalBatchQueueStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type OriginalBatchInputItem = {
  topic: string;
  requirements?: string;
  vehicleKeyword?: string;
};

export type OriginalBatchSettings = {
  strategy: "auto" | XhsStrategy;
  style: "auto" | XhsStyle;
  layout: "auto" | XhsLayout;
  palette: "auto" | "default" | XhsPalette;
  imageCount: "auto" | number;
  webSearch: boolean;
};

export type OriginalContentPlan = {
  contentType: string;
  targetAudience: string[];
  hook: string;
  factBoundary: string[];
  strategy: XhsStrategy;
  style: XhsStyle;
  defaultLayout: XhsLayout;
  palette?: XhsPalette;
  cards: Array<{
    role: XhsCardRole;
    layout: XhsLayout;
    coreMessage: string;
    swipeHook?: string;
  }>;
};

export type OriginalBatchItem = {
  id: string;
  batchId: string;
  ownerUserId: string;
  ownerDisplayName: string;
  ordinal: number;
  status: OriginalBatchItemStatus;
  input: OriginalBatchInputItem;
  plan?: OriginalContentPlan;
  writing?: Record<string, unknown>;
  series?: XhsCardSeries;
  postId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
};

export type OriginalBatchCounts = {
  total: number;
  queued: number;
  running: number;
  completed: number;
  needsReview: number;
  failed: number;
  cancelled: number;
};

export type OriginalBatch = {
  id: string;
  ownerUserId: string;
  ownerDisplayName: string;
  status: OriginalBatchStatus;
  settings: OriginalBatchSettings;
  counts: OriginalBatchCounts;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
  items?: OriginalBatchItem[];
};

export type OriginalBatchQueueItem = {
  id: string;
  batchId: string;
  itemId: string;
  ownerUserId: string;
  status: OriginalBatchQueueStatus;
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

export type SimpleRunInput = {
  sourceMode?: "keyword" | "links" | "feishu" | "viral" | "original" | "pool" | "dongchedi_page";
  keyword: string;
  targetCount: number;
  platforms: CrawlPlatform[];
  materialPaths: string[];
  links?: string[];
  pageUrl?: string;
  sourceItemIds?: string[];
  linkPlatform?: SourceLinkPlatform | "auto";
  cookie?: string;
  cookieCiphertext?: string;
  videoFrameOriginalReference?: boolean;
  useComfyUiKlein?: boolean;
  directOriginalReference?: boolean;
  includeSourceVideo?: boolean;
  enableVideoTranscription?: boolean;
  generateImages?: boolean;
  writeFeishu?: boolean;
  feishuPublishMode?: FeishuPublishMode;
  feishuTaskNumbers?: string[];
  viralUrl?: string;
  viralImitateImages?: boolean;
  viralMaterialPaths?: string[];
  originalPrompt?: string;
  originalUseWebSearch?: boolean;
  ownerUserId?: string;
  ownerDisplayName?: string;
};

export type SimpleRunLinkResult = {
  url: string;
  platform?: Platform;
  status: "queued" | "running" | "paused" | "imported" | "filtered" | "duplicate" | "unsupported" | "draft" | "failed";
  sourceId?: string;
  itemId?: string;
  title?: string;
  postId?: string;
  draftStatus?: ReviewStatus;
  error?: string;
};

export type SimpleRunFeishuResult = {
  taskNumber: string;
  status: "imported" | "not_found" | "failed";
  recordId?: string;
  itemId?: string;
  vehicle?: string;
  title?: string;
  materialCount?: number;
  error?: string;
};

export type SimpleRunViralResult = {
  url: string;
  status: "analyzed" | "generated" | "failed";
  sourceTitle?: string;
  imageCount?: number;
  sourceImageCount?: number;
  vehicleImageCount?: number;
  pairedImageCount?: number;
  analyzedImageCount?: number;
  skippedImageCount?: number;
  imageAnalysisErrors?: string[];
  matchedImageCount?: number;
  pairingNotice?: string;
  postId?: string;
  error?: string;
};

export type SimpleRunOriginalResult = {
  prompt: string;
  status: "planned" | "generated" | "failed";
  webSearch: boolean;
  imagePromptCount?: number;
  imageCount?: number;
  postId?: string;
  error?: string;
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
  status: "queued" | "running" | "published" | "record_failed" | "attachment_failed" | "needs_config" | "skipped" | "failed";
  postCount: number;
  jobId?: string;
  publishMode?: FeishuPublishMode;
  payloadPath?: string;
  message?: string;
  notificationStatus?: string;
  error?: string;
};

export type SimpleRun = {
  id: string;
  ownerUserId?: string;
  ownerDisplayName?: string;
  status: SimpleRunStatus;
  input: SimpleRunInput;
  contentSafetyPolicy?: ContentSafetyPolicy;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  pauseRequestedAt?: string;
  pauseReason?: string;
  resumeAfter?: string;
  textInstruction: string;
  imageWashPrompt: string;
  imageStrategyPrompts?: ImageStrategyPrompts;
  imageSize: string;
  imageQuality: ImageGenerationQuality;
  platformCrawlSettings?: PlatformCrawlSettings;
  stages: SimpleRunStage[];
  platformResults: SimpleRunPlatformResult[];
  linkResults?: SimpleRunLinkResult[];
  discoveredCount?: number;
  feishuResults?: SimpleRunFeishuResult[];
  viralResult?: SimpleRunViralResult;
  originalResult?: SimpleRunOriginalResult;
  posts: SimpleRunPostResult[];
  publish?: SimpleRunPublishResult;
  errors: string[];
};

export type LarkTaskLaunchStatus = "processing" | "launched" | "failed";

export type LarkTaskLaunch = {
  id: string;
  messageId: string;
  chatId: string;
  senderId: string;
  senderName?: string;
  ownerUserId?: string;
  ownerDisplayName?: string;
  runId?: string;
  status: LarkTaskLaunchStatus;
  commandText: string;
  parsedInput?: SimpleRunInput;
  createdAt: string;
  updatedAt: string;
  error?: string;
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

export type DistributionScorePrediction = "高潜力" | "可测试" | "低优先级";

export type DistributionScoreDimension = {
  name: string;
  score: number;
  max: number;
  reason: string;
};

export type DistributionScore = {
  total: number;
  threshold: number;
  prediction: DistributionScorePrediction;
  dimensions: DistributionScoreDimension[];
};

export type DistributionCheckItemResult = {
  number: string;
  recordId?: string;
  status: "updated" | "not_found" | "failed";
  distribution?: DistributionDecision;
  score?: DistributionScore;
  title?: string;
  vehicle?: string;
  previousValue?: string;
  confidence?: number;
  riskTags?: string[];
  reasons?: string[];
  error?: string;
};

export type DistributionCheckResponse = {
  total: number;
  updated: number;
  distributable: number;
  blocked: number;
  failed: number;
  results: DistributionCheckItemResult[];
};

export type DistributionCheckJob = DistributionCheckResponse & {
  id: string;
  ownerUserId: string;
  ownerDisplayName?: string;
  status: DistributionCheckQueueStatus;
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
  numbers: string[];
  processed: number;
  prompt: string;
  error?: string;
};

export type FeishuPublishJobResult = {
  status: "published" | "record_failed" | "attachment_failed" | "needs_config" | "skipped" | "failed";
  payloadPath?: string;
  message?: string;
  notificationStatus?: string;
  recordFailureCount?: number;
  attachmentFailureCount?: number;
  recordCount?: number;
  mediaRepairCount?: number;
  mediaFailureCount?: number;
  requestedCount?: number;
  succeededCount?: number;
  failedCount?: number;
  itemFailures?: FeishuPublishItemFailure[];
  mediaFailures?: Array<{
    postId: string;
    kind: "image" | "video";
    index: number;
    error: string;
  }>;
};

export type FeishuPublishJob = {
  id: string;
  ownerUserId: string;
  source: FeishuPublishJobSource;
  publishMode: FeishuPublishMode;
  sourceRunId?: string;
  status: FeishuPublishQueueStatus;
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
  postIds: string[];
  posts: GeneratedPost[];
  progress?: FeishuPublishJobProgress;
  result?: FeishuPublishJobResult;
  error?: string;
};

export type ImageGenerationQueueJob = {
  id: string;
  provider: ImageGenerationQueueProvider;
  status: ImageGenerationQueueStatus;
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
  ownerUserId?: string;
  ownerDisplayName?: string;
  sourceRunId?: string;
  postId?: string;
  sourceItemId?: string;
  taskId?: string;
  taskLabel?: string;
  strategyKey?: keyof ImageStrategyPrompts;
  prompt: string;
  referenceImage: string;
  referenceImages?: string[];
  outputUrls: string[];
  error?: string;
};

export type LibraryAssetRole = "reference" | "vehicle";

export type LibraryVisibility = "private" | "team";

export type LibraryListSort =
  | "newest"
  | "oldest"
  | "name-asc"
  | "name-desc"
  | "owner-asc"
  | "owner-desc";

export type CopyLibraryEntry = {
  id: string;
  ownerUserId: string;
  ownerDisplayName: string;
  visibility: LibraryVisibility;
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type CopyLibraryEntryView = CopyLibraryEntry & {
  canEdit: boolean;
};

export type LibraryPeoplePresence = "yes" | "no" | "unknown";

export type LibraryTaggingStatus = "queued" | "running" | "completed" | "failed";

export type LibraryObjectCleanupStatus = "ready" | "pending" | "failed";

export type LibraryImageType =
  | "exterior"
  | "interior"
  | "detail"
  | "people_vehicle"
  | "lifestyle"
  | "event"
  | "poster_info"
  | "screenshot"
  | "comparison"
  | "other";

export type LibraryTagProfile = {
  imageType?: LibraryImageType;
  scenes: string[];
  vehicleModels: string[];
  vehicleColors: string[];
  angles: string[];
  people: LibraryPeoplePresence;
  customTags: string[];
  confidence?: number;
  model?: string;
  taggedAt?: string;
};

export type LibraryManualTagOverrides = Partial<{
  imageType: LibraryImageType | null;
  scenes: string[];
  vehicleModels: string[];
  vehicleColors: string[];
  angles: string[];
  people: LibraryPeoplePresence | null;
  customTags: string[];
}>;

export type LibraryAsset = {
  id: string;
  ownerUserId: string;
  ownerDisplayName: string;
  name: string;
  originalName: string;
  relativePath?: string;
  objectKey: string;
  publicUrl: string;
  mimeType: string;
  extension: string;
  byteSize: number;
  width?: number;
  height?: number;
  sha256: string;
  roles: LibraryAssetRole[];
  roleAddedAt: Partial<Record<LibraryAssetRole, string>>;
  collectionIds: string[];
  visibility: LibraryVisibility;
  aiTags: LibraryTagProfile;
  manualOverrides: LibraryManualTagOverrides;
  effectiveTags: LibraryTagProfile;
  taggingStatus: LibraryTaggingStatus;
  taggingError?: string;
  cleanupStatus: LibraryObjectCleanupStatus;
  cleanupError?: string;
  canEdit?: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

export type LibraryCollection = {
  id: string;
  ownerUserId: string;
  ownerDisplayName: string;
  role: LibraryAssetRole;
  name: string;
  parentId?: string;
  relativePath?: string;
  createdAt: string;
  updatedAt: string;
};

export type LibraryTaggingJob = {
  id: string;
  assetId: string;
  ownerUserId: string;
  status: LibraryTaggingStatus;
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

export type LibraryAssetPage = {
  assets: LibraryAsset[];
  collections: LibraryCollection[];
  nextCursor?: string;
  total: number;
};

export type LibraryTagSuggestion = {
  label: string;
  count: number;
};

export type LibraryTagBatchFailure = {
  assetId: string;
  error: string;
};

export type LibraryTagBatchResult = {
  assets: LibraryAsset[];
  failures: LibraryTagBatchFailure[];
};

export type ReferenceAssetSelection = {
  assetIds: string[];
};

export type ConfigStatus = {
  tikhubConfigured: boolean;
  openaiConfigured: boolean;
  openaiImageConfigured: boolean;
  openaiImageBackupConfigured: boolean;
  feishuConfigured: boolean;
  feishuContentImportConfigured: boolean;
  feishuDistributionCheckConfigured: boolean;
  databaseBackend: "sqlite" | "postgres";
  postgresConfigured: boolean;
  textModel: string;
  libraryTaggingModel: string;
  openaiTextEndpoint: string;
  imageModel: string;
  imageProvider: string;
  openaiImageApiDialect: string;
  openaiImagePrimaryProfile: ImageProviderProfile;
  openaiImageBackupProfile: ImageProviderProfile;
  openaiImageBackupModel: string;
  openaiImageRequestTimeoutMs: number;
  openaiBaseUrl: string;
  openaiTextBaseUrl: string;
  openaiImageBaseUrl: string;
  openaiImageBackupBaseUrl?: string;
  comfyUiKleinEnabled: boolean;
  comfyUiKleinConfigured: boolean;
  comfyUiKleinWorkflowConfigured: boolean;
  comfyUiKleinWorkflowJsonConfigured: boolean;
  comfyUiBaseUrl?: string;
  dreaminaCliBin?: string;
  tikhubBaseUrl: string;
  feishuCliBin?: string;
  feishuNotifyConfigured: boolean;
  volcengineAsrConfigured: boolean;
  tosConfigured: boolean;
  tosEnabled: boolean;
};

export type ImageProviderProbeStepResult = {
  ok: boolean;
  durationMs: number;
  outputVerified: boolean;
  cleanupVerified: boolean;
  error?: string;
};

export type ImageProviderProbeResult = {
  ok: boolean;
  route: ImageProviderRoute;
  profile: ImageProviderProfile;
  model: string;
  generation: ImageProviderProbeStepResult;
  edit: ImageProviderProbeStepResult;
};

export type TosStorageProbeResult = {
  ok: boolean;
  uploadVerified: boolean;
  headVerified: boolean;
  publicReadVerified: boolean;
  rangeVerified: boolean;
  cleanupVerified: boolean;
};

export type GeneratedMediaRepairMode = "scan" | "apply";

export type GeneratedMediaRepairFailure = {
  postId: string;
  imageIndex: number;
  sourceImageIndex: number | null;
  message: string;
};

export type GeneratedMediaRepairBatchResult = {
  mode: GeneratedMediaRepairMode;
  cursor?: string;
  nextCursor?: string;
  scannedCount: number;
  candidatePostCount: number;
  candidateImageCount: number;
  repairedPostCount: number;
  repairedImageCount: number;
  failures: GeneratedMediaRepairFailure[];
};

export type AdvancedConfigFieldKind = "text" | "secret" | "number" | "boolean" | "select" | "textarea";

export type AdvancedConfigField = {
  key: string;
  label: string;
  description: string;
  kind: AdvancedConfigFieldKind;
  category: string;
  value?: string;
  configured: boolean;
  required?: boolean;
  options?: string[];
};

export type AdvancedConfigGroup = {
  id: string;
  title: string;
  description: string;
  fields: AdvancedConfigField[];
};

export type AdvancedConfigSnapshot = {
  groups: AdvancedConfigGroup[];
  updatedAt: string;
};

export type AdvancedConfigPatchValue = string | number | boolean | null;

export type AdvancedConfigPatch = {
  values: Record<string, AdvancedConfigPatchValue>;
};
