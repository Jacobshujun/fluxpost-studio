import type { GeneratedPost } from "../types";

export type CanvasArtifactKind = "text" | "images" | "videos" | "socialPost" | "publishJobRef";

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
  | "model.gpt-text"
  | "model.gpt-image"
  | "model.gpt-vision"
  | "model.seedance"
  | "utility.image-preview"
  | "utility.prompt-template"
  | "utility.text-split"
  | "utility.image-select"
  | "utility.image-transform"
  | "utility.video-frames"
  | "compose.social-post"
  | "publish.feishu";

export type CanvasNodeExecutionMode = "enabled" | "bypass" | "disabled";
export type CanvasRunMode = "with-upstream" | "isolated";

export type CanvasConfigValue = string | number | boolean | string[] | null | undefined;
export type CanvasNodeConfig = Record<string, CanvasConfigValue>;

export type CanvasPosition = { x: number; y: number };
export type CanvasViewport = { x: number; y: number; zoom: number };

export type CanvasNode = {
  id: string;
  type: CanvasNodeType;
  version: 1 | 2;
  position: CanvasPosition;
  config: CanvasNodeConfig;
  label?: string;
  executionMode?: CanvasNodeExecutionMode;
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
  kind: CanvasArtifactKind;
  required?: boolean;
  multiple?: boolean;
};

export type CanvasConfigFieldDefinition = {
  key: string;
  label: string;
  kind: "text" | "textarea" | "number" | "select" | "url-list" | "content-pool-picker" | "library-image-picker";
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
