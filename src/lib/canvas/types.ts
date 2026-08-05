import type { GeneratedPost } from "../types";

export type CanvasArtifactKind = "text" | "images" | "videos" | "socialPost" | "publishJobRef";
export type CanvasPortKind = CanvasArtifactKind | "any";

export function areCanvasPortKindsCompatible(outputKind: CanvasPortKind, inputKind: CanvasPortKind) {
  return outputKind !== "any" && (inputKind === "any" || outputKind === inputKind);
}

export type CanvasMediaReference = {
  url: string;
  name?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
};

export type CanvasArtifact =
  | { kind: "text"; value: string }
  | { kind: "images"; items: CanvasMediaReference[] }
  | { kind: "videos"; items: CanvasMediaReference[]; providerTaskId?: string; providerStatus?: string }
  | { kind: "socialPost"; postId: string; post: GeneratedPost }
  | { kind: "publishJobRef"; jobId: string; status: string };

export type CanvasNodeType =
  | "input.text"
  | "input.images"
  | "input.videos"
  | "input.content-pool"
  | "input.library-images"
  | "input.copy-library"
  | "model.gpt-text"
  | "model.gpt-image"
  | "model.gpt-vision"
  | "model.seedance"
  | "utility.image-preview"
  | "utility.display-any"
  | "utility.prompt-template"
  | "utility.text-concatenate"
  | "utility.prompt-switch"
  | "utility.text-split"
  | "utility.image-select"
  | "utility.image-transform"
  | "utility.video-frames"
  | "compose.social-post"
  | "publish.feishu";

export type CanvasNodeExecutionMode = "enabled" | "bypass" | "disabled";
export type CanvasRunMode = "with-upstream" | "isolated";
export type CanvasPromptStrategy = "input-1" | "input-2" | "input-3";
export type CanvasRequiredSchedulerRole = "scene-input" | "vehicle-input" | "prompt-switch" | "image-target" | "content-target";
export type CanvasSchedulerRole = CanvasRequiredSchedulerRole | "copy-input";

export const CANVAS_REQUIRED_SCHEDULER_ROLES = ["scene-input", "vehicle-input", "prompt-switch", "image-target", "content-target"] as const satisfies readonly CanvasRequiredSchedulerRole[];
export const CANVAS_SCHEDULER_ROLES = [...CANVAS_REQUIRED_SCHEDULER_ROLES, "copy-input"] as const satisfies readonly CanvasSchedulerRole[];

export const CANVAS_SCHEDULER_ROLE_LABELS: Record<CanvasSchedulerRole, string> = {
  "scene-input": "场景素材输入",
  "vehicle-input": "车型素材输入",
  "prompt-switch": "提示词 Switch",
  "image-target": "图片生成目标",
  "content-target": "最终内容目标",
  "copy-input": "文案库输入",
};

export type CanvasConfigValue = string | number | boolean | string[] | null | undefined;
export type CanvasNodeConfig = Record<string, CanvasConfigValue>;

export type CanvasPosition = { x: number; y: number };
export type CanvasViewport = { x: number; y: number; zoom: number };
export type CanvasNodeSize = { width: number; height: number };

export const CANVAS_GRAPH_LIMITS = {
  maxNodes: 200,
  maxEdges: 600,
} as const;

export const CANVAS_NODE_SIZE_LIMITS = {
  minWidth: 190,
  minHeight: 120,
  maxWidth: 720,
  maxHeight: 900,
} as const;

export function isCanvasNodeSize(value: unknown): value is CanvasNodeSize {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const size = value as Partial<CanvasNodeSize>;
  return typeof size.width === "number"
    && Number.isFinite(size.width)
    && size.width >= CANVAS_NODE_SIZE_LIMITS.minWidth
    && size.width <= CANVAS_NODE_SIZE_LIMITS.maxWidth
    && typeof size.height === "number"
    && Number.isFinite(size.height)
    && size.height >= CANVAS_NODE_SIZE_LIMITS.minHeight
    && size.height <= CANVAS_NODE_SIZE_LIMITS.maxHeight;
}

export type CanvasNode = {
  id: string;
  type: CanvasNodeType;
  version: 1 | 2;
  position: CanvasPosition;
  config: CanvasNodeConfig;
  size?: CanvasNodeSize;
  label?: string;
  executionMode?: CanvasNodeExecutionMode;
  schedulerRole?: CanvasSchedulerRole;
};

export type CanvasEdge = {
  id: string;
  source: string;
  sourcePort: string;
  target: string;
  targetPort: string;
};

export type CanvasGraph = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: CanvasViewport;
};

export type CanvasWorkflow = {
  id: string;
  ownerUserId: string;
  ownerDisplayName: string;
  name: string;
  revision: number;
  graph: CanvasGraph;
  isTemplate: boolean;
  sourceWorkflowId?: string;
  createdAt: string;
  updatedAt: string;
};

export type CanvasRunStatus = "queued" | "running" | "completed" | "partial" | "failed" | "cancelled";
export type CanvasNodeRunStatus = "queued" | "running" | "completed" | "reused" | "bypassed" | "disabled" | "failed" | "blocked" | "cancelled" | "needs_config";

export type CanvasRunStepAction = "execute" | "reuse" | "bypass" | "disabled" | "blocked";

export type CanvasRunPlanStep = {
  nodeId: string;
  action: CanvasRunStepAction;
  message?: string;
  sourceRunId?: string;
  sourceNodeRunId?: string;
};

export type CanvasRunConfirmation = {
  confirmedAt: string;
  nodeIds: string[];
  capabilities: Array<"text_model" | "image_model" | "video_model" | "external_write">;
};

export type CanvasRun = {
  id: string;
  workflowId: string;
  workflowRevision: number;
  ownerUserId: string;
  ownerDisplayName: string;
  status: CanvasRunStatus;
  graphSnapshot: CanvasGraph;
  runMode?: CanvasRunMode;
  steps?: CanvasRunPlanStep[];
  targetNodeIds?: string[];
  retryNodeIds?: string[];
  batchContext?: {
    schemaVersion?: 1;
    scheduleId: string;
    batchId: string;
    contentTaskId: string;
    imageTaskId?: string;
    phase: "image" | "finalize";
  } | {
    schemaVersion: 2;
    scheduleId: string;
    mainTaskId: string;
    childTaskId?: string;
    phase: "shared" | "child" | "aggregate";
  };
  confirmation: CanvasRunConfirmation;
  cancelRequestedAt?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
};

export type CanvasNodeRun = {
  id: string;
  runId: string;
  nodeId: string;
  nodeType: CanvasNodeType;
  attempt: number;
  status: CanvasNodeRunStatus;
  inputs: Record<string, CanvasArtifact[]>;
  outputs: Record<string, CanvasArtifact>;
  providerTaskId?: string;
  providerTaskRoute?: "primary" | "backup";
  providerStatus?: string;
  inputFingerprint?: string;
  reusedFrom?: {
    runId: string;
    nodeRunId: string;
    workflowRevision: number;
  };
  error?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
};

export type CanvasRunQueueItem = {
  id: string;
  runId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  priority: number;
  attempts: number;
  maxAttempts: number;
  runAfter: string;
  lockedBy?: string;
  lockedUntil?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
};

export type CanvasPortDefinition = {
  id: string;
  label: string;
  kind: CanvasPortKind;
  required?: boolean;
  multiple?: boolean;
};

export type CanvasConfigFieldDefinition = {
  key: string;
  label: string;
  kind: "text" | "textarea" | "number" | "boolean" | "select" | "url-list" | "content-pool-picker" | "library-image-picker" | "copy-library-picker";
  placeholder?: string;
  min?: number;
  max?: number;
  options?: Array<{ value: string; label: string }>;
};

export type CanvasNodeCapability = "text_model" | "image_model" | "video_model" | "external_write";

export type CanvasNodeDefinition = {
  type: CanvasNodeType;
  version: 1 | 2;
  label: string;
  description: string;
  category: "input" | "model" | "utility" | "compose" | "publish";
  icon: string;
  color: string;
  inputs: CanvasPortDefinition[];
  outputs: CanvasPortDefinition[];
  fields: CanvasConfigFieldDefinition[];
  defaultConfig: CanvasNodeConfig;
  capability?: CanvasNodeCapability;
  bypass?: { inputPort: string; outputPort: string };
  passiveSink?: boolean;
};

export type CanvasGraphValidation = {
  valid: boolean;
  errors: string[];
  order: string[];
};

export type CanvasRunPlan = {
  order: string[];
  includedNodeIds: string[];
  confirmationNodeIds: string[];
  capabilities: CanvasNodeCapability[];
  steps: CanvasRunPlanStep[];
  blockers: Array<{ nodeId: string; message: string }>;
  confirmationDetails?: Array<{
    nodeId: string;
    label: string;
    model?: string;
    resolution?: string;
    durationSeconds?: number;
    credit?: number;
    status?: "ready" | "needs_config" | "blocked";
    message?: string;
  }>;
  preflightBlocked?: boolean;
};

export type CanvasRunWithNodes = {
  run: CanvasRun;
  nodeRuns: CanvasNodeRun[];
};

export type CanvasLatestSuccessfulNodeRun = {
  runId: string;
  workflowRevision: number;
  runCreatedAt: string;
  nodeVersion: 1 | 2;
  nodeConfig: CanvasNodeConfig;
  nodeRun: CanvasNodeRun;
};

export type CanvasScheduleStatus = "draft" | "ready" | "queued" | "running" | "paused" | "completed" | "partial" | "failed" | "cancelled";
export type CanvasScheduleTaskStatus = "pending" | "queued" | "running" | "completed" | "partial" | "failed" | "cancelled";

export type CanvasScheduleAssetFilter = {
  mode: "manual" | "random";
  assetIds: string[];
  search: string;
  collectionId?: string;
  tags: string[];
};

export type CanvasScheduleAssetSnapshot = CanvasMediaReference & {
  id: string;
};

export type CanvasScheduleCopyFilter = {
  mode: "manual" | "tags";
  entryIds: string[];
  search: string;
  tags: string[];
};

export type CanvasScheduleCopySnapshot = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  updatedAt: string;
};

export type CanvasScheduleParameterType = "image" | "image-group" | "text" | "copy" | "number" | "boolean" | "enum";
export type CanvasScheduleParameterScope = "main" | "child";
export type CanvasScheduleExpansionMode = "cartesian" | "zip";
export type CanvasScheduleAggregationPolicy = "at-least-one" | "all";

export type CanvasScheduleParameterValue =
  | string
  | number
  | boolean
  | CanvasScheduleAssetSnapshot
  | CanvasScheduleAssetSnapshot[]
  | CanvasScheduleCopySnapshot;

export type CanvasScheduleParameterSource =
  | { mode: "fixed" | "manual-list"; values: CanvasScheduleParameterValue[] }
  | { mode: "library-filter"; role: "reference" | "vehicle"; filter: CanvasScheduleAssetFilter }
  | { mode: "copy-filter"; filter: CanvasScheduleCopyFilter };

export type CanvasScheduleParameterBinding = {
  nodeId: string;
  fieldKey: string;
};

export type CanvasScheduleSampleCount =
  | { mode: "exact"; value: number }
  | { mode: "range"; min: number; max: number };

export type CanvasScheduleParameter = {
  id: string;
  name: string;
  scope: CanvasScheduleParameterScope;
  valueType: CanvasScheduleParameterType;
  source: CanvasScheduleParameterSource;
  expansion: "fixed" | "each" | "random";
  sampleCount?: CanvasScheduleSampleCount;
  /** Compatibility reader for V2 definitions saved before range sampling. */
  randomCount?: number;
  binding: CanvasScheduleParameterBinding;
};

export type CanvasScheduleV2Definition = {
  parameters: CanvasScheduleParameter[];
  expansion: Record<CanvasScheduleParameterScope, CanvasScheduleExpansionMode>;
  sharedOutputs?: CanvasScheduleV2SharedOutput[];
  childResult: {
    nodeId: string;
    outputPort: string;
    artifactKind: "text" | "images" | "videos";
  };
  mainTargetNodeId?: string;
  aggregationPolicy: CanvasScheduleAggregationPolicy;
};

export type CanvasScheduleAggregateArtifact = Extract<CanvasArtifact, { kind: "text" | "images" | "videos" }>;

export type CanvasScheduleV2SharedOutput = {
  nodeId: string;
  outputPort: string;
  artifactKind: CanvasScheduleAggregateArtifact["kind"];
};

export type CanvasScheduleV2SharedArtifact = CanvasScheduleV2SharedOutput & {
  artifact: CanvasScheduleAggregateArtifact;
};

export type CanvasScheduleV2ChildTask = {
  id: string;
  parameterValues: Record<string, CanvasScheduleParameterValue>;
  status: CanvasScheduleTaskStatus;
  runId?: string;
  resultArtifacts: CanvasScheduleAggregateArtifact[];
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type CanvasScheduleV2MainTask = {
  id: string;
  parameterValues: Record<string, CanvasScheduleParameterValue>;
  childTasks: CanvasScheduleV2ChildTask[];
  status: CanvasScheduleTaskStatus;
  sharedRunId?: string;
  sharedStatus?: CanvasScheduleTaskStatus;
  sharedArtifacts?: CanvasScheduleV2SharedArtifact[];
  sharedError?: string;
  mainRunId?: string;
  resultArtifacts: CanvasArtifact[];
  generatedPostId?: string;
  generatedPostUpdatedAt?: string;
  candidateFingerprint?: string;
  pendingCandidateSync?: boolean;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type CanvasBatchBindingAdapter = "config-value" | "image-input" | "copy-input";

export type CanvasBatchBindableField = {
  key: string;
  label: string;
  parameterTypes: CanvasScheduleParameterType[];
  adapter: CanvasBatchBindingAdapter;
};

export type CanvasScheduleImageTask = {
  id: string;
  vehicle: CanvasScheduleAssetSnapshot;
  status: CanvasScheduleTaskStatus;
  runId?: string;
  imageUrls: string[];
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type CanvasScheduleContentTask = {
  id: string;
  scene: CanvasScheduleAssetSnapshot;
  vehicles: CanvasScheduleAssetSnapshot[];
  imageTasks: CanvasScheduleImageTask[];
  copy?: CanvasScheduleCopySnapshot;
  status: CanvasScheduleTaskStatus;
  finalRunId?: string;
  generatedPostId?: string;
  generatedPostUpdatedAt?: string;
  candidateImageUrls: string[];
  assemblyFingerprint?: string;
  pendingCandidateSync?: boolean;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type CanvasScheduleBatch = {
  id: string;
  name: string;
  strategy: CanvasPromptStrategy;
  sceneFilter: CanvasScheduleAssetFilter;
  sceneCount: number;
  vehicleFilter: CanvasScheduleAssetFilter;
  vehicleCountMin: number;
  vehicleCountMax: number;
  copyFilter?: CanvasScheduleCopyFilter;
  status: CanvasScheduleStatus;
  contentTasks: CanvasScheduleContentTask[];
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type CanvasScheduleBindings = Record<CanvasRequiredSchedulerRole, string> & Partial<Record<"copy-input", string>>;

export type CanvasSchedule = {
  id: string;
  ownerUserId: string;
  ownerDisplayName: string;
  name: string;
  revision: number;
  workflowId: string;
  workflowRevision: number;
  workflowSnapshot?: CanvasGraph;
  status: CanvasScheduleStatus;
  batches: CanvasScheduleBatch[];
  schemaVersion?: 1 | 2;
  definition?: CanvasScheduleV2Definition;
  mainTasks?: CanvasScheduleV2MainTask[];
  totalMainTasks?: number;
  totalChildTasks?: number;
  bindings?: CanvasScheduleBindings;
  previewRevision?: string;
  totalContentTasks: number;
  totalImageTasks: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
  launchedAt?: string;
  completedAt?: string;
};
