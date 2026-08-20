"use client";

import Link from "next/link";
import Image from "next/image";
import {
  BaseEdge,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  NodeResizer,
  Position,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  getBezierPath,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type FinalConnectionState,
  type Node,
  type NodeChange,
  type NodeProps,
  type OnConnectStartParams,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpenText,
  Captions,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  ClipboardPaste,
  Combine,
  Copy,
  CopyPlus,
  Download,
  FileDown,
  FileText,
  FileUp,
  FileVideo2,
  ExternalLink,
  GitBranch,
  Home,
  Image as ImageIcon,
  ImageOff,
  Images,
  Layers3,
  ListChecks,
  LoaderCircle,
  Maximize2,
  Menu,
  EllipsisVertical,
  Eye,
  History,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRight,
  PanelsTopLeft,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Share2,
  Scissors,
  Send,
  Sparkles,
  Square,
  Trash2,
  Type,
  Upload,
  Video,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  CANVAS_CLIPBOARD_MIME,
  createCanvasClipboardPayload,
  parseCanvasClipboardPayload,
  prepareCanvasClipboardPaste,
  type CanvasClipboardPayload,
} from "@/lib/canvas/clipboard";
import { canvasNodeDefinitions, createCanvasNode, getCanvasBatchBindableFields, getCanvasNodeDefinition, getCanvasNodeExecutionMode } from "@/lib/canvas/registry";
import { CANVAS_SAVE_IMAGE_MAX_ITEMS } from "@/lib/canvas/save-images";
import { canvasSubtitleStyleConfig, canvasSubtitleStyleFromConfig, normalizeCanvasSubtitlePresetName } from "@/lib/canvas/subtitle-style";
import { createCanvasSchedulerSkeleton } from "@/lib/canvas/scheduler-skeleton";
import {
  serializeSeedanceAssistantPrompt,
  type SeedanceAssistantAction,
  type SeedanceAssistantCandidate,
  type SeedanceAssistantMode,
  type SeedanceAssistantReference,
  type SeedancePromptAssistantResponse,
} from "@/lib/canvas/seedance-prompt-assistant";
import {
  orderSeedanceFixedReferences,
  parseSeedancePromptDocument,
  resolveSeedanceFixedReferences,
  seedanceMentionBindings,
  seedanceMentionIds,
  seedanceMentionMarker,
  validateSeedanceGraphNode,
  type SeedanceFixedReference,
} from "@/lib/canvas/seedance-references";
import { canvasSourceVideoSnapshotConfig, canvasSourceVideoSnapshotFromConfig, clearCanvasSourceVideoSnapshot, isCanvasSourceVideoSnapshotCurrent } from "@/lib/canvas/source-video-contract";
import { canvasVideoLoaderConfig, canvasVideoSnapshotsFromConfig, MAX_CANVAS_VIDEO_LOADER_ITEMS, selectedCanvasVideo } from "@/lib/canvas/video-loader";
import type { CanvasWorkflowTemplateKey } from "@/lib/canvas/templates";
import {
  CANVAS_WORKFLOW_FILE_MAX_BYTES,
  canvasWorkflowFileName,
  createCanvasWorkflowFile,
  parseCanvasWorkflowFile,
} from "@/lib/canvas/workflow-file";
import {
  areCanvasPortKindsCompatible,
  CANVAS_NODE_SIZE_LIMITS,
  CANVAS_REQUIRED_SCHEDULER_ROLES,
  CANVAS_SCHEDULER_ROLES,
  CANVAS_SCHEDULER_ROLE_LABELS,
} from "@/lib/canvas/types";
import { getStoredTheme, subscribeTheme } from "@/lib/theme";
import { selectIdRange } from "@/lib/list-selection";
import type { ContentPoolSnapshot, CopyLibraryEntryView, LibraryAsset, LibraryAssetPage, NormalizedSourceItem } from "@/lib/types";
import type {
  CanvasArtifact,
  CanvasEdge,
  CanvasGraph,
  CanvasLatestSuccessfulNodeRun,
  CanvasMediaReference,
  CanvasNode,
  CanvasNodeExecutionMode,
  CanvasNodeRun,
  CanvasNodeType,
  CanvasPortKind,
  CanvasPortDefinition,
  CanvasRun,
  CanvasRunMode,
  CanvasRunPlan,
  CanvasRunWithNodes,
  CanvasSchedule,
  CanvasScheduleAssetFilter,
  CanvasScheduleAssetSnapshot,
  CanvasScheduleBatch,
  CanvasScheduleBindings,
  CanvasScheduleCopyFilter,
  CanvasScheduleParameter,
  CanvasScheduleParameterSource,
  CanvasScheduleParameterType,
  CanvasScheduleParameterValue,
  CanvasScheduleSampleCount,
  CanvasScheduleV2Definition,
  CanvasScheduleV2SharedOutput,
  CanvasSourceVideoSnapshot,
  CanvasSubtitlePreset,
  CanvasSubtitleStyle,
  CanvasSchedulerRole,
  CanvasVideoSnapshot,
  CanvasWorkflow,
} from "@/lib/canvas/types";

type FlowNode = Node<{ canvasNode: CanvasNode }, "canvasNode">;
type FlowEdge = Edge<{ beamActive?: boolean }>;
type CanvasHistory = { entries: CanvasGraph[]; index: number };
type CanvasHistoryStep = { history: CanvasHistory; graph?: CanvasGraph };
type QuickAddConnection = { nodeId: string; portId: string; handleType: "source" | "target"; kind: CanvasPortKind; multiple?: boolean };
type QuickAddState = { screen: { x: number; y: number }; position: { x: number; y: number }; connection?: QuickAddConnection } | null;
type QuickAddChoice = { definition: (typeof canvasNodeDefinitions)[number]; port?: CanvasPortDefinition };
type CanvasCopyLibraryResponse = { entries: CopyLibraryEntryView[]; tags: string[] };
type CanvasTaskFilter = "all" | "active" | "history" | "failed";
type CanvasViewportDetail = "full" | "reduced" | "overview";
type CanvasEditableConfigValue = Exclude<CanvasNode["config"][string], null | undefined>;
type CanvasVideoUploadTask = {
  id: string;
  nodeId: string;
  file: File;
  progress: number;
  status: "queued" | "uploading" | "failed";
  error?: string;
};
type PreviewState =
  | { kind: "text"; value: string }
  | { kind: "image"; url: string; index: number; width?: number; height?: number; sequence?: Array<{ id: string; url: string; width?: number; height?: number }> }
  | { kind: "video"; url: string; index: number }
  | null;
type CanvasNodeInteraction = {
  activeRun?: CanvasRunWithNodes;
  latestNodeRuns: Map<string, CanvasNodeRun>;
  latestSuccessfulNodeRuns: Map<string, CanvasLatestSuccessfulNodeRun>;
  selectedNodeId?: string;
  canResize: boolean;
  workflowRevision?: number;
  onConfigChange: (nodeId: string, key: string, value: CanvasEditableConfigValue) => void;
  onExecutionModeChange: (nodeId: string, mode: CanvasNodeExecutionMode) => void;
  onNodeFocus: (nodeId: string) => void;
  onPreview: (preview: NonNullable<PreviewState>) => void;
};

const CanvasNodeInteractionContext = createContext<CanvasNodeInteraction | null>(null);
const nodeTypes = { canvasNode: CanvasFlowNode };
const edgeTypes = { flowing: FlowingCanvasEdge };
const terminalStatuses = new Set(["completed", "partial", "failed", "cancelled"]);
const canvasHistoryLimit = 50;
const canvasHistoryCommitDelayMs = 350;
const canvasViewportDetailZoom = { reduced: 0.65, overview: 0.35 } as const;
const canvasEdgeAnimationDuration = { idle: 3.6, active: 1.8 } as const;
let canvasScheduleParameterSequence = 0;
const canvasScheduleParameterTypes = ["image", "image-group", "video", "source-video", "text", "copy", "number", "boolean", "enum"] as const satisfies readonly CanvasScheduleParameterType[];

export default function CanvasPage() {
  const [workflows, setWorkflows] = useState<CanvasWorkflow[]>([]);
  const [activeWorkflow, setActiveWorkflow] = useState<CanvasWorkflow | null>(null);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [activeRun, setActiveRun] = useState<CanvasRunWithNodes>();
  const [latestSuccessfulNodeRuns, setLatestSuccessfulNodeRuns] = useState<Map<string, CanvasLatestSuccessfulNodeRun>>(new Map());
  const [sourceVideoBusyNodeId, setSourceVideoBusyNodeId] = useState<string>();
  const [message, setMessage] = useState("正在载入画布...");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [paletteVisible, setPaletteVisible] = useState(true);
  const [mobilePalette, setMobilePalette] = useState(false);
  const [taskCenterOpen, setTaskCenterOpen] = useState(false);
  const [scheduleCenterOpen, setScheduleCenterOpen] = useState(false);
  const [taskRuns, setTaskRuns] = useState<CanvasRun[]>([]);
  const [selectedTaskRun, setSelectedTaskRun] = useState<CanvasRunWithNodes>();
  const [selectedTaskRunId, setSelectedTaskRunId] = useState<string>();
  const [taskCenterBusy, setTaskCenterBusy] = useState(false);
  const [taskCenterError, setTaskCenterError] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [flowColorMode, setFlowColorMode] = useState<"light" | "dark">("light");
  const [mediaBusy, setMediaBusy] = useState(false);
  const [videoUploadTasks, setVideoUploadTasks] = useState<CanvasVideoUploadTask[]>([]);
  const [preview, setPreview] = useState<PreviewState>(null);
  const [quickAdd, setQuickAdd] = useState<QuickAddState>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactFlowRef = useRef<ReactFlowInstance<FlowNode, FlowEdge> | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasPointerRef = useRef<{ x: number; y: number } | null>(null);
  const pasteSequenceRef = useRef(0);
  const seedanceMentionSequenceRef = useRef(0);
  const seedanceMentionSessionRef = useRef("");
  const canvasClipboardRef = useRef<CanvasClipboardPayload | undefined>(undefined);
  const workflowFileInputRef = useRef<HTMLInputElement>(null);
  const activeWorkflowIdRef = useRef<string | undefined>(undefined);
  const loadRunsRequestRef = useRef(0);
  const selectedRunIdRef = useRef<string | undefined>(undefined);
  const runSelectionIsExplicitRef = useRef(false);
  const taskCenterRequestRef = useRef(0);
  const dirtyVersionRef = useRef(0);
  const connectionStartRef = useRef<QuickAddConnection | null>(null);
  const canvasHistoryRef = useRef<CanvasHistory>({ entries: [], index: -1 });
  const canvasHistoryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyingCanvasHistoryRef = useRef(false);

  const selectedFlowNode = nodes.find((node) => node.id === selectedNodeId);
  const selectedCanvasNode = selectedFlowNode?.data.canvasNode;
  const displayedNodes = useMemo(() => nodes.map((node) => applyFlowNodeSize(node, isMobile)), [isMobile, nodes]);
  const editableGraph = useMemo(() => currentGraph(nodes, edges, viewport), [edges, nodes, viewport]);
  const selectedSeedanceReferences = useMemo(() => selectedCanvasNode?.type === "model.seedance"
    ? resolveSeedanceFixedReferences(editableGraph, selectedCanvasNode.id)
    : [], [editableGraph, selectedCanvasNode?.id, selectedCanvasNode?.type]);
  const latestNodeRuns = useMemo(() => latestAttempts(activeRun?.nodeRuns || []), [activeRun?.nodeRuns]);
  const selectedSubtitlePreviewMedia = useMemo(() => selectedCanvasNode?.type === "utility.video-subtitles"
    ? resolveCanvasSubtitlePreviewMedia(selectedCanvasNode, editableGraph, latestNodeRuns, latestSuccessfulNodeRuns)
    : undefined, [editableGraph, latestNodeRuns, latestSuccessfulNodeRuns, selectedCanvasNode]);
  const displayedEdges = useMemo(() => markActiveCanvasEdges(edges, latestNodeRuns), [edges, latestNodeRuns]);
  const activeTaskCount = taskRuns.length
    ? taskRuns.filter((run) => isActiveCanvasRun(run.status)).length
    : activeRun && isActiveCanvasRun(activeRun.run.status) ? 1 : 0;
  const openImagePreview = useCallback((url: string, index: number) => setPreview({ kind: "image", url, index }), []);
  const markDirty = useCallback(() => {
    dirtyVersionRef.current += 1;
    setDirty(true);
  }, []);
  const createSeedanceMentionId = useCallback(() => {
    if (!seedanceMentionSessionRef.current) seedanceMentionSessionRef.current = Date.now().toString(36);
    seedanceMentionSequenceRef.current += 1;
    return `mention-${seedanceMentionSessionRef.current}-${seedanceMentionSequenceRef.current}`;
  }, []);
  const updateNodeConfig = useCallback((nodeId: string, key: string, value: CanvasEditableConfigValue) => {
    setNodes((current) => current.map((node) => {
      if (node.id !== nodeId) return node;
      const currentNode = node.data.canvasNode;
      const nextConfig = { ...currentNode.config, [key]: value };
      const config = currentNode.type === "input.source-video" && (key === "sourceUrl" || key === "projectName")
        ? clearCanvasSourceVideoSnapshot(nextConfig)
        : nextConfig;
      return { ...node, data: { canvasNode: { ...currentNode, config } } };
    }));
    markDirty();
  }, [markDirty]);
  const updateNodeConfigPatch = useCallback((nodeId: string, patch: CanvasNode["config"]) => {
    setNodes((current) => current.map((node) => node.id !== nodeId ? node : {
      ...node,
      data: { canvasNode: { ...node.data.canvasNode, config: { ...node.data.canvasNode.config, ...patch } } },
    }));
    markDirty();
  }, [markDirty]);
  const updateSelectedConfigPatch = useCallback((patch: CanvasNode["config"]) => {
    if (selectedNodeId) updateNodeConfigPatch(selectedNodeId, patch);
  }, [selectedNodeId, updateNodeConfigPatch]);
  const updateNodeExecutionMode = useCallback((nodeId: string, executionMode: CanvasNodeExecutionMode) => {
    setNodes((current) => current.map((node) => node.id !== nodeId ? node : {
      ...node,
      data: { canvasNode: { ...node.data.canvasNode, executionMode } },
    }));
    markDirty();
  }, [markDirty]);
  const updateNodeLabel = useCallback((nodeId: string, label: string) => {
    setNodes((current) => current.map((node) => node.id !== nodeId ? node : {
      ...node,
      data: { canvasNode: { ...node.data.canvasNode, label: label.slice(0, 80) } },
    }));
    markDirty();
  }, [markDirty]);
  const updateNodeSchedulerRole = useCallback((nodeId: string, schedulerRole?: CanvasSchedulerRole) => {
    setNodes((current) => current.map((node) => ({
      ...node,
      data: {
        canvasNode: {
          ...node.data.canvasNode,
          schedulerRole: node.id === nodeId
            ? schedulerRole
            : schedulerRole && node.data.canvasNode.schedulerRole === schedulerRole
              ? undefined
              : node.data.canvasNode.schedulerRole,
        },
      },
    })));
    markDirty();
  }, [markDirty]);
  const focusCanvasNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);
  const nodeInteraction = useMemo<CanvasNodeInteraction>(() => ({
    activeRun,
    latestNodeRuns,
    latestSuccessfulNodeRuns,
    selectedNodeId,
    canResize: !isMobile,
    workflowRevision: activeWorkflow?.revision,
    onConfigChange: updateNodeConfig,
    onExecutionModeChange: updateNodeExecutionMode,
    onNodeFocus: focusCanvasNode,
    onPreview: setPreview,
  }), [activeRun, activeWorkflow?.revision, focusCanvasNode, isMobile, latestNodeRuns, latestSuccessfulNodeRuns, selectedNodeId, updateNodeConfig, updateNodeExecutionMode]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 820px)");
    const update = () => {
      setIsMobile(query.matches);
      if (query.matches) setQuickAdd(null);
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const syncTheme = () => setFlowColorMode(getStoredTheme() === "creator" ? "dark" : "light");
    syncTheme();
    return subscribeTheme(syncTheme);
  }, []);

  useEffect(() => {
    void loadWorkflows();
  }, []);

  useEffect(() => {
    if (!activeWorkflow) return;
    void loadRuns(activeWorkflow.id);
  }, [activeWorkflow?.id]);

  useEffect(() => {
    if (!dirty || !activeWorkflow || busy) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveWorkflow(true), 900);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [dirty, nodes, edges, viewport, activeWorkflow?.name, busy]);

  useEffect(() => {
    if (!activeWorkflowIdRef.current) return;
    if (applyingCanvasHistoryRef.current) {
      applyingCanvasHistoryRef.current = false;
      return;
    }
    if (canvasHistoryTimerRef.current) clearTimeout(canvasHistoryTimerRef.current);
    const graph = currentGraph(nodes, edges, viewport);
    canvasHistoryTimerRef.current = setTimeout(() => {
      canvasHistoryRef.current = commitCanvasHistory(canvasHistoryRef.current, graph);
      canvasHistoryTimerRef.current = null;
    }, canvasHistoryCommitDelayMs);
    return () => {
      if (canvasHistoryTimerRef.current) clearTimeout(canvasHistoryTimerRef.current);
    };
  }, [activeWorkflow?.id, edges, nodes, viewport]);

  useEffect(() => {
    if (!activeRun || terminalStatuses.has(activeRun.run.status)) return;
    const timer = setInterval(() => void refreshRun(activeRun.run.id), 2000);
    return () => clearInterval(timer);
  }, [activeRun?.run.id, activeRun?.run.status]);

  async function loadWorkflows(selectId?: string) {
    try {
      const data = await api<{ workflows: CanvasWorkflow[] }>("/api/canvas/workflows");
      setWorkflows(data.workflows);
      const selected = data.workflows.find((item) => item.id === selectId) || data.workflows[0];
      if (selected) selectWorkflow(selected);
      else {
        activeWorkflowIdRef.current = undefined;
        loadRunsRequestRef.current += 1;
        setActiveWorkflow(null);
        setNodes([]);
        setEdges([]);
        setQuickAdd(null);
        setMessage("新建一个画布开始编排");
      }
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  function selectWorkflow(workflow: CanvasWorkflow) {
    stageRef.current?.classList.remove("canvas-stage-viewport-moving");
    syncCanvasViewportDetail(stageRef.current, workflow.graph.viewport.zoom);
    if (canvasHistoryTimerRef.current) clearTimeout(canvasHistoryTimerRef.current);
    canvasHistoryTimerRef.current = null;
    canvasHistoryRef.current = createCanvasHistory(workflow.graph);
    applyingCanvasHistoryRef.current = false;
    activeWorkflowIdRef.current = workflow.id;
    loadRunsRequestRef.current += 1;
    setActiveWorkflow(workflow);
    setNodes(toFlowNodes(workflow.graph.nodes, isMobile));
    setEdges(toFlowEdges(workflow.graph.edges, workflow.graph.nodes));
    setViewport(workflow.graph.viewport);
    setSelectedNodeId(undefined);
    setActiveRun(undefined);
    setLatestSuccessfulNodeRuns(new Map());
    setQuickAdd(null);
    selectedRunIdRef.current = undefined;
    runSelectionIsExplicitRef.current = false;
    dirtyVersionRef.current = 0;
    setDirty(false);
    setMessage(`已载入 ${workflow.name}`);
  }

  async function createWorkflow() {
    setBusy(true);
    try {
      const data = await api<{ workflow: CanvasWorkflow }>("/api/canvas/workflows", {
        method: "POST",
        body: JSON.stringify({ name: `新画布 ${workflows.length + 1}` }),
      });
      setWorkflows((current) => [data.workflow, ...current]);
      selectWorkflow(data.workflow);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function createWorkflowFromTemplate(templateKey: CanvasWorkflowTemplateKey) {
    setBusy(true);
    try {
      const data = await api<{ workflow: CanvasWorkflow }>("/api/canvas/workflows", {
        method: "POST",
        body: JSON.stringify({ templateKey }),
      });
      setWorkflows((current) => [data.workflow, ...current]);
      selectWorkflow(data.workflow);
      setMessage(`已创建模板：${data.workflow.name}`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function resolveSourceVideoNode(nodeId: string) {
    const node = nodes.find((candidate) => candidate.id === nodeId)?.data.canvasNode;
    if (!node || node.type !== "input.source-video" || sourceVideoBusyNodeId) return;
    setSourceVideoBusyNodeId(nodeId);
    try {
      const data = await api<{ source: CanvasSourceVideoSnapshot }>("/api/canvas/source-video", {
        method: "POST",
        body: JSON.stringify({ sourceUrl: String(node.config.sourceUrl || ""), projectName: String(node.config.projectName || "") }),
      });
      updateNodeConfigPatch(nodeId, canvasSourceVideoSnapshotConfig(data.source));
      updateNodeExecutionMode(nodeId, "enabled");
      setMessage(`源视频已解析并入库：${data.source.title || data.source.id}`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setSourceVideoBusyNodeId(undefined);
    }
  }


  async function saveWorkflow(automatic = false) {
    if (!activeWorkflow || busy) return false;
    const workflow = activeWorkflow;
    const savedDirtyVersion = dirtyVersionRef.current;
    setBusy(true);
    try {
      const data = await api<{ workflow: CanvasWorkflow }>(`/api/canvas/workflows/${workflow.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: workflow.name,
          revision: workflow.revision,
          graph: currentGraph(nodes, edges, viewport),
        }),
      });
      setWorkflows((current) => current.map((item) => item.id === data.workflow.id ? data.workflow : item));
      if (activeWorkflowIdRef.current !== workflow.id) return false;
      setActiveWorkflow(data.workflow);
      if (dirtyVersionRef.current === savedDirtyVersion) setDirty(false);
      setMessage(automatic ? "已自动保存" : "画布已保存");
      return true;
    } catch (error) {
      setMessage(errorMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveSchedulerBindings(bindings: CanvasScheduleBindings) {
    if (!activeWorkflow) return undefined;
    if (busy) throw new Error("画布正在保存，请稍后再保存调度绑定。");
    const selectedBindingIds = CANVAS_SCHEDULER_ROLES.map((role) => bindings[role]).filter((nodeId): nodeId is string => Boolean(nodeId));
    if (CANVAS_REQUIRED_SCHEDULER_ROLES.some((role) => !bindings[role]) || new Set(selectedBindingIds).size !== selectedBindingIds.length) {
      throw new Error("五个必需调度角色必须分别绑定不同节点，可选文案角色也不能复用节点。");
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const workflow = activeWorkflow;
    const roleByNodeId = new Map(Object.entries(bindings).map(([role, nodeId]) => [nodeId, role as CanvasSchedulerRole]));
    const graph = currentGraph(nodes, edges, viewport);
    graph.nodes = graph.nodes.map((node) => ({ ...node, schedulerRole: roleByNodeId.get(node.id) }));
    setBusy(true);
    try {
      const data = await api<{ workflow: CanvasWorkflow }>(`/api/canvas/workflows/${workflow.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: workflow.name, revision: workflow.revision, graph }),
      });
      if (activeWorkflowIdRef.current !== workflow.id) return undefined;
      setWorkflows((current) => current.map((item) => item.id === data.workflow.id ? data.workflow : item));
      setActiveWorkflow(data.workflow);
      setNodes(toFlowNodes(data.workflow.graph.nodes, isMobile));
      setEdges(toFlowEdges(data.workflow.graph.edges, data.workflow.graph.nodes));
      setViewport(data.workflow.graph.viewport);
      syncCanvasViewportDetail(stageRef.current, data.workflow.graph.viewport.zoom);
      canvasHistoryRef.current = commitCanvasHistory(canvasHistoryRef.current, data.workflow.graph);
      setDirty(false);
      setMessage("画布调度绑定已保存");
      return data.workflow;
    } catch (error) {
      setMessage(errorMessage(error));
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function duplicateWorkflow(asTemplate = false) {
    if (!activeWorkflow) return;
    setBusy(true);
    try {
      const data = await api<{ workflow: CanvasWorkflow }>(`/api/canvas/workflows/${activeWorkflow.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: asTemplate ? "template-copy" : "duplicate" }),
      });
      setWorkflows((current) => [data.workflow, ...current]);
      selectWorkflow(data.workflow);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function removeWorkflow() {
    if (!activeWorkflow || !window.confirm(`删除“${activeWorkflow.name}”？`)) return;
    setBusy(true);
    try {
      await api(`/api/canvas/workflows/${activeWorkflow.id}`, { method: "DELETE" });
      await loadWorkflows();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function addNode(type: CanvasNodeType, position?: { x: number; y: number }, connection?: QuickAddConnection, port?: CanvasPortDefinition) {
    if (isMobile) return;
    if (connection && port && !isQuickAddPortCompatible(connection, port)) {
      setMessage("端口类型不兼容");
      return;
    }
    if (connection?.handleType === "target" && !connection.multiple && edges.some((edge) => edge.target === connection.nodeId && edge.targetHandle === connection.portId)) {
      setMessage("该输入端口已连接");
      setQuickAdd(null);
      return;
    }
    const id = `${type.replaceAll(".", "-")}-${Date.now()}`;
    const canvasNode = createCanvasNode(type, id, position || { x: 80 + nodes.length * 28, y: 80 + nodes.length * 24 });
    setNodes((current) => [...current, toFlowNode(canvasNode, isMobile)]);
    if (connection && port) {
      const source = connection.handleType === "source" ? nodes.find((node) => node.id === connection.nodeId)?.data.canvasNode : canvasNode;
      const edgeConnection: Connection = connection.handleType === "source"
        ? { source: connection.nodeId, sourceHandle: connection.portId, target: id, targetHandle: port.id }
        : { source: id, sourceHandle: port.id, target: connection.nodeId, targetHandle: connection.portId };
      const edgeColor = source ? getCanvasNodeDefinition(source.type, source.version)?.color : undefined;
      setEdges((current) => addEdge({ ...edgeConnection, id: `edge-${Date.now()}`, type: "flowing", style: { "--canvas-edge-color": edgeColor || "var(--accent)" } as React.CSSProperties }, current));
    }
    setSelectedNodeId(id);
    setQuickAdd(null);
    markDirty();
  }

  function insertSchedulerSkeleton() {
    if (isMobile || !activeWorkflow) return;
    try {
      const graph = currentGraph(nodes, edges, viewport);
      const origin = getCanvasPastePosition();
      const stamp = Date.now();
      const next = createCanvasSchedulerSkeleton(graph, origin, (kind, key, index) => `scheduler-${kind}-${key}-${stamp}-${index}`);
      setNodes(toFlowNodes(next.nodes, isMobile));
      setEdges(toFlowEdges(next.edges, next.nodes));
      setSelectedNodeId(next.nodes.find((node) => node.schedulerRole === "prompt-switch")?.id);
      markDirty();
      setMessage("已插入调度骨架，请填写提示词 1/2/3 与图文正文后保存");
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  function openQuickAdd(clientX: number, clientY: number, connection?: QuickAddConnection) {
    if (isMobile || !activeWorkflow) return;
    const bounds = stageRef.current?.getBoundingClientRect();
    const position = reactFlowRef.current?.screenToFlowPosition({ x: clientX, y: clientY }) || { x: 80, y: 80 };
    setQuickAdd({ screen: { x: clientX - (bounds?.left || 0), y: clientY - (bounds?.top || 0) }, position, connection });
  }

  function startQuickConnection(params: OnConnectStartParams) {
    connectionStartRef.current = resolveQuickAddConnection(nodes, params);
  }

  function finishQuickConnection(event: MouseEvent | TouchEvent, state: FinalConnectionState) {
    const connection = connectionStartRef.current;
    connectionStartRef.current = null;
    if (!connection || state.toNode) return;
    const point = eventPoint(event);
    if (point) openQuickAdd(point.x, point.y, connection);
  }

  function getSelectedNodeIds() {
    const selected = nodes.filter((node) => node.selected).map((node) => node.id);
    if (!selected.length && selectedNodeId && nodes.some((node) => node.id === selectedNodeId)) selected.push(selectedNodeId);
    return selected;
  }

  function getSelectionPayload() {
    const graph = currentGraph(nodes, edges, viewport);
    return createCanvasClipboardPayload(graph.nodes, graph.edges, getSelectedNodeIds());
  }

  function getCanvasPastePosition(offset = 0) {
    const point = canvasPointerRef.current || (() => {
      const bounds = stageRef.current?.getBoundingClientRect();
      return bounds ? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 } : { x: 320, y: 240 };
    })();
    const position = reactFlowRef.current?.screenToFlowPosition(point) || { x: 80, y: 80 };
    return { x: position.x + offset, y: position.y + offset };
  }

  function pasteCanvasPayload(payload: CanvasClipboardPayload, position = getCanvasPastePosition()) {
    if (isMobile || !activeWorkflow) return;
    try {
      const sequence = ++pasteSequenceRef.current;
      const fragment = prepareCanvasClipboardPaste(
        currentGraph(nodes, edges, viewport),
        payload,
        position,
        (kind, index) => `${kind}-paste-${Date.now()}-${sequence}-${index}`,
      );
      const pastedNodes = fragment.nodes.map((node) => ({ ...toFlowNode(node, isMobile), selected: true }));
      setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), ...pastedNodes]);
      setEdges((current) => [...current, ...toFlowEdges(fragment.edges, fragment.nodes)]);
      setSelectedNodeId(fragment.nodes[0]?.id);
      markDirty();
      const clearedRoles = fragment.clearedSchedulerRoles.map((role) => CANVAS_SCHEDULER_ROLE_LABELS[role]).join("、");
      setMessage(clearedRoles
        ? `已粘贴 ${fragment.nodes.length} 个节点；已清除冲突调度角色：${clearedRoles}`
        : `已粘贴 ${fragment.nodes.length} 个节点`);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function copySelectedNodes(removeAfterCopy = false) {
    const payload = getSelectionPayload();
    if (!payload) return;
    canvasClipboardRef.current = payload;
    let copiedToSystem = false;
    try {
      const writeText = navigator.clipboard?.writeText;
      if (writeText) {
        await writeText.call(navigator.clipboard, JSON.stringify(payload));
        copiedToSystem = true;
      }
    } catch {
      copiedToSystem = false;
    }
    if (removeAfterCopy) removeSelectedNodes();
    else setMessage(copiedToSystem
      ? `已复制 ${payload.nodes.length} 个节点`
      : `已复制 ${payload.nodes.length} 个节点到画布剪贴板`);
  }

  function duplicateSelectedNodes() {
    const payload = getSelectionPayload();
    if (!payload) return;
    const minX = Math.min(...payload.nodes.map((node) => node.position.x));
    const minY = Math.min(...payload.nodes.map((node) => node.position.y));
    pasteCanvasPayload(payload, { x: minX + 32, y: minY + 32 });
  }

  function removeSelectedNodes() {
    const selected = new Set(getSelectedNodeIds());
    if (!selected.size) return;
    setNodes((current) => current.filter((node) => !selected.has(node.id)));
    setEdges((current) => current.filter((edge) => !selected.has(edge.source) && !selected.has(edge.target)));
    setSelectedNodeId(undefined);
    markDirty();
    setMessage(`已删除 ${selected.size} 个节点`);
  }

  async function importImageFiles(files: File[], targetNodeId?: string, position = getCanvasPastePosition()) {
    if (!files.length || !activeWorkflow || mediaBusy) return;
    if (!targetNodeId && isMobile) return;
    setMediaBusy(true);
    try {
      const target = targetNodeId
        ? nodes.find((flowNode) => flowNode.id === targetNodeId && ["input.images", "model.gpt-image", "model.seedance"].includes(flowNode.data.canvasNode.type))
        : undefined;
      const isGptReference = target?.data.canvasNode.type === "model.gpt-image" && target.data.canvasNode.version >= 2;
      const isSeedanceReference = target?.data.canvasNode.type === "model.seedance";
      const configKey = isGptReference || isSeedanceReference ? "referenceUrls" : "urls";
      const currentUrls = target ? normalizeConfigUrls(target.data.canvasNode.config[configKey]) : [];
      if (isGptReference) {
        if (currentUrls.length + files.length > 16) throw new Error(`GPT-Image-2 最多支持 16 张参考图片，当前 ${currentUrls.length} 张。`);
        const invalid = files.find((file) => !["image/png", "image/jpeg"].includes(file.type) || file.size > 50 * 1024 * 1024);
        if (invalid) throw new Error(`${invalid.name} 必须是 PNG/JPEG 且不超过 50MB。`);
      }
      if (isSeedanceReference && target) {
        const fixedCount = resolveSeedanceFixedReferences(editableGraph, target.id).length;
        if (fixedCount + files.length > 9) throw new Error(`Seedance 最多支持 9 张参考图片，当前已有 ${fixedCount} 张。`);
        const invalid = files.find((file) => !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type));
        if (invalid) throw new Error(`${invalid.name} 必须是 PNG、JPEG、WebP 或 GIF 图片。`);
      }
      const imageUrls: string[] = [];
      for (const file of files) {
        const form = new FormData();
        form.append("files", file);
        if (isGptReference) form.append("mode", "gpt-reference");
        if (isSeedanceReference) form.append("mode", "seedance-reference");
        const response = await fetch("/api/canvas/media", { method: "POST", body: form });
        const data = await response.json() as { images?: Array<{ imageUrl: string }>; error?: string };
        if (!response.ok || !data.images?.length) throw new Error(data.error || `Image import failed (${response.status})`);
        imageUrls.push(...data.images.map((image) => image.imageUrl));
      }
      if (target) {
        setNodes((current) => current.map((node) => {
          if (node.id !== target.id) return node;
          const urls = normalizeConfigUrls(node.data.canvasNode.config[configKey]);
          return { ...node, data: { canvasNode: { ...node.data.canvasNode, config: { ...node.data.canvasNode.config, [configKey]: Array.from(new Set([...urls, ...imageUrls])) } } } };
        }));
        setSelectedNodeId(target.id);
      } else {
        const id = `input-images-${Date.now()}-${++pasteSequenceRef.current}`;
        const canvasNode = createCanvasNode("input.images", id, position);
        canvasNode.config.urls = imageUrls;
        setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), { ...toFlowNode(canvasNode, isMobile), selected: true }]);
        setSelectedNodeId(id);
      }
      markDirty();
      setMessage(`已导入 ${imageUrls.length} 张图片`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setMediaBusy(false);
    }
  }

  async function importVideoFiles(files: File[], targetNodeId?: string, position = getCanvasPastePosition()) {
    if (!files.length || !activeWorkflow) return;
    if (!targetNodeId && isMobile) return;
    if (videoUploadTasks.some((task) => task.status === "queued" || task.status === "uploading")) {
      setMessage("请等待当前视频批次上传完成后再继续添加。");
      return;
    }
    const target = targetNodeId ? nodes.find((candidate) => candidate.id === targetNodeId && candidate.data.canvasNode.type === "input.video-loader") : undefined;
    const existing = target ? canvasVideoSnapshotsFromConfig(target.data.canvasNode.config) : [];
    const reserved = videoUploadTasks.filter((task) => task.nodeId === target?.id).length;
    if (existing.length + reserved + files.length > MAX_CANVAS_VIDEO_LOADER_ITEMS) {
      setMessage(`视频加载节点最多支持 ${MAX_CANVAS_VIDEO_LOADER_ITEMS} 个视频，当前已有 ${existing.length} 个。`);
      return;
    }
    const nodeId = target?.id || `input-video-loader-${Date.now()}-${++pasteSequenceRef.current}`;
    if (!target) {
      const canvasNode = createCanvasNode("input.video-loader", nodeId, position);
      canvasNode.executionMode = "disabled";
      setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), { ...toFlowNode(canvasNode, isMobile), selected: true }]);
      setSelectedNodeId(nodeId);
      markDirty();
    }
    const tasks = files.map((file, index): CanvasVideoUploadTask => ({
      id: `video-upload-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
      nodeId,
      file,
      progress: 0,
      status: "queued",
    }));
    setVideoUploadTasks((current) => [...current, ...tasks]);
    for (const task of tasks) await runVideoUploadTask(task);
  }

  async function runVideoUploadTask(task: CanvasVideoUploadTask) {
    const target = nodes.find((flowNode) => flowNode.id === task.nodeId && flowNode.data.canvasNode.type === "input.video-loader");
    if (target && canvasVideoSnapshotsFromConfig(target.data.canvasNode.config).length >= MAX_CANVAS_VIDEO_LOADER_ITEMS) {
      const error = `视频加载节点最多支持 ${MAX_CANVAS_VIDEO_LOADER_ITEMS} 个视频。`;
      setVideoUploadTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: "failed", error } : item));
      setMessage(error);
      return;
    }
    setVideoUploadTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: "uploading", progress: 0, error: undefined } : item));
    try {
      const video = await uploadCanvasVideo(task.file, (progress) => {
        setVideoUploadTasks((current) => current.map((item) => item.id === task.id ? { ...item, progress } : item));
      });
      setNodes((current) => current.map((flowNode) => {
        if (flowNode.id !== task.nodeId || flowNode.data.canvasNode.type !== "input.video-loader") return flowNode;
        const node = flowNode.data.canvasNode;
        const videos = canvasVideoSnapshotsFromConfig(node.config);
        const config = canvasVideoLoaderConfig([...videos, video], String(node.config.selectedVideoId || ""));
        return { ...flowNode, data: { canvasNode: { ...node, config, executionMode: "enabled" } } };
      }));
      setVideoUploadTasks((current) => current.filter((item) => item.id !== task.id));
      setSelectedNodeId(task.nodeId);
      markDirty();
      setMessage(`已加载视频：${video.filename}`);
    } catch (error) {
      setVideoUploadTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: "failed", error: errorMessage(error) } : item));
      setMessage(errorMessage(error));
    }
  }

  function handleCanvasMediaDragOver(event: React.DragEvent<HTMLDivElement>) {
    const hasVideo = dataTransferHasVideoFile(event.dataTransfer);
    const videoBusy = videoUploadTasks.some((task) => task.status === "queued" || task.status === "uploading");
    if (isMobile || !activeWorkflow || mediaBusy || (hasVideo && videoBusy) || (!dataTransferHasImageFile(event.dataTransfer) && !hasVideo)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  async function handleCanvasMediaDrop(event: React.DragEvent<HTMLDivElement>) {
    if (isMobile || !activeWorkflow || mediaBusy) return;
    const videoFiles = dataTransferVideoFiles(event.dataTransfer);
    if (videoFiles.length) {
      event.preventDefault();
      event.stopPropagation();
      if (videoUploadTasks.some((task) => task.status === "queued" || task.status === "uploading")) {
        setMessage("请等待当前视频批次上传完成后再继续添加。");
        return;
      }
      const position = reactFlowRef.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) || { x: 80, y: 80 };
      await importVideoFiles(videoFiles, canvasVideoDropTargetId(event.target, nodes), position);
      return;
    }
    const files = dataTransferImageFiles(event.dataTransfer);
    if (!files.length) return;
    event.preventDefault();
    event.stopPropagation();
    const position = reactFlowRef.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) || { x: 80, y: 80 };
    const targetNodeId = canvasImageDropTargetId(event.target, nodes);
    await importImageFiles(files, targetNodeId, position);
  }

  async function pasteFromSystemClipboard(targetNodeId?: string) {
    const readText = navigator.clipboard?.readText;
    if (!readText) {
      if (!targetNodeId && canvasClipboardRef.current) pasteCanvasPayload(canvasClipboardRef.current);
      else setMessage("系统剪贴板不可访问");
      return;
    }
    try {
      const read = navigator.clipboard?.read;
      if (read) {
        const clipboardItems = await read.call(navigator.clipboard);
        const imageFiles = await clipboardImageFiles(clipboardItems);
        if (imageFiles.length) {
          await importImageFiles(imageFiles, targetNodeId);
          return;
        }
      }
      const payload = parseCanvasClipboardPayload(await readText.call(navigator.clipboard));
      if (payload && !targetNodeId) {
        pasteCanvasPayload(payload);
        return;
      }
      setMessage("剪贴板中没有可导入的图片或画布节点");
    } catch (error) {
      if (!targetNodeId && canvasClipboardRef.current) pasteCanvasPayload(canvasClipboardRef.current);
      else setMessage(errorMessage(error));
    }
  }

  function exportWorkflowFile() {
    if (!activeWorkflow) return;
    try {
      const workflowFile = createCanvasWorkflowFile(activeWorkflow.name, currentGraph(nodes, edges, viewport));
      const url = URL.createObjectURL(new Blob([`${JSON.stringify(workflowFile, null, 2)}\n`], { type: "application/json;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = canvasWorkflowFileName(workflowFile.name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMessage(`已导出工作流：${workflowFile.name}`);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  async function importWorkflowFile(file: File) {
    if (busy) return;
    setBusy(true);
    try {
      if (file.size > CANVAS_WORKFLOW_FILE_MAX_BYTES) throw new Error("工作流文件不能超过 10 MB");
      const workflowFile = parseCanvasWorkflowFile(await file.text());
      const data = await api<{ workflow: CanvasWorkflow }>("/api/canvas/workflows", {
        method: "POST",
        body: JSON.stringify({ name: workflowFile.name, graph: workflowFile.graph }),
      });
      setWorkflows((current) => [data.workflow, ...current]);
      selectWorkflow(data.workflow);
      setMessage(`已导入工作流：${data.workflow.name}`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    if (isMobile && changes.some((change) => change.type !== "select")) return;
    setNodes((current) => applyCanvasNodeChanges(changes, current));
    if (changes.some(isDurableCanvasNodeChange)) markDirty();
  }, [isMobile, markDirty]);

  const onEdgesChange = useCallback((changes: EdgeChange<FlowEdge>[]) => {
    if (isMobile) return;
    setEdges((current) => applyEdgeChanges(changes, current));
    markDirty();
  }, [isMobile, markDirty]);

  const onConnect = useCallback((connection: Connection) => {
    if (isMobile || !connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return;
    const source = nodes.find((node) => node.id === connection.source)?.data.canvasNode;
    const target = nodes.find((node) => node.id === connection.target)?.data.canvasNode;
    const output = source && getCanvasNodeDefinition(source.type, source.version)?.outputs.find((port) => port.id === connection.sourceHandle);
    const input = target && getCanvasNodeDefinition(target.type, target.version)?.inputs.find((port) => port.id === connection.targetHandle);
    if (!output || !input || !areCanvasPortKindsCompatible(output.kind, input.kind)) {
      setMessage("端口类型不兼容");
      return;
    }
    if (!input.multiple && edges.some((edge) => edge.target === connection.target && edge.targetHandle === connection.targetHandle)) {
      setMessage(`${input.label} 仅允许一条连线`);
      return;
    }
    if (wouldCreateCycle(edges, connection.source, connection.target)) {
      setMessage("V1 仅支持无环工作流");
      return;
    }
    const edgeColor = source ? getCanvasNodeDefinition(source.type, source.version)?.color : undefined;
    setEdges((current) => addEdge({
      ...connection,
      id: `edge-${Date.now()}`,
      type: "flowing",
      style: { "--canvas-edge-color": edgeColor || "var(--accent)" } as React.CSSProperties,
    }, current));
    markDirty();
  }, [edges, isMobile, markDirty, nodes]);

  function updateSelectedConfig(key: string, value: CanvasEditableConfigValue) {
    if (selectedNodeId) updateNodeConfig(selectedNodeId, key, value);
  }

  async function requestRun(targetNodeIds?: string[], runMode: CanvasRunMode = "with-upstream") {
    if (!activeWorkflow) return;
    if (dirty) {
      const saved = await saveWorkflow(false);
      if (!saved) return;
    }
    setBusy(true);
    try {
      const data = await api<{ plan: CanvasRunPlan }>("/api/canvas/runs", {
        method: "POST",
        body: JSON.stringify({ action: "plan", workflowId: activeWorkflow.id, targetNodeIds, runMode }),
      });
      if (data.plan.preflightBlocked) throw new Error(data.plan.blockers[0]?.message || "运行预检未通过");
      await startRun(data.plan, targetNodeIds, runMode);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function startRun(plan: CanvasRunPlan, targetNodeIds?: string[], runMode: CanvasRunMode = "with-upstream") {
    if (!activeWorkflow) return;
    setBusy(true);
    try {
      const data = await api<{ run: CanvasRun }>("/api/canvas/runs", {
        method: "POST",
        body: JSON.stringify({
          workflowId: activeWorkflow.id,
          targetNodeIds,
          runMode,
          confirmed: true,
          confirmationNodeIds: plan.confirmationNodeIds,
        }),
      });
      selectedRunIdRef.current = data.run.id;
      runSelectionIsExplicitRef.current = false;
      await loadRuns(activeWorkflow.id);
      await refreshRun(data.run.id);
      setMessage("运行已加入队列");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function loadRuns(workflowId: string) {
    const requestId = ++loadRunsRequestRef.current;
    try {
      const data = await api<{ runs: CanvasRun[]; latestSuccessfulNodeRuns: CanvasLatestSuccessfulNodeRun[] }>(`/api/canvas/runs?workflowId=${encodeURIComponent(workflowId)}`);
      if (activeWorkflowIdRef.current !== workflowId || loadRunsRequestRef.current !== requestId) return;
      setLatestSuccessfulNodeRuns(new Map(data.latestSuccessfulNodeRuns.map((item) => [item.nodeRun.nodeId, item])));
      const explicitRun = runSelectionIsExplicitRef.current
        ? data.runs.find((run) => run.id === selectedRunIdRef.current)
        : undefined;
      const selectedRun = explicitRun || data.runs[0];
      if (selectedRun) {
        selectedRunIdRef.current = selectedRun.id;
        await refreshRun(selectedRun.id, workflowId);
      } else {
        selectedRunIdRef.current = undefined;
        setActiveRun(undefined);
      }
    } catch (error) {
      if (activeWorkflowIdRef.current === workflowId && loadRunsRequestRef.current === requestId) setMessage(errorMessage(error));
    }
  }

  async function openTaskCenter() {
    setScheduleCenterOpen(false);
    setTaskCenterOpen(true);
    await loadTaskCenterRuns(selectedRunIdRef.current);
  }

  async function openScheduleCenter() {
    if (dirty) {
      const saved = await saveWorkflow(false);
      if (!saved) return;
    }
    setTaskCenterOpen(false);
    setScheduleCenterOpen(true);
  }

  async function loadTaskCenterRuns(preferredRunId?: string) {
    const requestId = ++taskCenterRequestRef.current;
    setTaskCenterBusy(true);
    setTaskCenterError("");
    try {
      const data = await api<{ runs: CanvasRun[] }>("/api/canvas/runs");
      if (taskCenterRequestRef.current !== requestId) return;
      setTaskRuns(data.runs);
      const selected = data.runs.find((run) => run.id === (preferredRunId || selectedTaskRunId)) || data.runs[0];
      if (selected) await loadTaskRun(selected.id, requestId);
      else {
        setSelectedTaskRunId(undefined);
        setSelectedTaskRun(undefined);
      }
    } catch (error) {
      if (taskCenterRequestRef.current === requestId) setTaskCenterError(errorMessage(error));
    } finally {
      if (taskCenterRequestRef.current === requestId) setTaskCenterBusy(false);
    }
  }

  async function loadTaskRun(runId: string, parentRequestId?: number) {
    const requestId = parentRequestId || ++taskCenterRequestRef.current;
    setSelectedTaskRunId(runId);
    setTaskCenterBusy(true);
    setTaskCenterError("");
    try {
      const data = await api<CanvasRunWithNodes>(`/api/canvas/runs/${runId}`);
      if (taskCenterRequestRef.current !== requestId || data.run.id !== runId) return;
      setSelectedTaskRun(data);
      setTaskRuns((current) => mergeTaskRunHistory(current, data.run));
      if (data.run.workflowId === activeWorkflowIdRef.current) {
        selectedRunIdRef.current = data.run.id;
        runSelectionIsExplicitRef.current = true;
        setActiveRun(data);
      }
    } catch (error) {
      if (taskCenterRequestRef.current === requestId) setTaskCenterError(errorMessage(error));
    } finally {
      if (taskCenterRequestRef.current === requestId) setTaskCenterBusy(false);
    }
  }

  async function refreshRun(runId: string, expectedWorkflowId = activeWorkflowIdRef.current) {
    try {
      const data = await api<CanvasRunWithNodes>(`/api/canvas/runs/${runId}`);
      if (!expectedWorkflowId || activeWorkflowIdRef.current !== expectedWorkflowId || data.run.workflowId !== expectedWorkflowId) return;
      setTaskRuns((current) => current.length ? mergeTaskRunHistory(current, data.run) : current);
      setSelectedTaskRun((current) => current?.run.id === data.run.id ? data : current);
      if (selectedRunIdRef.current !== runId) return;
      setActiveRun(data);
      setLatestSuccessfulNodeRuns((current) => {
        const next = new Map(current);
        for (const nodeRun of latestAttempts(data.nodeRuns).values()) {
          if (nodeRun.status !== "completed" || !Object.keys(nodeRun.outputs).length) continue;
          const previous = next.get(nodeRun.nodeId);
          if (!previous || Date.parse(previous.runCreatedAt) <= Date.parse(data.run.createdAt)) {
            next.set(nodeRun.nodeId, {
              runId: data.run.id,
              workflowRevision: data.run.workflowRevision,
              runCreatedAt: data.run.createdAt,
              nodeVersion: data.run.graphSnapshot.nodes.find((item) => item.id === nodeRun.nodeId)?.version || 1,
              nodeConfig: structuredClone(data.run.graphSnapshot.nodes.find((item) => item.id === nodeRun.nodeId)?.config || {}),
              nodeRun,
            });
          }
        }
        return next;
      });
    } catch (error) {
      if (activeWorkflowIdRef.current === expectedWorkflowId && selectedRunIdRef.current === runId) setMessage(errorMessage(error));
    }
  }

  async function runAction(action: "cancel" | "retry", nodeId?: string) {
    if (!activeRun) return;
    setBusy(true);
    try {
      await api(`/api/canvas/runs/${activeRun.run.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action, nodeId }),
      });
      await refreshRun(activeRun.run.id);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function scheduleCanvasHistoryCommit() {
    if (canvasHistoryTimerRef.current) clearTimeout(canvasHistoryTimerRef.current);
    canvasHistoryRef.current = commitCanvasHistory(canvasHistoryRef.current, currentGraph(nodes, edges, viewport));
    canvasHistoryTimerRef.current = null;
  }

  function restoreCanvasHistory(direction: -1 | 1) {
    if (!activeWorkflow || busy) return;
    scheduleCanvasHistoryCommit();
    const step = stepCanvasHistory(canvasHistoryRef.current, currentGraph(nodes, edges, viewport), direction);
    canvasHistoryRef.current = step.history;
    if (!step.graph) {
      setMessage(direction < 0 ? "没有可撤销的操作" : "没有可重做的操作");
      return;
    }
    applyingCanvasHistoryRef.current = true;
    setNodes(toFlowNodes(step.graph.nodes, isMobile));
    setEdges(toFlowEdges(step.graph.edges, step.graph.nodes));
    setViewport(step.graph.viewport);
    syncCanvasViewportDetail(stageRef.current, step.graph.viewport.zoom);
    void reactFlowRef.current?.setViewport(step.graph.viewport);
    setSelectedNodeId(undefined);
    setQuickAdd(null);
    markDirty();
    setMessage(direction < 0 ? "已撤销" : "已重做");
  }

  useEffect(() => {
    const handleCopy = (event: ClipboardEvent) => {
      if (isMobile || isEditableClipboardTarget(event.target)) return;
      const payload = getSelectionPayload();
      if (!payload) return;
      canvasClipboardRef.current = payload;
      const serialized = JSON.stringify(payload);
      event.preventDefault();
      event.clipboardData?.setData(CANVAS_CLIPBOARD_MIME, serialized);
      event.clipboardData?.setData("text/plain", serialized);
      setMessage(`已复制 ${payload.nodes.length} 个节点`);
    };
    const handleCut = (event: ClipboardEvent) => {
      if (isMobile || isEditableClipboardTarget(event.target)) return;
      const payload = getSelectionPayload();
      if (!payload) return;
      canvasClipboardRef.current = payload;
      const serialized = JSON.stringify(payload);
      event.preventDefault();
      event.clipboardData?.setData(CANVAS_CLIPBOARD_MIME, serialized);
      event.clipboardData?.setData("text/plain", serialized);
      removeSelectedNodes();
    };
    const handlePaste = (event: ClipboardEvent) => {
      if (isEditableClipboardTarget(event.target) || !event.clipboardData) return;
      const imageFiles = dataTransferImageFiles(event.clipboardData);
      if (imageFiles.length) {
        const targetImageNodeId = selectedCanvasNode && (selectedCanvasNode.type === "input.images" || (selectedCanvasNode.type === "model.gpt-image" && selectedCanvasNode.version >= 2))
          ? selectedCanvasNode.id
          : undefined;
        if (isMobile && !targetImageNodeId) return;
        event.preventDefault();
        void importImageFiles(imageFiles, targetImageNodeId);
        return;
      }
      if (isMobile) return;
      const serialized = event.clipboardData.getData(CANVAS_CLIPBOARD_MIME) || event.clipboardData.getData("text/plain");
      const payload = parseCanvasClipboardPayload(serialized);
      if (!payload) return;
      event.preventDefault();
      pasteCanvasPayload(payload);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isMobile || preview || event.defaultPrevented || isEditableClipboardTarget(event.target)) return;
      const commandKey = event.ctrlKey || event.metaKey;
      if (event.repeat) return;
      if (commandKey && event.altKey && !event.shiftKey && event.key === "Enter") {
        event.preventDefault();
        if (activeRun && !terminalStatuses.has(activeRun.run.status) && !busy) void runAction("cancel");
        return;
      }
      if (commandKey && !event.altKey && !event.shiftKey && event.key === "Enter") {
        event.preventDefault();
        if (activeWorkflow && nodes.length && !busy) void requestRun();
        return;
      }
      if (commandKey && !event.altKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (activeWorkflow && !busy) void saveWorkflow();
        return;
      }
      if (commandKey && !event.altKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        restoreCanvasHistory(event.shiftKey ? 1 : -1);
        return;
      }
      if (commandKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "y") {
        event.preventDefault();
        restoreCanvasHistory(1);
        return;
      }
      if (commandKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        if (!activeWorkflow || !nodes.length) return;
        setNodes((current) => current.map((node) => ({ ...node, selected: true })));
        setSelectedNodeId(nodes.at(-1)?.id);
        return;
      }
      if (event.key === "Tab" && activeWorkflow) {
        event.preventDefault();
        const point = canvasPointerRef.current || stageCenter(stageRef.current);
        openQuickAdd(point.x, point.y);
        return;
      }
      if (commandKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelectedNodes();
      }
    };
    document.addEventListener("copy", handleCopy);
    document.addEventListener("cut", handleCut);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("cut", handleCut);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("keydown", handleKeyDown);
    };
  });

  return (
    <main className="canvas-shell">
      <header className="canvas-toolbar">
        <div className="canvas-brand"><Layers3 className="h-5 w-5" /><strong>FluxPost Canvas</strong></div>
        <Link className="canvas-icon-button" href="/" aria-label="返回工作台" title="返回工作台"><Home className="h-4 w-4" /></Link>
        <button
          className="canvas-icon-button canvas-palette-toggle"
          type="button"
          onClick={() => setPaletteVisible((current) => !current)}
          aria-label={paletteVisible ? "隐藏节点库" : "显示节点库"}
          aria-pressed={paletteVisible}
          title={paletteVisible ? "隐藏节点库" : "显示节点库"}
        >
          {paletteVisible ? <PanelLeftClose /> : <PanelLeftOpen />}
        </button>
        <select className="canvas-workflow-select" value={activeWorkflow?.id || ""} onChange={(event) => {
          const workflow = workflows.find((item) => item.id === event.target.value);
          if (workflow) selectWorkflow(workflow);
        }}>
          <option value="">选择画布</option>
          {workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}{workflow.isTemplate ? " · 模板" : ""}</option>)}
        </select>
        <select className="canvas-template-select" value="" disabled={busy} aria-label="创建画布模板" onChange={(event) => {
          const templateKey = event.target.value as CanvasWorkflowTemplateKey;
          if (templateKey) void createWorkflowFromTemplate(templateKey);
        }}>
          <option value="">模板</option>
          <option value="video-reconstruct-seedance">视频重构 · Seedance</option>
          <option value="video-reconstruct-gpt-image">视频重构 · GPT 图片</option>
        </select>
        <input className="canvas-name-input" value={activeWorkflow?.name || ""} disabled={!activeWorkflow} aria-label="画布名称" onChange={(event) => {
          setActiveWorkflow((current) => current ? { ...current, name: event.target.value } : current);
          markDirty();
        }} />
        <div className="canvas-selection-actions" aria-label="节点操作">
          <button type="button" onClick={insertSchedulerSkeleton} disabled={isMobile || !activeWorkflow} aria-label="插入调度骨架" title="插入调度骨架"><GitBranch /></button>
          <button type="button" onClick={() => void copySelectedNodes()} disabled={isMobile || !getSelectedNodeIds().length} aria-label="复制节点" aria-keyshortcuts="Control+C Meta+C" title="复制节点"><Copy /></button>
          <button type="button" onClick={() => void copySelectedNodes(true)} disabled={isMobile || !getSelectedNodeIds().length} aria-label="剪切节点" aria-keyshortcuts="Control+X Meta+X" title="剪切节点"><Scissors /></button>
          <button type="button" onClick={() => void pasteFromSystemClipboard()} disabled={isMobile || !activeWorkflow || mediaBusy} aria-label="粘贴" aria-keyshortcuts="Control+V Meta+V" title="粘贴"><ClipboardPaste /></button>
          <button type="button" onClick={duplicateSelectedNodes} disabled={isMobile || !getSelectedNodeIds().length} aria-label="创建节点副本" aria-keyshortcuts="Control+D Meta+D" title="创建节点副本"><CopyPlus /></button>
          <button type="button" onClick={removeSelectedNodes} disabled={isMobile || !getSelectedNodeIds().length} aria-label="删除节点" aria-keyshortcuts="Delete Backspace" title="删除节点"><Trash2 /></button>
        </div>
        <div className="canvas-toolbar-actions">
          <ToolbarButton label="新建" icon={<Plus />} onClick={createWorkflow} disabled={busy} />
          <ToolbarButton label="保存" icon={busy ? <LoaderCircle className="animate-spin" /> : <Save />} onClick={() => void saveWorkflow()} disabled={!activeWorkflow || busy} ariaKeyShortcuts="Control+S Meta+S" />
          <ToolbarButton label="导入" ariaLabel="导入工作流" icon={<FileUp />} onClick={() => workflowFileInputRef.current?.click()} disabled={busy} />
          <ToolbarButton label="导出" ariaLabel="导出工作流" icon={<FileDown />} onClick={exportWorkflowFile} disabled={!activeWorkflow || busy} />
          <ToolbarButton label="复制" icon={<Copy />} onClick={() => void duplicateWorkflow()} disabled={!activeWorkflow || busy} />
          <ToolbarButton label="存为模板" icon={<FileText />} onClick={() => void duplicateWorkflow(true)} disabled={!activeWorkflow || busy} />
          <ToolbarButton label="删除" icon={<Trash2 />} onClick={() => void removeWorkflow()} disabled={!activeWorkflow || busy} danger />
          <input
            ref={workflowFileInputRef}
            hidden
            type="file"
            accept="application/json,.json,.fluxpost-workflow.json"
            aria-label="导入工作流文件"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void importWorkflowFile(file);
            }}
          />
        </div>
        <button className="canvas-icon-button canvas-mobile-menu" type="button" onClick={() => setMobilePalette(true)} aria-label="打开节点库"><Menu className="h-4 w-4" /></button>
      </header>

      <section className={`canvas-workspace ${!paletteVisible ? "canvas-workspace-palette-hidden" : ""}`}>
        <aside className={`canvas-palette ${!paletteVisible ? "canvas-palette-collapsed" : ""} ${mobilePalette ? "canvas-palette-open" : ""}`}>
          <div className="canvas-pane-heading"><span>节点库</span><button className="canvas-palette-dismiss" type="button" onClick={() => isMobile ? setMobilePalette(false) : setPaletteVisible(false)} aria-label="关闭节点库" title="隐藏节点库"><PanelLeftClose /></button></div>
          {(["input", "model", "utility", "compose", "publish"] as const).map((category) => (
            <div className="canvas-palette-group" key={category}>
              <small>{categoryLabel(category)}</small>
              {canvasNodeDefinitions.filter((definition) => definition.category === category).map((definition) => (
                <button key={definition.type} type="button" onClick={() => addNode(definition.type)} disabled={isMobile || !activeWorkflow}>
                  <span style={{ color: definition.color }}>{iconForNode(definition.type)}</span>
                  <span><strong>{definition.label}</strong><small>{definition.description}</small></span>
                </button>
              ))}
            </div>
          ))}
        </aside>

        <div className="canvas-stage" data-testid="canvas-stage" ref={stageRef} onDragOver={(event) => handleCanvasMediaDragOver(event)} onDrop={(event) => void handleCanvasMediaDrop(event)} onContextMenu={(event) => {
          const target = event.target instanceof Element ? event.target : null;
          if (isEditableClipboardTarget(event.target) || isMobile || !activeWorkflow || !target?.closest(".react-flow__pane")) return;
          event.preventDefault();
          openQuickAdd(event.clientX, event.clientY);
        }} onPointerMove={(event) => { canvasPointerRef.current = { x: event.clientX, y: event.clientY }; }} onPointerLeave={() => { canvasPointerRef.current = null; }}>
          {activeWorkflow ? <CanvasNodeInteractionContext.Provider value={nodeInteraction}><ReactFlow<FlowNode, FlowEdge>
            nodes={displayedNodes}
            edges={displayedEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectStart={(_, params) => startQuickConnection(params)}
            onConnectEnd={finishQuickConnection}
            onInit={(instance) => { reactFlowRef.current = instance; syncCanvasViewportDetail(stageRef.current, instance.getViewport().zoom); }}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => { setSelectedNodeId(undefined); setQuickAdd(null); }}
            onSelectionChange={({ nodes: selectedNodes }) => {
              const selectedNode = selectedNodes.at(-1);
              if (selectedNode) setSelectedNodeId(selectedNode.id);
            }}
            onMoveStart={(_, nextViewport) => { stageRef.current?.classList.add("canvas-stage-viewport-moving"); syncCanvasViewportDetail(stageRef.current, nextViewport.zoom); }}
            onMove={(_, nextViewport) => { syncCanvasViewportDetail(stageRef.current, nextViewport.zoom); }}
            onMoveEnd={(_, nextViewport) => { stageRef.current?.classList.remove("canvas-stage-viewport-moving"); syncCanvasViewportDetail(stageRef.current, nextViewport.zoom); setViewport(nextViewport); markDirty(); }}
            defaultViewport={viewport}
            minZoom={0.2}
            onlyRenderVisibleElements
            panOnDrag={isMobile}
            selectionOnDrag={!isMobile}
            nodesDraggable={!isMobile}
            nodesConnectable={!isMobile}
            elementsSelectable
            deleteKeyCode={isMobile ? null : ["Backspace", "Delete"]}
            fitView={nodes.length > 0}
            colorMode={flowColorMode}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="var(--canvas-grid-dot)" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeColor={(node) => {
              const canvasNode = (node.data as { canvasNode?: CanvasNode } | undefined)?.canvasNode;
              return canvasNode ? getCanvasNodeDefinition(canvasNode.type, canvasNode.version)?.color || "#64748b" : "#64748b";
            }} />
          </ReactFlow></CanvasNodeInteractionContext.Provider> : <div className="canvas-empty"><Layers3 /><strong>尚未创建画布</strong><button type="button" onClick={createWorkflow}><Plus />新建画布</button></div>}
          {quickAdd ? <CanvasQuickAdd
            state={quickAdd}
            edges={edges}
            onChoose={(type, port) => addNode(type, quickAdd.position, quickAdd.connection, port)}
            onClose={() => setQuickAdd(null)}
          /> : null}
        </div>

        <aside className={`canvas-inspector ${selectedCanvasNode ? "canvas-inspector-active" : ""}`}>
          <div className="canvas-pane-heading"><span><PanelRight />属性</span>{selectedCanvasNode ? <button type="button" onClick={() => setSelectedNodeId(undefined)} aria-label="关闭属性"><X /></button> : null}</div>
          {selectedCanvasNode ? <NodeInspector
            node={selectedCanvasNode}
            onChange={updateSelectedConfig}
            onPatch={updateSelectedConfigPatch}
            onLabelChange={(label) => updateNodeLabel(selectedCanvasNode.id, label)}
            onExecutionModeChange={(mode) => updateNodeExecutionMode(selectedCanvasNode.id, mode)}
            onSchedulerRoleChange={(role) => updateNodeSchedulerRole(selectedCanvasNode.id, role)}
            onImportImages={(files) => importImageFiles(files, selectedCanvasNode.id)}
            onPasteImages={() => pasteFromSystemClipboard(selectedCanvasNode.id)}
            onImportVideos={(files) => importVideoFiles(files, selectedCanvasNode.id)}
            videoUploadTasks={videoUploadTasks.filter((task) => task.nodeId === selectedCanvasNode.id)}
            onRetryVideoUpload={(task) => runVideoUploadTask(task)}
            onDismissVideoUpload={(taskId) => setVideoUploadTasks((current) => current.filter((task) => task.id !== taskId))}
            onPreviewVideo={(url, index) => setPreview({ kind: "video", url, index })}
            onResolveSourceVideo={() => resolveSourceVideoNode(selectedCanvasNode.id)}
            sourceVideoBusy={sourceVideoBusyNodeId === selectedCanvasNode.id}
            onPreviewImage={openImagePreview}
            mediaBusy={mediaBusy}
            graph={editableGraph}
            subtitlePreviewMedia={selectedSubtitlePreviewMedia}
            seedanceReferences={selectedSeedanceReferences}
            createSeedanceMentionId={createSeedanceMentionId}
          /> : <div className="canvas-inspector-empty">选择节点查看参数与端口</div>}
        </aside>
      </section>

      <section className="canvas-run-dock">
        <div className="canvas-run-actions">
          <button type="button" onClick={() => void requestRun()} disabled={!activeWorkflow || !nodes.length || busy} aria-keyshortcuts="Control+Enter Meta+Enter"><Play />运行全部</button>
          <button type="button" onClick={() => selectedNodeId && void requestRun([selectedNodeId], "isolated")} disabled={!selectedNodeId || busy}><Square />仅运行此节点</button>
          <button type="button" onClick={() => selectedNodeId && void requestRun([selectedNodeId], "with-upstream")} disabled={!selectedNodeId || busy}><Play />运行到此节点</button>
          {activeRun && !terminalStatuses.has(activeRun.run.status) ? <button type="button" onClick={() => void runAction("cancel")} disabled={busy} aria-keyshortcuts="Control+Alt+Enter Meta+Alt+Enter"><X />取消</button> : null}
        </div>
        <div className="canvas-message"><span className={dirty ? "is-dirty" : ""} />{message}</div>
        {activeRun ? <div className={`canvas-current-run is-${activeRun.run.status}`}><StatusIcon status={activeRun.run.status} /><span>{canvasRunStatusLabel(activeRun.run.status)}</span><small>r{activeRun.run.workflowRevision}</small></div> : <div className="canvas-current-run is-empty"><History /><span>暂无运行</span></div>}
        <div className="canvas-center-buttons">
          <button className="canvas-task-center-button" type="button" onClick={() => void openScheduleCenter()} disabled={!activeWorkflow} aria-haspopup="dialog" aria-label="批量调度" title="批量调度"><ListChecks /><span>批量调度</span></button>
          <button className="canvas-task-center-button" type="button" onClick={() => void openTaskCenter()} aria-haspopup="dialog" aria-label="任务中心" title="任务中心"><History /><span>任务中心</span>{activeTaskCount ? <strong>{activeTaskCount}</strong> : null}</button>
        </div>
      </section>

      {taskCenterOpen ? <CanvasTaskCenter
        runs={taskRuns}
        workflows={workflows}
        selectedRun={selectedTaskRun}
        selectedRunId={selectedTaskRunId}
        busy={taskCenterBusy}
        error={taskCenterError}
        onClose={() => setTaskCenterOpen(false)}
        onRefresh={() => void loadTaskCenterRuns(selectedTaskRunId)}
        onSelect={(runId) => void loadTaskRun(runId)}
        onOpenScheduler={() => { setTaskCenterOpen(false); setScheduleCenterOpen(true); }}
      /> : null}

      {scheduleCenterOpen && activeWorkflow ? <CanvasScheduleCenter
        key={activeWorkflow.id}
        workflow={activeWorkflow}
        graph={editableGraph}
        onSaveBindings={saveSchedulerBindings}
        onPreview={(nextPreview) => setPreview(nextPreview)}
        onClose={() => setScheduleCenterOpen(false)}
        onOpenRuns={() => { setScheduleCenterOpen(false); void openTaskCenter(); }}
      /> : null}

      {preview?.kind === "image" ? <CanvasImagePreviewDialog preview={preview} onClose={() => setPreview(null)} /> : null}
      {preview?.kind === "text" ? <CanvasTextPreviewDialog value={preview.value} onClose={() => setPreview(null)} /> : null}
      {preview?.kind === "video" ? <CanvasVideoPreviewDialog url={preview.url} index={preview.index} onClose={() => setPreview(null)} /> : null}
    </main>
  );
}

function CanvasFlowNode({ data, selected }: NodeProps<FlowNode>) {
  const node = data.canvasNode;
  const definition = getCanvasNodeDefinition(node.type, node.version);
  const interaction = useContext(CanvasNodeInteractionContext);
  if (!definition) return null;
  const imageUrls = node.type === "input.images" || node.type === "input.library-images"
    ? normalizeConfigUrls(node.config.urls)
    : node.type === "input.content-pool"
      ? normalizeConfigUrls(node.config.snapshotImageUrls)
    : node.type === "model.gpt-image" && node.version >= 2
      ? normalizeConfigUrls(node.config.referenceUrls)
      : [];
  const visibleImageUrls = imageUrls.slice(0, 4);
  const loadedVideos = node.type === "input.video-loader" ? canvasVideoSnapshotsFromConfig(node.config) : [];
  const currentLoadedVideo = node.type === "input.video-loader" ? selectedCanvasVideo(node.config) : undefined;
  const nodeRun = interaction?.latestNodeRuns.get(node.id);
  const latestSuccessful = interaction?.latestSuccessfulNodeRuns.get(node.id);
  const historicalRevision = interaction?.activeRun && interaction.workflowRevision !== interaction.activeRun.run.workflowRevision
    ? interaction.activeRun.run.workflowRevision
    : undefined;
  const executionMode = node.executionMode === "bypass" || node.executionMode === "disabled" ? node.executionMode : "enabled";
  const isSelected = selected || interaction?.selectedNodeId === node.id;
  const hasEditableSize = Boolean(node.size && interaction?.canResize);
  const portRows = Array.from({ length: Math.max(definition.inputs.length, definition.outputs.length, 1) }, (_, index) => ({
    input: definition.inputs[index],
    output: definition.outputs[index],
  }));
  return <div className={`canvas-node ${hasEditableSize ? "canvas-node-resized" : ""} ${isSelected ? "canvas-node-selected" : ""} ${executionMode === "bypass" ? "canvas-node-bypassed" : ""} ${executionMode === "disabled" ? "canvas-node-disabled" : ""}`} style={{ "--node-color": definition.color } as React.CSSProperties}>
    <NodeResizer
      isVisible={Boolean(isSelected && interaction?.canResize)}
      minWidth={CANVAS_NODE_SIZE_LIMITS.minWidth}
      minHeight={CANVAS_NODE_SIZE_LIMITS.minHeight}
      maxWidth={CANVAS_NODE_SIZE_LIMITS.maxWidth}
      maxHeight={CANVAS_NODE_SIZE_LIMITS.maxHeight}
      keepAspectRatio={false}
      color={definition.color}
      handleClassName="canvas-node-resize-handle"
      lineClassName="canvas-node-resize-line"
    />
    <div className="canvas-node-head"><span>{iconForNode(node.type)}</span><strong>{node.label || definition.label}</strong><small>{executionMode === "enabled" ? `v${node.version}` : executionMode === "bypass" ? "跳过" : "禁用"}</small>
      <details className="canvas-node-mode-menu nodrag nopan nowheel" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
        <summary aria-label="设置节点状态" title="设置节点状态"><EllipsisVertical /></summary>
        <div role="menu">
          {(["enabled", "bypass", "disabled"] as CanvasNodeExecutionMode[]).map((mode) => <button
            key={mode}
            type="button"
            role="menuitemradio"
            aria-checked={executionMode === mode}
            disabled={mode === "bypass" && !definition.bypass}
            onClick={() => interaction?.onExecutionModeChange(node.id, mode)}
          >{mode === "enabled" ? "启用" : mode === "bypass" ? "跳过" : "禁用"}</button>)}
        </div>
      </details>
    </div>
    <div className="canvas-node-content">
    {node.type === "input.text" ? <CanvasNodeTextEditor
      nodeId={node.id}
      value={String(node.config.text || "")}
      onChange={(value) => interaction?.onConfigChange(node.id, "text", value)}
      onFocus={() => interaction?.onNodeFocus(node.id)}
    /> : null}
    {node.type === "input.source-video" ? <div className="canvas-node-source-video-summary"><FileVideo2 /><div><strong>{String(node.config.sourceTitle || "等待解析源视频")}</strong><small>{isCanvasSourceVideoSnapshotCurrent(node.config) ? `${Number(node.config.sourceDurationSeconds || 0).toFixed(1)} 秒 · ${node.config.sourceWidth}×${node.config.sourceHeight}` : "快照未就绪"}</small></div></div> : null}
    {node.type === "input.video-loader" ? <div className="canvas-node-source-video-summary canvas-video-loader-summary"><FileUp /><div><strong>{currentLoadedVideo?.filename || "等待加载视频"}</strong><small>{currentLoadedVideo ? `${formatMediaDuration(currentLoadedVideo.durationSeconds)} · ${currentLoadedVideo.width}×${currentLoadedVideo.height} · 队列 ${loadedVideos.length}` : "从属性面板选择或拖入视频"}</small></div>{currentLoadedVideo ? <button className="nodrag nopan nowheel" type="button" onClick={(event) => { event.stopPropagation(); interaction?.onPreview({ kind: "video", url: currentLoadedVideo.url, index: loadedVideos.indexOf(currentLoadedVideo) }); }} aria-label="预览当前视频" title="预览"><Play /></button> : null}</div> : null}
    {node.type === "input.copy-library" ? <div className="canvas-node-copy-summary"><BookOpenText /><div><strong>{String(node.config.entryTitle || node.config.snapshotTitle || "未选择文案")}</strong><small>{configStringList(node.config.snapshotTags).slice(0, 3).join(" · ") || "无标签"}</small></div></div> : null}
    {node.type === "utility.text-split" && node.version >= 2 ? <CanvasTextSplitControls
      node={node}
      onChange={(key, value) => interaction?.onConfigChange(node.id, key, value)}
      onFocus={() => interaction?.onNodeFocus(node.id)}
    /> : null}
    {node.type === "utility.text-concatenate" ? <CanvasTextConcatenateControls
      node={node}
      onChange={(key, value) => interaction?.onConfigChange(node.id, key, value)}
      onFocus={() => interaction?.onNodeFocus(node.id)}
    /> : null}
    {visibleImageUrls.length ? <div className={`canvas-node-image-grid is-count-${visibleImageUrls.length}`}>
      {visibleImageUrls.map((url, index) => <button className="nodrag nopan nowheel" type="button" key={`${url}-${index}`} onClick={(event) => {
        event.stopPropagation();
        interaction?.onPreview({ kind: "image", url, index });
      }} aria-label={`在节点中预览图片 ${index + 1}`} title="预览图片">
        <Image src={url} alt="" fill sizes="220px" unoptimized draggable={false} referrerPolicy="no-referrer" />
        {index === 3 && imageUrls.length > 4 ? <span>+{imageUrls.length - 4}</span> : null}
      </button>)}
    </div> : null}
    {node.type === "utility.text-split" ? <CanvasTextSplitNodeResult nodeRun={nodeRun} latestSuccessful={latestSuccessful} historicalRevision={historicalRevision} onPreview={(next) => interaction?.onPreview(next)} />
      : node.type.startsWith("model.") || ["utility.prompt-template", "utility.text-concatenate", "utility.image-select", "utility.image-transform", "utility.video-frames", "utility.video-reconstruct", "utility.video-subtitles"].includes(node.type)
        ? <CanvasModelNodeResult node={node} nodeRun={nodeRun} latestSuccessful={latestSuccessful} historicalRevision={historicalRevision} onPreview={(next) => interaction?.onPreview(next)} />
        : null}
    {node.type === "utility.image-preview" ? <CanvasImagePreviewNodeResult nodeRun={nodeRun} latestSuccessful={latestSuccessful} onPreview={(next) => interaction?.onPreview(next)} /> : null}
    {node.type === "utility.save-images" ? <CanvasSaveImagesNodeResult nodeRun={nodeRun} latestSuccessful={latestSuccessful} /> : null}
    {node.type === "utility.display-any" ? <CanvasDisplayAnyNodeResult nodeRun={nodeRun} latestSuccessful={latestSuccessful} historicalRevision={historicalRevision} onPreview={(next) => interaction?.onPreview(next)} /> : null}
    {node.type === "compose.social-post" ? <CanvasCompositionNodeResult nodeRun={nodeRun} latestSuccessful={latestSuccessful} /> : null}
    </div>
    <div className="canvas-node-ports">
      {portRows.map(({ input, output }, index) => <div className="canvas-port-row" key={`${input?.id || "none"}-${output?.id || "none"}-${index}`}>
        {input ? <div className="canvas-port canvas-port-input"><Handle type="target" position={Position.Left} id={input.id} /><span>{input.label}</span></div> : <span />}
        {output ? <div className="canvas-port canvas-port-output"><span>{output.label}</span><Handle type="source" position={Position.Right} id={output.id} /></div> : <span />}
      </div>)}
    </div>
  </div>;
}

function CanvasNodeTextEditor({
  nodeId,
  value,
  onChange,
  onFocus,
}: {
  nodeId: string;
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
}) {
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (document.activeElement !== editorRef.current) setDraft(value);
  }, [value]);
  return <textarea
    ref={editorRef}
    className="canvas-node-text-editor nodrag nopan nowheel"
    value={draft}
    placeholder="输入文字"
    aria-label="文本节点内容"
    onChange={(event) => {
      const nextValue = event.target.value;
      setDraft(nextValue);
      onChange(nextValue);
    }}
    onFocus={onFocus}
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => {
      event.stopPropagation();
      event.currentTarget.focus({ preventScroll: true });
      onFocus();
    }}
    onDoubleClick={(event) => event.stopPropagation()}
    onKeyDown={(event) => event.stopPropagation()}
    onKeyUp={(event) => event.stopPropagation()}
    onPaste={(event) => event.stopPropagation()}
    onWheel={(event) => event.stopPropagation()}
    data-node-id={nodeId}
  />;
}

function CanvasTextSplitControls({
  node,
  onChange,
  onFocus,
}: {
  node: CanvasNode;
  onChange: (key: string, value: string | number) => void;
  onFocus: () => void;
}) {
  const mode = node.config.mode === "delimiter" ? "delimiter" : "first-line";
  const focusControl = (event: React.MouseEvent<HTMLInputElement | HTMLSelectElement>) => {
    event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    onFocus();
  };
  return <div
    className="canvas-text-split-controls nodrag nopan nowheel"
    onPointerDown={(event) => event.stopPropagation()}
    onDoubleClick={(event) => event.stopPropagation()}
    onKeyDown={(event) => event.stopPropagation()}
    onKeyUp={(event) => event.stopPropagation()}
    onWheel={(event) => event.stopPropagation()}
  >
    <label><span>分割方式</span><select
      aria-label="文本分割方式"
      value={mode}
      onChange={(event) => onChange("mode", event.target.value)}
      onClick={focusControl}
    >
      <option value="first-line">第一行</option>
      <option value="delimiter">自定义分隔符</option>
    </select></label>
    {mode === "delimiter" ? <div className="canvas-text-split-fields">
      <label><span>分隔符</span><input
        aria-label="文本分割符"
        value={String(node.config.delimiter || "")}
        placeholder="---"
        onChange={(event) => onChange("delimiter", event.target.value)}
        onClick={focusControl}
      /></label>
      <label><span>序号</span><input
        aria-label="第几个分隔符"
        type="number"
        min={1}
        step={1}
        value={String(node.config.delimiterIndex ?? 1)}
        onChange={(event) => onChange("delimiterIndex", Number(event.target.value))}
        onClick={focusControl}
      /></label>
    </div> : null}
  </div>;
}

function CanvasTextConcatenateControls({
  node,
  onChange,
  onFocus,
}: {
  node: CanvasNode;
  onChange: (key: string, value: string | boolean) => void;
  onFocus: () => void;
}) {
  return <div
    className="canvas-text-concatenate-controls nodrag nopan nowheel"
    onPointerDown={(event) => event.stopPropagation()}
    onDoubleClick={(event) => event.stopPropagation()}
    onKeyDown={(event) => event.stopPropagation()}
    onKeyUp={(event) => event.stopPropagation()}
    onWheel={(event) => event.stopPropagation()}
  >
    <label><span>分隔符</span><input
      aria-label="文本拼接分隔符"
      value={String(node.config.delimiter ?? "")}
      placeholder="例如：\\n"
      onChange={(event) => onChange("delimiter", event.target.value)}
      onClick={(event) => {
        event.stopPropagation();
        event.currentTarget.focus({ preventScroll: true });
        onFocus();
      }}
    /></label>
    <label className="canvas-text-concatenate-toggle"><span>清理首尾空白</span><input
      type="checkbox"
      aria-label="清理文本首尾空白"
      checked={node.config.clean_whitespace === true}
      onChange={(event) => onChange("clean_whitespace", event.target.checked)}
      onClick={(event) => {
        event.stopPropagation();
        onFocus();
      }}
    /></label>
  </div>;
}

function CanvasImagePreviewNodeResult({
  nodeRun,
  latestSuccessful,
  onPreview,
}: {
  nodeRun?: CanvasNodeRun;
  latestSuccessful?: CanvasLatestSuccessfulNodeRun;
  onPreview: (preview: NonNullable<PreviewState>) => void;
}) {
  const result = nodeRun && getImagesArtifact(nodeRun) ? nodeRun : latestSuccessful?.nodeRun;
  const artifact = result ? getImagesArtifact(result) : undefined;
  if (!result || !artifact) return <div className="canvas-node-result is-idle"><small>等待上游图片结果</small></div>;
  return <div className={`canvas-node-result is-${result.status} nodrag nopan nowheel`}>
    <div className="canvas-node-result-status"><span><CheckCircle2 />{canvasNodeRunStatusLabel(result.status)}</span><small>{artifact.items.length} 张</small></div>
    {latestSuccessful && result.id === latestSuccessful.nodeRun.id ? <div className="canvas-node-result-history">最近成功结果 · r{latestSuccessful.workflowRevision} · {new Date(latestSuccessful.runCreatedAt).toLocaleString()}</div> : null}
    <CanvasResultImageGallery items={artifact.items} onPreview={onPreview} />
  </div>;
}

function CanvasSaveImagesNodeResult({
  nodeRun,
  latestSuccessful,
}: {
  nodeRun?: CanvasNodeRun;
  latestSuccessful?: CanvasLatestSuccessfulNodeRun;
}) {
  const currentArtifact = nodeRun ? getSaveImagesArtifact(nodeRun) : undefined;
  const result = currentArtifact ? nodeRun : latestSuccessful?.nodeRun;
  const artifact = result ? getSaveImagesArtifact(result) : undefined;
  const status = nodeRun?.status || result?.status;
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const downloadBusyRef = useRef(false);

  async function downloadAll() {
    if (downloadBusyRef.current || !result || !artifact) return;
    downloadBusyRef.current = true;
    setBusy(true);
    setFeedback("");
    try {
      const counts = await downloadCanvasSaveImages(result.runId, result.id, artifact.items.length);
      setFeedback(`下载成功 ${counts.success} 张，下载失败 ${counts.failed} 张`);
    } finally {
      downloadBusyRef.current = false;
      setBusy(false);
    }
  }

  if (!status) return <div className="canvas-node-result is-idle"><small>等待上游图片结果</small></div>;
  const isPending = status === "queued" || status === "running";
  const isFailure = ["failed", "blocked", "needs_config", "cancelled"].includes(status);
  return <div
    className={`canvas-node-result is-${status} nodrag nopan nowheel`}
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => event.stopPropagation()}
    onDoubleClick={(event) => event.stopPropagation()}
    onKeyDown={(event) => event.stopPropagation()}
    onKeyUp={(event) => event.stopPropagation()}
    onWheel={(event) => event.stopPropagation()}
  >
    <div className="canvas-node-result-status">
      <span>{isPending ? <LoaderCircle className={status === "running" ? "animate-spin" : ""} /> : isFailure ? <AlertTriangle /> : <CheckCircle2 />}{canvasNodeRunStatusLabel(status)}</span>
      <small>{artifact ? `${artifact.items.length} 张` : `attempt ${nodeRun?.attempt || result?.attempt || 1}`}</small>
    </div>
    {latestSuccessful && result?.id === latestSuccessful.nodeRun.id ? <div className="canvas-node-result-history">最近成功结果 · r{latestSuccessful.workflowRevision} · {new Date(latestSuccessful.runCreatedAt).toLocaleString()}</div> : null}
    {artifact ? <div className="canvas-save-images-actions">
      <button type="button" disabled={busy} onClick={() => void downloadAll()}>
        {busy ? <LoaderCircle className="animate-spin" /> : <Download />}
        {busy ? "下载中" : "下载全部"}
      </button>
      {feedback ? <small className="canvas-save-images-feedback" role="status">{feedback}</small> : null}
    </div> : null}
    {!artifact && isFailure ? <p>{nodeRun?.error || "没有可下载的图片结果"}</p> : null}
  </div>;
}

function CanvasDisplayAnyNodeResult({
  nodeRun,
  latestSuccessful,
  historicalRevision,
  onPreview,
}: {
  nodeRun?: CanvasNodeRun;
  latestSuccessful?: CanvasLatestSuccessfulNodeRun;
  historicalRevision?: number;
  onPreview: (preview: NonNullable<PreviewState>) => void;
}) {
  const selectedArtifact = nodeRun ? getDisplayAnyArtifact(nodeRun) : undefined;
  const artifactRun = selectedArtifact ? nodeRun : latestSuccessful?.nodeRun || nodeRun;
  if (!artifactRun) return <div className="canvas-node-result is-idle"><small>等待上游结果</small></div>;
  const artifact = selectedArtifact || getDisplayAnyArtifact(artifactRun);
  const currentStatus = nodeRun?.status || artifactRun.status;
  const statusLabel = canvasNodeRunStatusLabel(currentStatus);
  const isPending = currentStatus === "queued" || currentStatus === "running";
  const isFailure = ["failed", "blocked", "needs_config", "cancelled"].includes(currentStatus);
  return <div
    className={`canvas-node-result canvas-display-any-result is-${currentStatus} nodrag nopan nowheel`}
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => event.stopPropagation()}
    onDoubleClick={(event) => event.stopPropagation()}
    onKeyDown={(event) => event.stopPropagation()}
    onKeyUp={(event) => event.stopPropagation()}
    onWheel={(event) => event.stopPropagation()}
  >
    <div className="canvas-node-result-status">
      <span>{isPending ? <LoaderCircle className={currentStatus === "running" ? "animate-spin" : ""} /> : isFailure ? <AlertTriangle /> : <CheckCircle2 />}{statusLabel}</span>
      <small>{artifact ? portKindLabel(artifact.kind) : `attempt ${artifactRun.attempt}`}</small>
    </div>
    {historicalRevision !== undefined ? <div className="canvas-node-result-history">历史版本 r{historicalRevision}</div> : null}
    {latestSuccessful && artifactRun.id === latestSuccessful.nodeRun.id ? <div className="canvas-node-result-history">最近成功结果 · r{latestSuccessful.workflowRevision} · {new Date(latestSuccessful.runCreatedAt).toLocaleString()}</div> : null}
    {isFailure ? <p>{nodeRun?.error || statusLabel}</p> : null}
    {artifactRun.status === "completed" && !artifact ? <div className="canvas-node-result-empty">运行完成，但没有可预览内容</div> : null}
    {artifact ? <CanvasDisplayAnyArtifact artifact={artifact} onPreview={onPreview} /> : null}
  </div>;
}

function CanvasDisplayAnyArtifact({ artifact, onPreview }: {
  artifact: CanvasArtifact;
  onPreview: (preview: NonNullable<PreviewState>) => void;
}) {
  if (artifact.kind === "text") return <div className="canvas-node-text-result">
    <p>{artifact.value}</p>
    <button type="button" onClick={() => onPreview({ kind: "text", value: artifact.value })} aria-label="查看完整文本" title="查看完整文本"><Maximize2 /></button>
  </div>;
  if (artifact.kind === "images") return artifact.items.length
    ? <CanvasResultImageGallery items={artifact.items} onPreview={onPreview} />
    : <div className="canvas-node-result-empty">没有图片内容</div>;
  if (artifact.kind === "videos") return artifact.items.length
    ? <CanvasResultVideoPreview items={artifact.items} onPreview={onPreview} />
    : <div className="canvas-node-result-empty">没有视频内容</div>;
  if (artifact.kind === "socialPost") return <div className="canvas-display-any-summary">
    <strong>{artifact.post.title || "未命名内容"}</strong>
    <small>{artifact.post.platform} · {artifact.post.imageUrls.length} 图 · {artifact.post.videoUrls?.length || 0} 视频</small>
    <Link href={`/review?postId=${encodeURIComponent(artifact.postId)}`}>打开评审</Link>
  </div>;
  return <div className="canvas-display-any-summary">
    <strong>飞书发布任务</strong>
    <code>{artifact.jobId}</code>
    <small>{artifact.status}</small>
  </div>;
}

function CanvasCompositionNodeResult({ nodeRun, latestSuccessful }: { nodeRun?: CanvasNodeRun; latestSuccessful?: CanvasLatestSuccessfulNodeRun }) {
  const result = nodeRun && getSocialPostArtifact(nodeRun) ? nodeRun : latestSuccessful?.nodeRun;
  const artifact = result ? getSocialPostArtifact(result) : undefined;
  if (!artifact) return null;
  return <div className={`canvas-node-result is-${result?.status || "completed"} nodrag nopan nowheel`}>
    <div className="canvas-node-result-status"><span><CheckCircle2 />{canvasNodeRunStatusLabel(result?.status || "completed")}</span><small>{artifact.post.imageUrls.length} 图 · {artifact.post.videoUrls?.length || 0} 视频</small></div>
    <p className="canvas-artifact-text">{artifact.post.title}</p>
    <Link href={`/review?postId=${encodeURIComponent(artifact.postId)}`}>打开评审</Link>
  </div>;
}

function FlowingCanvasEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, selected, data }: EdgeProps<FlowEdge>) {
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const beamActive = selected || data?.beamActive;
  const animationDuration = beamActive ? canvasEdgeAnimationDuration.active : canvasEdgeAnimationDuration.idle;
  const beam = canvasEdgeBeamProfile(sourceX, sourceY, targetX, targetY);
  const edgeStyle = {
    ...style,
    "--canvas-edge-delay": `${edgeAnimationDelay(id, animationDuration)}s`,
    "--canvas-edge-duration": `${animationDuration}s`,
  } as React.CSSProperties;
  return <g className={`canvas-flow-edge-flowing${beamActive ? " canvas-flow-edge-beam-active" : ""}`} style={edgeStyle}>
    <BaseEdge id={id} path={path} markerEnd={markerEnd} className="canvas-flow-edge-base" />
    <path d={path} pathLength={100} strokeDasharray={beam.trailDash} className="canvas-flow-edge-trail" aria-hidden="true" />
    <path d={path} pathLength={100} strokeDasharray={beam.bodyDash} className="canvas-flow-edge-body" style={canvasEdgeLayerStyle(beam.bodyShift)} aria-hidden="true" />
    <path d={path} pathLength={100} strokeDasharray={beam.coreDash} className="canvas-flow-edge-core" style={canvasEdgeLayerStyle(beam.coreShift)} aria-hidden="true" />
  </g>;
}

function CanvasModelNodeResult({
  node,
  nodeRun,
  latestSuccessful,
  historicalRevision,
  onPreview,
}: {
  node: CanvasNode;
  nodeRun?: CanvasNodeRun;
  latestSuccessful?: CanvasLatestSuccessfulNodeRun;
  historicalRevision?: number;
  onPreview: (preview: NonNullable<PreviewState>) => void;
}) {
  const selectedArtifact = nodeRun ? getModelArtifact(node.type, nodeRun) : undefined;
  const artifactRun = selectedArtifact ? nodeRun : latestSuccessful?.nodeRun || nodeRun;
  if (!artifactRun) return <div className="canvas-node-result is-idle"><small>尚无运行结果</small></div>;
  const artifact = selectedArtifact || getModelArtifact(node.type, artifactRun);
  const resultNode = latestSuccessful && artifactRun.id === latestSuccessful.nodeRun.id
    ? { ...node, version: latestSuccessful.nodeVersion, config: latestSuccessful.nodeConfig }
    : node;
  const currentStatus = nodeRun?.status || artifactRun.status;
  const statusLabel = canvasNodeRunStatusLabel(currentStatus);
  const isPending = currentStatus === "queued" || currentStatus === "running";
  const isFailure = ["failed", "blocked", "needs_config", "cancelled"].includes(currentStatus);
  const showArtifact = Boolean(artifact);
  return <div
    className={`canvas-node-result is-${currentStatus} nodrag nopan nowheel`}
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => event.stopPropagation()}
    onDoubleClick={(event) => event.stopPropagation()}
    onKeyDown={(event) => event.stopPropagation()}
    onKeyUp={(event) => event.stopPropagation()}
    onWheel={(event) => event.stopPropagation()}
  >
    <div className="canvas-node-result-status">
      <span>{isPending ? <LoaderCircle className={currentStatus === "running" ? "animate-spin" : ""} /> : isFailure ? <AlertTriangle /> : <CheckCircle2 />}{statusLabel}</span>
      <small>attempt {artifactRun.attempt}</small>
    </div>
    {historicalRevision !== undefined ? <div className="canvas-node-result-history">历史版本 r{historicalRevision}</div> : null}
    {latestSuccessful && artifactRun.id === latestSuccessful.nodeRun.id ? <div className="canvas-node-result-history">最近成功结果 · r{latestSuccessful.workflowRevision} · {new Date(latestSuccessful.runCreatedAt).toLocaleString()}</div> : null}
    {isFailure ? <p>{nodeRun?.error || statusLabel}</p> : null}
    {artifactRun.status === "completed" && !artifact ? <div className="canvas-node-result-empty">运行完成，但没有可预览内容</div> : null}
    {artifact ? <div className="canvas-node-result-label">生成结果</div> : null}
    {showArtifact && artifact?.kind === "text" ? <div className="canvas-node-text-result">
      <p>{artifact.value}</p>
      <button type="button" onClick={() => onPreview({ kind: "text", value: artifact.value })} aria-label="查看完整文本" title="查看完整文本"><Maximize2 /></button>
    </div> : null}
    {showArtifact && artifact?.kind === "images" ? <CanvasResultImageGallery
      items={artifact.items}
      ratio={node.type === "model.gpt-image" ? String(resultNode.config.ratio || legacyNodeRatio(resultNode)) : undefined}
      resolution={node.type === "model.gpt-image" ? String(resultNode.config.resolution || legacyNodeResolution(resultNode)) : undefined}
      onPreview={onPreview}
    /> : null}
    {showArtifact && artifact?.kind === "videos" ? <CanvasResultVideoPreview items={artifact.items} onPreview={onPreview} /> : null}
    {node.type === "utility.video-subtitles" && artifactRun.outputs.text?.kind === "text" ? <div className="canvas-node-text-result canvas-subtitle-text-result">
      <p>{artifactRun.outputs.text.value}</p>
      <button type="button" onClick={() => onPreview({ kind: "text", value: artifactRun.outputs.text.kind === "text" ? artifactRun.outputs.text.value : "" })} aria-label="查看完整字幕文本" title="查看完整字幕文本"><Maximize2 /></button>
    </div> : null}
  </div>;
}

function CanvasTextSplitNodeResult({
  nodeRun,
  latestSuccessful,
  historicalRevision,
  onPreview,
}: {
  nodeRun?: CanvasNodeRun;
  latestSuccessful?: CanvasLatestSuccessfulNodeRun;
  historicalRevision?: number;
  onPreview: (preview: NonNullable<PreviewState>) => void;
}) {
  const selectedBody = nodeRun ? getTextOutputArtifact(nodeRun, "tail") : undefined;
  const artifactRun = selectedBody ? nodeRun : latestSuccessful?.nodeRun || nodeRun;
  if (!artifactRun) return <div className="canvas-node-result is-idle"><small>尚无运行结果</small></div>;
  const title = getTextOutputArtifact(artifactRun, "head");
  const body = getTextOutputArtifact(artifactRun, "tail");
  const currentStatus = nodeRun?.status || artifactRun.status;
  const statusLabel = canvasNodeRunStatusLabel(currentStatus);
  const isPending = currentStatus === "queued" || currentStatus === "running";
  const isFailure = ["failed", "blocked", "needs_config", "cancelled"].includes(currentStatus);
  const isFallback = Boolean(body && !title);
  return <div
    className={`canvas-node-result canvas-text-split-result is-${currentStatus} nodrag nopan nowheel`}
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => event.stopPropagation()}
    onDoubleClick={(event) => event.stopPropagation()}
    onKeyDown={(event) => event.stopPropagation()}
    onKeyUp={(event) => event.stopPropagation()}
    onWheel={(event) => event.stopPropagation()}
  >
    <div className="canvas-node-result-status">
      <span>{isPending ? <LoaderCircle className={currentStatus === "running" ? "animate-spin" : ""} /> : isFailure ? <AlertTriangle /> : <CheckCircle2 />}{statusLabel}</span>
      <small>attempt {artifactRun.attempt}</small>
    </div>
    {historicalRevision !== undefined ? <div className="canvas-node-result-history">历史版本 r{historicalRevision}</div> : null}
    {latestSuccessful && artifactRun.id === latestSuccessful.nodeRun.id ? <div className="canvas-node-result-history">最近成功结果 · r{latestSuccessful.workflowRevision} · {new Date(latestSuccessful.runCreatedAt).toLocaleString()}</div> : null}
    {isFailure ? <p>{nodeRun?.error || statusLabel}</p> : null}
    {isFallback ? <div className="canvas-text-split-fallback"><AlertTriangle />未匹配，已全部作为正文</div> : null}
    {title ? <CanvasTextSplitOutput label="标题" artifact={title} onPreview={onPreview} />
      : body ? <div className="canvas-text-split-empty"><span>标题</span><small>为空</small></div> : null}
    {body ? <CanvasTextSplitOutput label="正文" artifact={body} onPreview={onPreview} /> : null}
    {artifactRun.status === "completed" && !body ? <div className="canvas-node-result-empty">运行完成，但没有可预览内容</div> : null}
  </div>;
}

function CanvasTextSplitOutput({
  label,
  artifact,
  onPreview,
}: {
  label: string;
  artifact: Extract<CanvasArtifact, { kind: "text" }>;
  onPreview: (preview: NonNullable<PreviewState>) => void;
}) {
  return <div className="canvas-text-split-output">
    <div><span>{label}</span><button type="button" onClick={() => onPreview({ kind: "text", value: artifact.value })} aria-label={`查看完整${label}`} title={`查看完整${label}`}><Maximize2 /></button></div>
    <p>{artifact.value}</p>
  </div>;
}

function CanvasResultImageGallery({ items, ratio, resolution, onPreview }: {
  items: Extract<CanvasArtifact, { kind: "images" }>["items"];
  ratio?: string;
  resolution?: string;
  onPreview: (preview: NonNullable<PreviewState>) => void;
}) {
  const [dimensions, setDimensions] = useState<Record<string, { width: number; height: number }>>({});
  return <div className="canvas-node-result-gallery">
    {items.map((item, index) => {
      const actual = dimensions[item.url] || (item.width && item.height ? { width: item.width, height: item.height } : undefined);
      return <button type="button" key={`${item.url}-${index}`} style={{ aspectRatio: cssAspectRatio(ratio) }} onClick={() => onPreview({ kind: "image", url: item.url, index, width: actual?.width, height: actual?.height })} aria-label={`预览生成图片 ${index + 1}`} title="预览图片">
      <Image src={item.url} alt="" fill sizes="220px" unoptimized draggable={false} referrerPolicy="no-referrer" onLoad={(event) => {
        const width = event.currentTarget.naturalWidth;
        const height = event.currentTarget.naturalHeight;
        if (width && height) setDimensions((current) => current[item.url]?.width === width && current[item.url]?.height === height ? current : { ...current, [item.url]: { width, height } });
      }} />
      <span className="canvas-node-result-gallery-open"><Maximize2 /></span>
      <span className="canvas-node-result-gallery-meta">目标 {ratio || "auto"} · {(resolution || "").toUpperCase()}<br />{actual ? `实际 ${actual.width}×${actual.height}` : "读取实际尺寸中"}</span>
    </button>;
    })}
  </div>;
}

function CanvasResultVideoPreview({ items, onPreview }: { items: Extract<CanvasArtifact, { kind: "videos" }>["items"]; onPreview: (preview: NonNullable<PreviewState>) => void }) {
  const first = items[0];
  if (!first) return null;
  return <div className="canvas-node-video-result">
    <video src={first.url} controls playsInline preload="metadata" onPointerDown={(event) => event.stopPropagation()} />
    <button type="button" onClick={() => onPreview({ kind: "video", url: first.url, index: 0 })}><Maximize2 />预览</button>
    {items.length > 1 ? <small>共 {items.length} 个视频</small> : null}
  </div>;
}

function NodeInspector({
  node,
  onChange,
  onPatch,
  onLabelChange,
  onExecutionModeChange,
  onSchedulerRoleChange,
  onImportImages,
  onPasteImages,
  onImportVideos,
  videoUploadTasks,
  onRetryVideoUpload,
  onDismissVideoUpload,
  onPreviewVideo,
  onResolveSourceVideo,
  sourceVideoBusy,
  onPreviewImage,
  mediaBusy,
  graph,
  subtitlePreviewMedia,
  seedanceReferences,
  createSeedanceMentionId,
}: {
  node: CanvasNode;
  onChange: (key: string, value: CanvasEditableConfigValue) => void;
  onPatch: (patch: CanvasNode["config"]) => void;
  onLabelChange: (label: string) => void;
  onExecutionModeChange: (mode: CanvasNodeExecutionMode) => void;
  onSchedulerRoleChange: (role?: CanvasSchedulerRole) => void;
  onImportImages: (files: File[]) => Promise<void>;
  onPasteImages: () => Promise<void>;
  onImportVideos: (files: File[]) => Promise<void>;
  videoUploadTasks: CanvasVideoUploadTask[];
  onRetryVideoUpload: (task: CanvasVideoUploadTask) => Promise<void>;
  onDismissVideoUpload: (taskId: string) => void;
  onPreviewVideo: (url: string, index: number) => void;
  onResolveSourceVideo: () => Promise<void>;
  sourceVideoBusy: boolean;
  onPreviewImage: (url: string, index: number) => void;
  mediaBusy: boolean;
  graph: CanvasGraph;
  subtitlePreviewMedia?: CanvasMediaReference;
  seedanceReferences: SeedanceFixedReference[];
  createSeedanceMentionId: () => string;
}) {
  const definition = getCanvasNodeDefinition(node.type, node.version);
  const defaultLabel = definition?.label || node.type;
  const labelInputRef = useRef<HTMLInputElement>(null);
  const [labelDraft, setLabelDraft] = useState(node.label?.trim() || defaultLabel);
  useEffect(() => {
    if (document.activeElement !== labelInputRef.current) setLabelDraft(node.label?.trim() || defaultLabel);
  }, [defaultLabel, node.id, node.label]);
  if (!definition) return null;
  const isGptImageV2 = node.type === "model.gpt-image" && node.version >= 2;
  const isSeedance = node.type === "model.seedance";
  const imageConfigKey = isGptImageV2 || isSeedance ? "referenceUrls" : "urls";
  const imageUrls = node.type === "input.images" || isGptImageV2 || isSeedance ? normalizeConfigUrls(node.config[imageConfigKey]) : [];
  const orderedSeedanceReferences = isSeedance ? orderSeedanceFixedReferences(node.config, seedanceReferences) : [];
  const seedanceErrors = isSeedance ? validateSeedanceGraphNode(graph, node) : [];
  const sourceVideoSnapshot = node.type === "input.source-video" ? canvasSourceVideoSnapshotFromConfig(node.config) : undefined;
  const sourceVideoCurrent = node.type === "input.source-video" && isCanvasSourceVideoSnapshotCurrent(node.config);
  const loadedVideos = node.type === "input.video-loader" ? canvasVideoSnapshotsFromConfig(node.config) : [];
  const executionMode = node.executionMode === "bypass" || node.executionMode === "disabled" ? node.executionMode : "enabled";
  const commitLabel = () => {
    const normalized = labelDraft.trim().slice(0, 80) || defaultLabel;
    setLabelDraft(normalized);
    if (normalized !== node.label) onLabelChange(normalized);
  };
  return <div className="canvas-inspector-content">
    <div className="canvas-inspector-title"><span style={{ color: definition.color }}>{iconForNode(node.type)}</span><div><strong>{definition.label}</strong><small>{definition.description}</small></div></div>
    <label><span>节点名称</span><input ref={labelInputRef} maxLength={80} value={labelDraft} placeholder={definition.label} onChange={(event) => setLabelDraft(event.target.value)} onBlur={commitLabel} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
    <label><span>节点状态</span><select value={executionMode} onChange={(event) => onExecutionModeChange(event.target.value as CanvasNodeExecutionMode)}>
      <option value="enabled">启用</option>
      <option value="bypass" disabled={!definition.bypass}>跳过</option>
      <option value="disabled">禁用</option>
    </select></label>
    <label><span>调度角色</span><select value={node.schedulerRole || ""} onChange={(event) => onSchedulerRoleChange((event.target.value || undefined) as CanvasSchedulerRole | undefined)}>
      <option value="">未绑定</option>
      {schedulerRolesForNode(node).map((role) => <option key={role} value={role}>{schedulerRoleLabel(role)}</option>)}
    {node.type === "input.source-video" ? <div className="canvas-source-video-resolver">
      <div className={`canvas-source-video-status ${sourceVideoCurrent ? "is-ready" : "is-stale"}`}>
        {sourceVideoCurrent ? <CheckCircle2 /> : <AlertTriangle />}
        <span><strong>{sourceVideoCurrent ? "快照已冻结" : sourceVideoSnapshot ? "快照已失效" : "等待解析"}</strong><small>{sourceVideoCurrent && sourceVideoSnapshot ? `${sourceVideoSnapshot.platform} · ${sourceVideoSnapshot.durationSeconds.toFixed(1)} 秒 · ${sourceVideoSnapshot.width}×${sourceVideoSnapshot.height}` : "修改链接或项目名后需要重新解析"}</small></span>
      </div>
      <button type="button" onClick={() => void onResolveSourceVideo()} disabled={sourceVideoBusy || !String(node.config.sourceUrl || "").trim() || !String(node.config.projectName || "").trim()}>
        {sourceVideoBusy ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}<span>{sourceVideoBusy ? "解析中" : "解析并入库"}</span>
      </button>
    </div> : null}
    </select></label>
    {isSeedance ? <SeedancePromptComposer
      key={node.id}
      node={node}
      references={orderedSeedanceReferences}
      graph={graph}
      errors={seedanceErrors}
      onPatch={onPatch}
      createMentionId={createSeedanceMentionId}
    /> : null}
    {node.type === "input.images" || isGptImageV2 || isSeedance ? <div className={`canvas-image-import ${isSeedance ? "canvas-seedance-references" : ""}`}>
      {isGptImageV2 ? <div className="canvas-image-import-count"><strong>参考图片</strong><span>{imageUrls.length}/16</span></div> : null}
      {isSeedance ? <div className="canvas-image-import-count"><strong>固定参考图</strong><span>{orderedSeedanceReferences.length}/9</span></div> : null}
      <div className="canvas-image-import-actions">
        <label className={mediaBusy || (isGptImageV2 && imageUrls.length >= 16) || (isSeedance && orderedSeedanceReferences.length >= 9) ? "is-disabled" : ""}>
          <Upload /><span>{mediaBusy ? "导入中" : "导入图片"}</span>
          <input className="canvas-image-file-input" type="file" accept={isGptImageV2 ? "image/jpeg,image/png" : isSeedance ? "image/jpeg,image/png,image/gif,image/webp" : "image/jpeg,image/png,image/gif,image/webp,image/avif"} multiple disabled={mediaBusy || (isGptImageV2 && imageUrls.length >= 16) || (isSeedance && orderedSeedanceReferences.length >= 9)} onChange={(event) => {
            const files = Array.from(event.target.files || []);
            event.target.value = "";
            if (files.length) void onImportImages(files);
          }} />
        </label>
        <button type="button" onClick={() => void onPasteImages()} disabled={mediaBusy || (isGptImageV2 && imageUrls.length >= 16) || (isSeedance && orderedSeedanceReferences.length >= 9)}><ClipboardPaste /><span>粘贴图片</span></button>
      </div>
      {(isSeedance ? orderedSeedanceReferences.length : imageUrls.length) ? <div className={`canvas-image-preview-list ${isGptImageV2 || isSeedance ? "is-ordered" : ""}`}>{(isSeedance ? orderedSeedanceReferences : imageUrls).map((item, index) => {
        const url = typeof item === "string" ? item : item.url;
        const directIndex = isSeedance ? imageUrls.indexOf(url) : index;
        const isDirect = !isSeedance || directIndex >= 0;
        return <div className={`canvas-image-preview ${isSeedance && !isDirect ? "is-upstream" : ""}`} key={`${url}-${index}`}>
        <button className="canvas-image-preview-open" type="button" onClick={() => onPreviewImage(url, index)} aria-label={`预览图片 ${index + 1}`} title="预览图片">
          <span style={{ backgroundImage: `url(${JSON.stringify(url)})` }} />
        </button>
        {isGptImageV2 || isSeedance ? <span className="canvas-image-preview-index">图片{index + 1}{isSeedance ? <small>{isDirect ? "上传" : "上游"}</small> : null}</span> : null}
        {(isGptImageV2 || (isSeedance && isDirect)) ? <span className="canvas-image-preview-order">
          <button type="button" disabled={directIndex === 0} onClick={() => onChange(imageConfigKey, moveListItem(imageUrls, directIndex, directIndex - 1))} aria-label={`上移图片 ${index + 1}`} title="上移"><ArrowUp /></button>
          <button type="button" disabled={directIndex === imageUrls.length - 1} onClick={() => onChange(imageConfigKey, moveListItem(imageUrls, directIndex, directIndex + 1))} aria-label={`下移图片 ${index + 1}`} title="下移"><ArrowDown /></button>
        </span> : null}
        {isDirect ? <button className="canvas-image-preview-remove" type="button" onClick={() => onChange(imageConfigKey, imageUrls.filter((_, currentIndex) => currentIndex !== directIndex))} aria-label={`移除图片 ${index + 1}`} title="移除图片"><X /></button> : null}
      </div>})}</div> : null}
    </div> : null}
    {node.type === "input.video-loader" ? <CanvasVideoLoaderEditor
      videos={loadedVideos}
      selectedVideoId={String(node.config.selectedVideoId || "")}
      uploads={videoUploadTasks}
      onImport={onImportVideos}
      onRetry={onRetryVideoUpload}
      onDismiss={onDismissVideoUpload}
      onPreview={onPreviewVideo}
      onChange={(videos, selectedVideoId) => onPatch(canvasVideoLoaderConfig(videos, selectedVideoId))}
    /> : null}
    {node.type === "utility.video-subtitles" ? <CanvasSubtitleStyleEditor node={node} media={subtitlePreviewMedia} onPatch={onPatch} /> : definition.fields.map((field) => {
      if (field.key === "outputCompression" && node.config.outputFormat !== "jpeg") return null;
      if (field.key === "template" && node.config.preset !== "custom") return null;
      if (node.type === "utility.text-split" && (field.key === "delimiter" || field.key === "delimiterIndex") && node.config.mode !== "delimiter") return null;
      if ((field.key === "width" || field.key === "height") && node.config.preset !== "custom") return null;
      if (field.key === "coverSeconds" && node.config.mode !== "cover") return null;
      if (field.key === "count" && node.type === "utility.video-frames" && node.config.mode !== "even") return null;
      if (field.key === "timestamps" && node.config.mode !== "timestamps") return null;
      const value = node.config[field.key];
      const options = field.key === "ratio" && node.config.resolution === "4k"
        ? field.options?.filter((option) => ["16:9", "9:16", "2:1", "1:2", "21:9", "9:21"].includes(option.value))
        : field.options;
      if (field.kind === "content-pool-picker") return <ContentPoolSnapshotPicker key={field.key} node={node} onPatch={onPatch} />;
      if (field.kind === "library-image-picker") return <LibraryImageSnapshotPicker key={field.key} node={node} onPatch={onPatch} onPreviewImage={onPreviewImage} />;
      if (field.kind === "copy-library-picker") return <CopyLibrarySnapshotPicker key={field.key} node={node} onPatch={onPatch} />;
      return <label key={field.key} className={field.kind === "boolean" ? "canvas-inspector-toggle" : undefined}><span>{field.label}</span>
        {field.kind === "textarea" || field.kind === "url-list" ? <textarea value={field.kind === "url-list" && Array.isArray(value) ? value.join("\n") : String(value || "")} placeholder={field.placeholder} onChange={(event) => onChange(field.key, field.kind === "url-list" ? event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) : event.target.value)} />
          : field.kind === "select" ? <select value={String(value || "")} onChange={(event) => {
            const next = event.target.value;
            if (field.key === "resolution" && next === "4k" && !["16:9", "9:16", "2:1", "1:2", "21:9", "9:21"].includes(String(node.config.ratio))) {
              const [width, height] = String(node.config.ratio || "1:1").split(":").map(Number);
              onChange("ratio", width < height ? "9:16" : "16:9");
            }
            onChange(field.key, next);
          }}>{options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          : field.kind === "boolean" ? <input type="checkbox" checked={value === true} onChange={(event) => onChange(field.key, event.target.checked)} />
          : <input type={field.kind === "number" ? "number" : "text"} min={field.min} max={field.max} value={value === undefined ? "" : String(value)} placeholder={field.placeholder} onChange={(event) => onChange(field.key, field.kind === "number" ? Number(event.target.value) : event.target.value)} />}
      </label>;
    })}
    <div className="canvas-port-list"><span>输入</span>{definition.inputs.length ? definition.inputs.map((port) => <small key={port.id}>{port.label} · {portKindLabel(port.kind)}{port.required ? " · 必填" : ""}</small>) : <small>无</small>}</div>
    <div className="canvas-port-list"><span>输出</span>{definition.outputs.length ? definition.outputs.map((port) => <small key={port.id}>{port.label} · {portKindLabel(port.kind)}</small>) : <small>无</small>}</div>
  </div>;
}

function CanvasVideoLoaderEditor({ videos, selectedVideoId, uploads, onImport, onRetry, onDismiss, onPreview, onChange }: {
  videos: CanvasVideoSnapshot[];
  selectedVideoId: string;
  uploads: CanvasVideoUploadTask[];
  onImport: (files: File[]) => Promise<void>;
  onRetry: (task: CanvasVideoUploadTask) => Promise<void>;
  onDismiss: (taskId: string) => void;
  onPreview: (url: string, index: number) => void;
  onChange: (videos: CanvasVideoSnapshot[], selectedVideoId: string) => void;
}) {
  const uploadBusy = uploads.some((task) => task.status === "queued" || task.status === "uploading");
  const remaining = MAX_CANVAS_VIDEO_LOADER_ITEMS - videos.length - uploads.length;
  const remove = (id: string) => {
    const next = videos.filter((video) => video.id !== id);
    onChange(next, id === selectedVideoId ? next[0]?.id || "" : selectedVideoId);
  };
  return <section className="canvas-video-loader">
    <header><span><strong>视频队列</strong><small>{videos.length}/{MAX_CANVAS_VIDEO_LOADER_ITEMS}</small></span><label className={remaining <= 0 || uploadBusy ? "is-disabled" : ""}><Upload /><span>上传视频</span><input type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm" multiple disabled={remaining <= 0 || uploadBusy} onChange={(event) => {
      const files = Array.from(event.currentTarget.files || []).slice(0, remaining);
      event.currentTarget.value = "";
      if (files.length) void onImport(files);
    }} /></label></header>
    {uploads.length ? <div className="canvas-video-upload-list">{uploads.map((task) => <div className={`canvas-video-upload is-${task.status}`} key={task.id}>
      <span><strong>{task.file.name}</strong><small>{task.status === "failed" ? task.error : task.status === "queued" ? "等待上传" : `上传中 ${task.progress}%`}</small></span>
      {task.status === "uploading" ? <progress max={100} value={task.progress} /> : null}
      {task.status === "failed" ? <div><button type="button" disabled={uploadBusy} onClick={() => void onRetry(task)}><RefreshCw />重试</button><button type="button" disabled={uploadBusy} onClick={() => onDismiss(task.id)} aria-label={`移除失败任务 ${task.file.name}`} title="移除"><X /></button></div> : null}
    </div>)}</div> : null}
    {videos.length ? <div className="canvas-video-loader-queue">{videos.map((video, index) => <article className={video.id === selectedVideoId ? "is-selected" : ""} key={video.id}>
      <label><input type="radio" name="video-loader-current" checked={video.id === selectedVideoId} onChange={() => onChange(videos, video.id)} /><span><strong>{video.filename}</strong><small>{formatMediaDuration(video.durationSeconds)} · {video.width}×{video.height} · {formatBytes(video.bytes)}{video.hasAudio ? " · 有音轨" : " · 无音轨"}</small></span></label>
      <div><button type="button" onClick={() => onPreview(video.url, index)} aria-label={`预览视频 ${video.filename}`} title="预览"><Play /></button><button type="button" disabled={index === 0} onClick={() => onChange(moveListItem(videos, index, index - 1), selectedVideoId)} aria-label={`上移视频 ${video.filename}`} title="上移"><ArrowUp /></button><button type="button" disabled={index === videos.length - 1} onClick={() => onChange(moveListItem(videos, index, index + 1), selectedVideoId)} aria-label={`下移视频 ${video.filename}`} title="下移"><ArrowDown /></button><button type="button" onClick={() => remove(video.id)} aria-label={`移除视频 ${video.filename}`} title="移除"><Trash2 /></button></div>
    </article>)}</div> : <div className="canvas-video-loader-empty"><FileVideo2 /><span>选择视频，或直接拖到画布</span></div>}
  </section>;
}

type CanvasSubtitlePresetResponse = {
  presets: CanvasSubtitlePreset[];
  fonts: string[];
  recommendedFont: string;
  currentAccountId: string;
};

function CanvasSubtitleStyleEditor({ node, media, onPatch }: { node: CanvasNode; media?: CanvasMediaReference; onPatch: (patch: CanvasNode["config"]) => void }) {
  const style = canvasSubtitleStyleFromConfig(node.config);
  const [naturalMedia, setNaturalMedia] = useState<CanvasSubtitlePreviewMedia>();
  const [failedMediaUrl, setFailedMediaUrl] = useState("");
  const [resources, setResources] = useState<CanvasSubtitlePresetResponse>({ presets: [], fonts: [], recommendedFont: "", currentAccountId: "" });
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetName, setPresetName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("正在载入字幕样式...");

  const loadResources = useCallback(async () => {
    try {
      const data = await api<CanvasSubtitlePresetResponse>("/api/canvas/subtitle-presets");
      setResources(data);
      setMessage("");
      if (!data.fonts.includes(style.fontFamily) && data.recommendedFont) onPatch({ fontFamily: data.recommendedFont });
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }, [onPatch, style.fontFamily]);

  useEffect(() => {
    let active = true;
    void api<CanvasSubtitlePresetResponse>("/api/canvas/subtitle-presets").then((data) => {
      if (!active) return;
      setResources(data);
      setMessage("");
      if (!data.fonts.includes(style.fontFamily) && data.recommendedFont) onPatch({ fontFamily: data.recommendedFont });
    }).catch((error) => {
      if (active) setMessage(errorMessage(error));
    });
    return () => { active = false; };
  }, [node.id, onPatch, style.fontFamily]);

  const selectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = resources.presets.find((item) => item.id === presetId);
    if (!preset) return;
    setPresetName(preset.builtIn ? "" : preset.name);
    onPatch(canvasSubtitleStyleConfig(preset.style));
    setMessage(`已加载“${preset.name}”`);
  };

  const savePreset = async () => {
    const name = presetName.trim();
    if (!name || busy) return setMessage("请输入预设名称。");
    setBusy(true);
    try {
      const normalized = normalizeCanvasSubtitlePresetName(name);
      const selected = resources.presets.find((item) => item.id === selectedPresetId && !item.builtIn && item.normalizedName === normalized);
      const existing = selected || resources.presets.find((item) => !item.builtIn && item.ownerUserId === resources.currentAccountId && item.normalizedName === normalized);
      let preset: CanvasSubtitlePreset;
      if (existing) {
        if (!window.confirm(`覆盖字幕预设“${existing.name}”？`)) return;
        preset = (await api<{ preset: CanvasSubtitlePreset }>(`/api/canvas/subtitle-presets/${existing.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name, style, revision: existing.revision }),
        })).preset;
      } else {
        preset = (await api<{ preset: CanvasSubtitlePreset }>("/api/canvas/subtitle-presets", {
          method: "POST",
          body: JSON.stringify({ name, style }),
        })).preset;
      }
      setSelectedPresetId(preset.id);
      await loadResources();
      setMessage(`已保存“${preset.name}”`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const deletePreset = async () => {
    const preset = resources.presets.find((item) => item.id === selectedPresetId);
    if (!preset || preset.builtIn || busy || !window.confirm(`删除字幕预设“${preset.name}”？`)) return;
    setBusy(true);
    try {
      await api(`/api/canvas/subtitle-presets/${preset.id}?revision=${preset.revision}`, { method: "DELETE" });
      setSelectedPresetId("");
      setPresetName("");
      await loadResources();
      setMessage(`已删除“${preset.name}”`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const patchStyle = <K extends keyof CanvasSubtitleStyle>(key: K, value: CanvasSubtitleStyle[K]) => onPatch({ [key]: value });
  const previewPosition = style.verticalPosition === "top" ? "flex-start" : style.verticalPosition === "middle" ? "center" : "flex-end";
  const previewAlign = style.horizontalAlign === "left" ? "flex-start" : style.horizontalAlign === "right" ? "flex-end" : "center";
  const previewTextAlign = style.horizontalAlign;
  const previewBackground = style.backgroundEnabled ? hexToRgba(style.backgroundColor, style.backgroundOpacity / 100) : "transparent";
  const previewOutline = style.outlineWidthPercent > 0 ? subtitlePreviewShadow(style.outlineColor, Math.max(1, style.outlineWidthPercent * 4)) : "none";
  const previewFont = Math.max(12, Math.min(30, 18 * style.fontSizePercent / 5));
  const previewMedia = naturalMedia?.url === media?.url ? naturalMedia : canvasSubtitlePreviewMedia(media);
  const mediaLoadFailed = Boolean(media?.url && failedMediaUrl === media.url);
  const previewRatio = previewMedia ? previewMedia.width / previewMedia.height : 16 / 9;
  const previewMaxWidth = previewRatio < 1 ? `${Math.round(320 * previewRatio)}px` : "100%";

  return <div className="canvas-subtitle-editor">
    <div className="canvas-subtitle-preview-meta" aria-live="polite">
      <span>{previewMedia ? `${previewMedia.width}×${previewMedia.height}` : "等待视频分辨率"}</span>
      <small>{previewMedia ? `${formatAspectRatio(previewMedia.width, previewMedia.height)}${previewMedia.durationSeconds ? ` · ${formatMediaDuration(previewMedia.durationSeconds)}` : ""}` : "连接视频后显示实际预览"}</small>
    </div>
    <div className="canvas-subtitle-preview" style={{ alignItems: previewPosition, justifyContent: previewAlign, aspectRatio: `${previewMedia?.width || 16} / ${previewMedia?.height || 9}`, maxWidth: previewMaxWidth }}>
      {media?.url && !mediaLoadFailed ? <video src={media.url} muted playsInline preload="metadata" aria-label="字幕视频预览" onError={() => setFailedMediaUrl(media.url)} onLoadedMetadata={(event) => {
        const width = event.currentTarget.videoWidth;
        const height = event.currentTarget.videoHeight;
        if (width > 0 && height > 0) {
          setFailedMediaUrl("");
          setNaturalMedia({ url: media.url, width, height, durationSeconds: Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : media.durationSeconds });
        }
      }} /> : <div className="canvas-subtitle-preview-empty"><FileVideo2 /><span>{mediaLoadFailed ? "视频预览不可用" : "等待视频"}</span></div>}
      <span style={{
        color: style.textColor,
        background: previewBackground,
        fontFamily: style.fontFamily,
        fontSize: previewFont,
        fontWeight: style.bold ? 800 : 500,
        textAlign: previewTextAlign,
        textShadow: previewOutline,
        marginBlock: `${Math.min(40, style.verticalMarginPercent / previewRatio)}%`,
      }}>这是一段字幕样式预览<br />中英混排 FluxPost</span>
    </div>

    <div className="canvas-subtitle-presets">
      <select aria-label="加载字幕预设" value={selectedPresetId} onChange={(event) => selectPreset(event.target.value)} disabled={busy}>
        <option value="">加载预设</option>
        {resources.presets.map((preset) => <option value={preset.id} key={preset.id}>{preset.builtIn ? "内置" : preset.ownerDisplayName} · {preset.name}</option>)}
      </select>
      <div><input value={presetName} maxLength={60} placeholder="预设名称" onChange={(event) => setPresetName(event.target.value)} /><button type="button" onClick={() => void savePreset()} disabled={busy}><Save /><span>保存</span></button><button type="button" onClick={() => void deletePreset()} disabled={busy || !selectedPresetId || resources.presets.find((item) => item.id === selectedPresetId)?.builtIn} aria-label="删除字幕预设" title="删除字幕预设"><Trash2 /></button></div>
    </div>

    <label><span>字体</span><select value={style.fontFamily} onChange={(event) => patchStyle("fontFamily", event.target.value)} disabled={busy || !resources.fonts.length}>
      {!resources.fonts.includes(style.fontFamily) ? <option value={style.fontFamily}>{style.fontFamily} · 未安装</option> : null}
      {resources.fonts.map((font) => <option key={font} value={font}>{font}</option>)}
    </select></label>
    <CanvasSubtitleRange label="字号" value={style.fontSizePercent} min={2} max={12} step={0.5} suffix="%" onChange={(value) => patchStyle("fontSizePercent", value)} />
    <div className="canvas-subtitle-color-grid">
      <CanvasSubtitleColor label="文字" value={style.textColor} onChange={(value) => patchStyle("textColor", value)} />
      <CanvasSubtitleColor label="描边" value={style.outlineColor} onChange={(value) => patchStyle("outlineColor", value)} />
      <CanvasSubtitleColor label="背景" value={style.backgroundColor} onChange={(value) => patchStyle("backgroundColor", value)} disabled={!style.backgroundEnabled} />
    </div>
    <label className="canvas-inspector-toggle"><span>粗体</span><input type="checkbox" checked={style.bold} onChange={(event) => patchStyle("bold", event.target.checked)} /></label>
    <CanvasSubtitleRange label="描边宽度" value={style.outlineWidthPercent} min={0} max={1.5} step={0.05} suffix="%" onChange={(value) => patchStyle("outlineWidthPercent", value)} />
    <label className="canvas-inspector-toggle"><span>字幕背景</span><input type="checkbox" checked={style.backgroundEnabled} onChange={(event) => patchStyle("backgroundEnabled", event.target.checked)} /></label>
    {style.backgroundEnabled ? <CanvasSubtitleRange label="背景不透明度" value={style.backgroundOpacity} min={0} max={100} step={1} suffix="%" onChange={(value) => patchStyle("backgroundOpacity", value)} /> : null}
    <CanvasSubtitleSegments label="垂直位置" value={style.verticalPosition} options={[{ value: "top", label: "顶部" }, { value: "middle", label: "居中" }, { value: "bottom", label: "底部" }]} onChange={(value) => patchStyle("verticalPosition", value as CanvasSubtitleStyle["verticalPosition"])} />
    <CanvasSubtitleSegments label="水平对齐" value={style.horizontalAlign} options={[{ value: "left", label: "左" }, { value: "center", label: "中" }, { value: "right", label: "右" }]} onChange={(value) => patchStyle("horizontalAlign", value as CanvasSubtitleStyle["horizontalAlign"])} />
    <CanvasSubtitleRange label="垂直边距" value={style.verticalMarginPercent} min={0} max={30} step={1} suffix="%" onChange={(value) => patchStyle("verticalMarginPercent", value)} />
    <CanvasSubtitleRange label="每行最大字数" value={style.maxCharsPerLine} min={8} max={30} step={1} suffix="字" onChange={(value) => patchStyle("maxCharsPerLine", Math.round(value))} />
    {message ? <p className="canvas-subtitle-message">{message}</p> : null}
  </div>;
}

function CanvasSubtitleRange({ label, value, min, max, step, suffix, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (value: number) => void }) {
  return <label className="canvas-subtitle-range"><span>{label}<small>{value}{suffix}</small></span><input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function CanvasSubtitleColor({ label, value, disabled, onChange }: { label: string; value: string; disabled?: boolean; onChange: (value: string) => void }) {
  return <label className={disabled ? "is-disabled" : ""}><span>{label}</span><input type="color" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value.toUpperCase())} /></label>;
}

type CanvasSubtitlePreviewMedia = { url: string; width: number; height: number; durationSeconds?: number };

function canvasSubtitlePreviewMedia(media?: CanvasMediaReference): CanvasSubtitlePreviewMedia | undefined {
  if (!media?.url || !Number.isInteger(media.width) || !Number.isInteger(media.height) || media.width! <= 0 || media.height! <= 0) return undefined;
  return { url: media.url, width: media.width!, height: media.height!, durationSeconds: media.durationSeconds };
}

function resolveCanvasSubtitlePreviewMedia(
  node: CanvasNode,
  graph: CanvasGraph,
  latestNodeRuns: Map<string, CanvasNodeRun>,
  latestSuccessfulNodeRuns: Map<string, CanvasLatestSuccessfulNodeRun>,
): CanvasMediaReference | undefined {
  const currentInput = firstVideoArtifactItem(latestNodeRuns.get(node.id)?.inputs.videos);
  if (currentInput) return currentInput;
  const successfulInput = firstVideoArtifactItem(latestSuccessfulNodeRuns.get(node.id)?.nodeRun.inputs.videos);
  if (successfulInput) return successfulInput;
  const edge = graph.edges.find((item) => item.target === node.id && item.targetPort === "videos");
  if (!edge) return undefined;
  const currentUpstreamOutput = latestNodeRuns.get(edge.source)?.outputs[edge.sourcePort];
  if (currentUpstreamOutput?.kind === "videos" && currentUpstreamOutput.items[0]) return currentUpstreamOutput.items[0];
  const successfulUpstreamOutput = latestSuccessfulNodeRuns.get(edge.source)?.nodeRun.outputs[edge.sourcePort];
  if (successfulUpstreamOutput?.kind === "videos" && successfulUpstreamOutput.items[0]) return successfulUpstreamOutput.items[0];
  const upstream = graph.nodes.find((item) => item.id === edge.source);
  if (!upstream) return undefined;
  if (upstream.type === "input.video-loader") {
    const video = selectedCanvasVideo(upstream.config);
    return video ? { url: video.url, name: video.filename, mimeType: video.mimeType, width: video.width, height: video.height, durationSeconds: video.durationSeconds } : undefined;
  }
  if (upstream.type === "input.source-video") {
    const source = canvasSourceVideoSnapshotFromConfig(upstream.config);
    return source ? { url: source.url, name: source.title, width: source.width, height: source.height, durationSeconds: source.durationSeconds } : undefined;
  }
  if (upstream.type === "input.videos") {
    const url = normalizeConfigUrls(upstream.config.urls)[0];
    return url ? { url } : undefined;
  }
  return undefined;
}

function firstVideoArtifactItem(artifacts?: CanvasArtifact[]) {
  const artifact = artifacts?.find((item) => item.kind === "videos");
  return artifact?.kind === "videos" ? artifact.items[0] : undefined;
}

function formatAspectRatio(width: number, height: number) {
  const divisor = greatestCommonDivisor(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function greatestCommonDivisor(left: number, right: number): number {
  return right ? greatestCommonDivisor(right, left % right) : Math.max(1, left);
}

function CanvasSubtitleSegments({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return <div className="canvas-subtitle-segments"><span>{label}</span><div>{options.map((option) => <button type="button" className={option.value === value ? "is-active" : ""} key={option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}</div></div>;
}

function hexToRgba(value: string, opacity: number) {
  const hex = value.replace("#", "");
  return `rgba(${Number.parseInt(hex.slice(0, 2), 16)}, ${Number.parseInt(hex.slice(2, 4), 16)}, ${Number.parseInt(hex.slice(4, 6), 16)}, ${opacity})`;
}

function subtitlePreviewShadow(color: string, width: number) {
  const offset = Math.max(1, Math.round(width));
  return [`-${offset}px 0 ${color}`, `${offset}px 0 ${color}`, `0 -${offset}px ${color}`, `0 ${offset}px ${color}`, `-${offset}px -${offset}px ${color}`, `${offset}px ${offset}px ${color}`].join(",");
}

type SeedanceMentionMenuState = { range: Range; query: string };
type SeedanceMentionChoice = { reference: SeedanceFixedReference; number: number; name: string };

function SeedancePromptComposer({ node, references, graph, errors, onPatch, createMentionId }: {
  node: CanvasNode;
  references: SeedanceFixedReference[];
  graph: CanvasGraph;
  errors: string[];
  onPatch: (patch: CanvasNode["config"]) => void;
  createMentionId: () => string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<SeedanceMentionMenuState | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantMode, setAssistantMode] = useState<SeedanceAssistantMode>("auto");
  const [assistantAction, setAssistantAction] = useState<SeedanceAssistantAction>("generate");
  const [assistantIntent, setAssistantIntent] = useState("");
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantError, setAssistantError] = useState("");
  const [assistantResult, setAssistantResult] = useState<{ response: SeedancePromptAssistantResponse; references: SeedanceAssistantReference[] }>();
  const promptDocument = String(node.config.prompt || "");
  const bindings = useMemo(() => seedanceMentionBindings(node.config), [node.config]);
  const numberByUrl = useMemo(() => new Map(references.map((reference, index) => [reference.url, index + 1])), [references]);
  const choices = useMemo<SeedanceMentionChoice[]>(() => references.map((reference, index) => ({
    reference,
    number: index + 1,
    name: seedanceReferenceName(reference, graph, node),
  })), [graph, node, references]);
  const filteredChoices = useMemo(() => {
    const query = menu?.query.trim().toLowerCase() || "";
    return choices.filter((choice) => !query || `图片${choice.number} ${choice.name}`.toLowerCase().includes(query));
  }, [choices, menu?.query]);
  const upstreamPromptConnected = graph.edges.some((edge) => edge.target === node.id && edge.targetPort === "prompt");
  const assistantReferences = useMemo<SeedanceAssistantReference[]>(() => references.map((reference, index) => ({
    id: `assistant-ref-${index + 1}`,
    number: index + 1,
    url: reference.url,
    name: seedanceReferenceName(reference, graph, node),
  })), [graph, node, references]);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (document.activeElement === editor && editor.dataset.seedanceDocument === promptDocument) {
      refreshSeedanceMentionChips(editor, bindings, numberByUrl);
      return;
    }
    renderSeedancePromptDocument(editor, promptDocument, bindings, numberByUrl);
    editor.dataset.seedanceDocument = promptDocument;
  }, [bindings, numberByUrl, promptDocument]);

  const updateMenu = () => {
    const editor = editorRef.current;
    setMenu(editor ? seedanceMentionQuery(editor) : null);
    setActiveIndex(0);
  };
  const commitDocument = (additionalBinding?: { id: string; url: string }) => {
    const editor = editorRef.current;
    if (!editor) return;
    const documentValue = serializeSeedancePromptEditor(editor);
    const bindingMap = new Map(bindings.map((binding) => [binding.id, binding.url]));
    if (additionalBinding) bindingMap.set(additionalBinding.id, additionalBinding.url);
    const activeIds = Array.from(new Set(seedanceMentionIds(documentValue)));
    const activeBindings = activeIds.flatMap((id) => {
      const url = bindingMap.get(id);
      return url ? [{ id, url }] : [];
    });
    editor.dataset.seedanceDocument = documentValue;
    onPatch({
      prompt: documentValue,
      mentionIds: activeBindings.map((binding) => binding.id),
      mentionUrls: activeBindings.map((binding) => binding.url),
    });
    refreshSeedanceMentionChips(editor, activeBindings, numberByUrl);
  };
  const chooseReference = (choice: SeedanceMentionChoice) => {
    const editor = editorRef.current;
    if (!editor || !menu) return;
    const id = createMentionId();
    insertSeedanceMention(editor, menu.range, id, choice.number);
    commitDocument({ id, url: choice.reference.url });
    setMenu(null);
  };
  const requestAssistant = async () => {
    setAssistantBusy(true);
    setAssistantError("");
    try {
      const response = await api<SeedancePromptAssistantResponse>("/api/canvas/seedance/prompt-assist", {
        method: "POST",
        body: JSON.stringify({
          action: assistantAction,
          mode: assistantMode,
          intent: assistantIntent,
          existingPrompt: seedancePromptDocumentText(promptDocument, bindings, numberByUrl),
          duration: Number(node.config.duration),
          ratio: String(node.config.ratio),
          references: assistantReferences,
        }),
      });
      setAssistantResult({ response, references: assistantReferences });
    } catch (error) {
      setAssistantError(errorMessage(error));
    } finally {
      setAssistantBusy(false);
    }
  };
  const applyAssistantCandidate = (candidate: SeedanceAssistantCandidate) => {
    if (!assistantResult || candidate.complianceRisk === "high") return;
    if (upstreamPromptConnected) {
      setAssistantError("请先断开外部提示词连接，再应用到节点 Prompt。");
      return;
    }
    const snapshotById = new Map(assistantResult.references.map((reference) => [reference.id, reference]));
    const availableUrls = new Set(references.map((reference) => reference.url));
    const mentionIds: string[] = [];
    const mentionUrls: string[] = [];
    const documentValue = candidate.promptParts.map((part) => {
      if (part.type === "text") return part.value;
      const snapshot = snapshotById.get(part.referenceId);
      if (!snapshot || !availableUrls.has(snapshot.url)) throw new Error("候选引用的参考图已被移除，请重新生成方案。");
      const id = createMentionId();
      mentionIds.push(id);
      mentionUrls.push(snapshot.url);
      return seedanceMentionMarker(id);
    }).join("").trim();
    onPatch({
      prompt: documentValue,
      mentionIds,
      mentionUrls,
      duration: candidate.duration,
      ratio: candidate.ratio,
      complianceRisk: candidate.complianceRisk,
    });
    setAssistantError("");
    setAssistantOpen(false);
  };
  const visibleErrors = Array.from(new Set(errors.map(seedanceInspectorError)));
  const visibleActiveIndex = Math.min(activeIndex, Math.max(0, filteredChoices.length - 1));
  return <div className="canvas-seedance-prompt">
    <div className="canvas-seedance-section-heading">
      <strong>Prompt</strong>
      <span className="canvas-seedance-heading-actions">
        <button type="button" onClick={() => setAssistantOpen((current) => !current)} aria-expanded={assistantOpen}><WandSparkles />AI 优化</button>
        <em>{promptDocument.trim() ? "节点 Prompt" : "外部提示词"}</em>
      </span>
    </div>
    <div className={`canvas-seedance-editor-shell ${visibleErrors.length ? "has-error" : ""}`}>
      <div
        ref={editorRef}
        className="canvas-seedance-editor"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Seedance Prompt"
        aria-controls="seedance-reference-menu"
        aria-haspopup="listbox"
        data-placeholder="描述镜头内容"
        onInput={() => { commitDocument(); updateMenu(); }}
        onClick={updateMenu}
        onKeyUp={(event) => {
          if (!["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)) updateMenu();
        }}
        onKeyDown={(event) => {
          if (!menu) return;
          if (event.key === "Escape") {
            event.preventDefault();
            setMenu(null);
          } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const direction = event.key === "ArrowDown" ? 1 : -1;
            setActiveIndex((current) => filteredChoices.length ? (current + direction + filteredChoices.length) % filteredChoices.length : 0);
          } else if ((event.key === "Enter" || event.key === "Tab") && filteredChoices[visibleActiveIndex]) {
            event.preventDefault();
            chooseReference(filteredChoices[visibleActiveIndex]);
          }
        }}
        onPaste={(event) => {
          event.preventDefault();
          insertSeedancePlainText(event.currentTarget, event.clipboardData.getData("text/plain"));
          commitDocument();
          updateMenu();
        }}
        onBlur={() => setMenu(null)}
      />
      {menu ? <div id="seedance-reference-menu" className="canvas-seedance-mention-menu" role="listbox" aria-label="固定参考图">
        {filteredChoices.length ? filteredChoices.map((choice, index) => <button
          type="button"
          role="option"
          aria-selected={index === visibleActiveIndex}
          className={index === visibleActiveIndex ? "is-active" : ""}
          key={choice.reference.url}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => chooseReference(choice)}
        >
          <span className="canvas-seedance-menu-thumb" style={{ backgroundImage: `url(${JSON.stringify(choice.reference.url)})` }} />
          <span><strong>@图片{choice.number}</strong><small>{choice.name}</small></span>
        </button>) : <p>暂无固定参考图</p>}
      </div> : null}
    </div>
    {visibleErrors.length ? <div className="canvas-seedance-errors" role="alert">{visibleErrors.map((error) => <p key={error}><AlertTriangle />{error}</p>)}</div> : null}
    {assistantOpen ? <div className="canvas-seedance-assistant">
      <div className="canvas-seedance-assistant-controls">
        <label><span>模式</span><select value={assistantMode} onChange={(event) => setAssistantMode(event.target.value as SeedanceAssistantMode)}>
          <option value="auto">自动识别</option>
          <option value="text">文生视频</option>
          <option value="image">图生视频</option>
          <option value="storyboard">分镜板</option>
          <option value="rewrite">改写现有</option>
        </select></label>
        <label><span>操作</span><select value={assistantAction} onChange={(event) => setAssistantAction(event.target.value as SeedanceAssistantAction)}>
          <option value="generate">生成方案</option>
          <option value="rewrite">整体改写</option>
          <option value="hook">强化 Hook</option>
          <option value="repair">修复运镜</option>
          <option value="shorten">压缩提示词</option>
        </select></label>
      </div>
      <label><span>创意要求</span><textarea value={assistantIntent} onChange={(event) => setAssistantIntent(event.target.value)} placeholder="例如：汽车从雨幕中驶出，前两秒要有强冲击" maxLength={4000} /></label>
      <button className="canvas-seedance-assistant-generate" type="button" disabled={assistantBusy || (!assistantIntent.trim() && !promptDocument.trim())} onClick={() => void requestAssistant()}>
        {assistantBusy ? <LoaderCircle className="animate-spin" /> : <Sparkles />}<span>{assistantBusy ? "生成中" : "生成两个方案"}</span>
      </button>
      {assistantError ? <p className="canvas-seedance-assistant-error" role="alert"><AlertTriangle />{assistantError}</p> : null}
      {assistantResult ? <div className="canvas-seedance-candidates">
        <div className="canvas-seedance-assistant-mode"><span>识别模式</span><strong>{seedanceAssistantModeLabel(assistantResult.response.resolvedMode)}</strong></div>
        <div className="canvas-seedance-assistant-mode"><span>Skill</span><strong>{assistantResult.response.skill.source === "configured-file" ? "外部文件" : "内置规则"}</strong><code title={assistantResult.response.skill.version}>{assistantResult.response.skill.version.slice(0, 12)}</code></div>
        {assistantResult.response.candidates.map((candidate) => <SeedanceAssistantCandidateView
          key={candidate.id}
          candidate={candidate}
          references={assistantResult.references}
          applyBlocked={upstreamPromptConnected}
          onApply={() => {
            try { applyAssistantCandidate(candidate); } catch (error) { setAssistantError(errorMessage(error)); }
          }}
        />)}
      </div> : null}
    </div> : null}
  </div>;
}

function SeedanceAssistantCandidateView({ candidate, references, applyBlocked, onApply }: {
  candidate: SeedanceAssistantCandidate;
  references: SeedanceAssistantReference[];
  applyBlocked: boolean;
  onApply: () => void;
}) {
  const prompt = serializeSeedanceAssistantPrompt(candidate.promptParts, references);
  const blocked = applyBlocked || candidate.complianceRisk === "high";
  return <article className="canvas-seedance-candidate">
    <header><strong>{candidate.title}</strong><span className={`is-${candidate.complianceRisk}`}>{seedanceRiskLabel(candidate.complianceRisk)}</span></header>
    <p className="canvas-seedance-candidate-prompt">{prompt}</p>
    <div className="canvas-seedance-candidate-meta"><span>{candidate.duration} 秒</span><span>{candidate.ratio}</span><span>{candidate.checks.characterCount}/2000</span></div>
    {candidate.warnings.length ? <ul>{candidate.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
    <button type="button" disabled={blocked} onClick={onApply} title={applyBlocked ? "先断开外部提示词连接" : candidate.complianceRisk === "high" ? "高风险方案禁止应用" : "应用到节点 Prompt"}><CheckCircle2 /><span>应用方案</span></button>
  </article>;
}

function seedancePromptDocumentText(value: string, bindings: Array<{ id: string; url: string }>, numberByUrl: Map<string, number>) {
  const bindingMap = new Map(bindings.map((binding) => [binding.id, binding.url]));
  return parseSeedancePromptDocument(value).map((part) => {
    if (part.kind === "text") return part.value;
    const number = numberByUrl.get(bindingMap.get(part.id) || "");
    return number ? `@图片${number}` : "";
  }).join("").trim();
}

function seedanceAssistantModeLabel(mode: SeedancePromptAssistantResponse["resolvedMode"]) {
  return ({ text: "文生视频", image: "图生视频", storyboard: "分镜板", rewrite: "改写现有" } as const)[mode];
}

function seedanceRiskLabel(risk: SeedanceAssistantCandidate["complianceRisk"]) {
  return ({ low: "低风险", medium: "需复核", high: "禁止应用" } as const)[risk];
}

function seedanceReferenceName(reference: SeedanceFixedReference, graph: CanvasGraph, node: CanvasNode) {
  if (reference.source === "direct") {
    const index = normalizeConfigUrls(node.config.referenceUrls).indexOf(reference.url);
    return `节点上传 · 第 ${Math.max(0, index) + 1} 张`;
  }
  const source = graph.nodes.find((candidate) => candidate.id === reference.sourceNodeId);
  const sourceIndex = source ? normalizeConfigUrls(source.config.urls).indexOf(reference.url) : -1;
  const sourceName = source?.label?.trim() || (source ? getCanvasNodeDefinition(source.type, source.version)?.label : "上游图片") || "上游图片";
  return `${sourceName} · 第 ${Math.max(0, sourceIndex) + 1} 张`;
}

function seedanceInspectorError(error: string) {
  if (error.includes("requires a node Prompt")) return "请填写节点 Prompt 或连接外部提示词。";
  if (error.includes("at the same time")) return "节点 Prompt 与外部提示词不能同时使用。";
  if (error.includes("removed image")) return "Prompt 中存在已移除的图片引用。";
  if (error.includes("mention") || error.includes("binding")) return "Prompt 中存在失效的图片引用。";
  if (error.includes("2000 characters")) return "Prompt 不能超过 2000 个字符。";
  if (error.includes("at most 9")) return "Seedance 最多支持 9 张参考图片。";
  return error;
}

function renderSeedancePromptDocument(editor: HTMLDivElement, value: string, bindings: Array<{ id: string; url: string }>, numberByUrl: Map<string, number>) {
  const bindingMap = new Map(bindings.map((binding) => [binding.id, binding.url]));
  const fragment = document.createDocumentFragment();
  for (const part of parseSeedancePromptDocument(value)) {
    if (part.kind === "text") {
      fragment.append(document.createTextNode(part.value));
      continue;
    }
    fragment.append(createSeedanceMentionChip(part.id, bindingMap.get(part.id), numberByUrl));
  }
  editor.replaceChildren(fragment);
}

function refreshSeedanceMentionChips(editor: HTMLDivElement, bindings: Array<{ id: string; url: string }>, numberByUrl: Map<string, number>) {
  const bindingMap = new Map(bindings.map((binding) => [binding.id, binding.url]));
  for (const chip of Array.from(editor.querySelectorAll<HTMLElement>("[data-seedance-mention-id]"))) {
    const id = chip.dataset.seedanceMentionId || "";
    const number = numberByUrl.get(bindingMap.get(id) || "");
    chip.classList.toggle("is-invalid", !number);
    chip.textContent = number ? `@图片${number}` : "@失效图片";
    chip.title = number ? `图片${number}` : "引用图片已移除";
  }
}

function createSeedanceMentionChip(id: string, url: string | undefined, numberByUrl: Map<string, number>) {
  const chip = document.createElement("span");
  const number = numberByUrl.get(url || "");
  chip.className = `canvas-seedance-mention${number ? "" : " is-invalid"}`;
  chip.dataset.seedanceMentionId = id;
  chip.contentEditable = "false";
  chip.textContent = number ? `@图片${number}` : "@失效图片";
  chip.title = number ? `图片${number}` : "引用图片已移除";
  return chip;
}

function serializeSeedancePromptEditor(editor: HTMLDivElement) {
  const readNode = (node: ChildNode): string => {
    if (node.nodeType === Node.TEXT_NODE) return (node.textContent || "").replaceAll("\u200B", "");
    if (!(node instanceof HTMLElement)) return "";
    const mentionId = node.dataset.seedanceMentionId;
    if (mentionId) return seedanceMentionMarker(mentionId);
    if (node.tagName === "BR") return "\n";
    return Array.from(node.childNodes).map(readNode).join("");
  };
  let result = "";
  for (const child of Array.from(editor.childNodes)) {
    const block = child instanceof HTMLElement && ["DIV", "P"].includes(child.tagName);
    if (block && result && !result.endsWith("\n")) result += "\n";
    result += readNode(child);
  }
  return result.replaceAll("\u200B", "");
}

function seedanceMentionQuery(editor: HTMLDivElement): SeedanceMentionMenuState | null {
  const selection = window.getSelection();
  if (!selection?.isCollapsed || !selection.rangeCount || !selection.focusNode || !editor.contains(selection.focusNode)) return null;
  if (selection.focusNode.nodeType !== Node.TEXT_NODE) return null;
  const text = selection.focusNode.textContent || "";
  const beforeCaret = text.slice(0, selection.focusOffset);
  const match = beforeCaret.match(/@([^\s@]*)$/);
  if (!match) return null;
  const range = document.createRange();
  range.setStart(selection.focusNode, selection.focusOffset - match[0].length);
  range.setEnd(selection.focusNode, selection.focusOffset);
  return { range, query: match[1] };
}

function insertSeedanceMention(editor: HTMLDivElement, range: Range, id: string, number: number) {
  range.deleteContents();
  const chip = document.createElement("span");
  chip.className = "canvas-seedance-mention";
  chip.dataset.seedanceMentionId = id;
  chip.contentEditable = "false";
  chip.textContent = `@图片${number}`;
  chip.title = `图片${number}`;
  const caret = document.createTextNode("\u200B");
  range.insertNode(caret);
  range.insertNode(chip);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  const nextRange = document.createRange();
  nextRange.setStart(caret, caret.data.length);
  nextRange.collapse(true);
  selection?.addRange(nextRange);
  editor.focus({ preventScroll: true });
}

function insertSeedancePlainText(editor: HTMLDivElement, text: string) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.focusNode || !editor.contains(selection.focusNode)) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const textNode = document.createTextNode(text.replace(/\r\n?/g, "\n"));
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function ContentPoolSnapshotPicker({ node, onPatch }: { node: CanvasNode; onPatch: (patch: CanvasNode["config"]) => void }) {
  const [items, setItems] = useState<NormalizedSourceItem[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectedId = String(node.config.sourceItemId || "");
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const snapshot = await api<ContentPoolSnapshot>("/api/content-pool");
      const nextItems = snapshot.projects.flatMap((project) => project.items);
      setItems(nextItems);
      return nextItems;
    } catch (loadError) {
      setError(errorMessage(loadError));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => !query || [item.title, item.contentText, item.platform, item.authorName].some((value) => value?.toLowerCase().includes(query))).slice(0, 100);
  }, [items, search]);
  const capture = (item: NormalizedSourceItem) => onPatch(contentPoolSnapshotConfig(item));
  const refresh = async () => {
    const latestItems = await load();
    if (!latestItems) return;
    const item = latestItems.find((candidate) => candidate.id === selectedId);
    if (!item) {
      setError("原内容池条目当前不可用，已保留节点快照。");
      return;
    }
    capture(item);
    setError("");
  };
  return <div className="canvas-snapshot-picker">
    <div className="canvas-picker-heading"><span>内容池条目</span><button type="button" onClick={() => void load()} disabled={busy} title="重新加载"><RotateCcw className={busy ? "animate-spin" : ""} /></button></div>
    <label className="canvas-picker-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索标题、正文或平台" /></label>
    <select value={selectedId} onChange={(event) => {
      const item = items.find((candidate) => candidate.id === event.target.value);
      if (item) capture(item);
    }}>
      <option value="">选择内容池素材</option>
      {filtered.map((item) => <option key={item.id} value={item.id}>{item.title || item.contentText?.slice(0, 32) || item.id} · {item.platform}</option>)}
    </select>
    {selectedId ? <div className="canvas-snapshot-meta"><span>{String(node.config.snapshotTitle || "未命名素材")}</span><small>{normalizeConfigUrls(node.config.snapshotImageUrls).length} 图 · {normalizeConfigUrls(node.config.snapshotVideoUrls).length} 视频 · {formatSnapshotTime(node.config.snapshotAt)}</small><button type="button" onClick={() => void refresh()} disabled={busy}><RotateCcw />刷新快照</button></div> : null}
    {error ? <p className="canvas-picker-error">{error}</p> : null}
  </div>;
}

function CopyLibrarySnapshotPicker({ node, onPatch }: { node: CanvasNode; onPatch: (patch: CanvasNode["config"]) => void }) {
  const [data, setData] = useState<CanvasCopyLibraryResponse>({ entries: [], tags: [] });
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectedId = String(node.config.entryId || "");
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (tag) params.append("tag", tag);
      const result = await api<CanvasCopyLibraryResponse>(`/api/copy-library${params.size ? `?${params}` : ""}`);
      setData(result);
      return result.entries;
    } catch (loadError) {
      setError(errorMessage(loadError));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, [search, tag]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 180);
    return () => clearTimeout(timer);
  }, [load]);
  const capture = (entry: CopyLibraryEntryView) => onPatch(copyLibrarySnapshotConfig(entry));
  const refresh = async () => {
    setBusy(true);
    try {
      const result = await api<CanvasCopyLibraryResponse>("/api/copy-library");
      const entry = result.entries.find((candidate) => candidate.id === selectedId);
      if (!entry) {
        setError("源文案当前不可用，节点已保留原快照。");
        return;
      }
      capture(entry);
      setError("");
    } catch (refreshError) {
      setError(errorMessage(refreshError));
    } finally {
      setBusy(false);
    }
  };
  return <div className="canvas-snapshot-picker">
    <div className="canvas-picker-heading"><span>文案库记录</span><button type="button" onClick={() => void load()} disabled={busy} title="重新加载"><RotateCcw className={busy ? "animate-spin" : ""} /></button></div>
    <label className="canvas-picker-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索标题、正文或标签" /></label>
    <select value={tag} onChange={(event) => setTag(event.target.value)}><option value="">全部标签</option>{data.tags.map((tagValue) => <option key={tagValue} value={tagValue}>{tagValue}</option>)}</select>
    <select value={selectedId} onChange={(event) => { const entry = data.entries.find((candidate) => candidate.id === event.target.value); if (entry) capture(entry); }}>
      <option value="">选择文案</option>
      {data.entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.title} · {entry.ownerDisplayName}</option>)}
    </select>
    {selectedId ? <div className="canvas-snapshot-meta"><span>{String(node.config.entryTitle || node.config.snapshotTitle || "未命名文案")}</span><small>{configStringList(node.config.snapshotTags).length} 个标签 · {formatSnapshotTime(node.config.snapshotAt)}</small><button type="button" onClick={() => void refresh()} disabled={busy}><RotateCcw />刷新快照</button></div> : null}
    {error ? <p className="canvas-picker-error">{error}</p> : null}
  </div>;
}

function LibraryImageSnapshotPicker({ node, onPatch, onPreviewImage }: {
  node: CanvasNode;
  onPatch: (patch: CanvasNode["config"]) => void;
  onPreviewImage: (url: string, index: number) => void;
}) {
  const [data, setData] = useState<LibraryAssetPage>({ assets: [], collections: [], total: 0 });
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ids = configStringList(node.config.assetIds);
  const names = configStringList(node.config.assetNames);
  const urls = configStringList(node.config.urls);
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    const params = new URLSearchParams({ limit: "100" });
    if (search.trim()) params.set("search", search.trim());
    if (tag.trim()) params.set("tag", tag.trim());
    if (collectionId) params.set("collectionId", collectionId);
    try {
      setData(await api<LibraryAssetPage>(`/api/library/assets?${params}`));
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setBusy(false);
    }
  }, [collectionId, search, tag]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);
  const patchSelection = (nextIds: string[], nextNames: string[], nextUrls: string[]) => onPatch({ assetIds: nextIds, assetNames: nextNames, urls: nextUrls, snapshotAt: new Date().toISOString() });
  const toggle = (asset: LibraryAsset) => {
    const index = ids.indexOf(asset.id);
    if (index >= 0) {
      patchSelection(ids.filter((_, itemIndex) => itemIndex !== index), names.filter((_, itemIndex) => itemIndex !== index), urls.filter((_, itemIndex) => itemIndex !== index));
      return;
    }
    if (ids.length >= 30) {
      setError("素材库图片节点最多选择 30 张图片。");
      return;
    }
    patchSelection([...ids, asset.id], [...names, asset.name], [...urls, asset.publicUrl]);
  };
  const move = (from: number, to: number) => patchSelection(moveListItem(ids, from, to), moveListItem(names, from, to), moveListItem(urls, from, to));
  const remove = (index: number) => patchSelection(ids.filter((_, itemIndex) => itemIndex !== index), names.filter((_, itemIndex) => itemIndex !== index), urls.filter((_, itemIndex) => itemIndex !== index));
  const refresh = async () => {
    setBusy(true);
    setError("");
    try {
      const assets = await Promise.all(ids.map((id) => api<{ asset: LibraryAsset }>(`/api/library/assets/${encodeURIComponent(id)}`).then((result) => result.asset)));
      patchSelection(assets.map((asset) => asset.id), assets.map((asset) => asset.name), assets.map((asset) => asset.publicUrl));
    } catch (refreshError) {
      setError(`刷新失败，已保留原快照：${errorMessage(refreshError)}`);
    } finally {
      setBusy(false);
    }
  };
  return <div className="canvas-snapshot-picker">
    <div className="canvas-picker-heading"><span>素材库图片</span><small>{ids.length}/30</small><button type="button" onClick={() => void refresh()} disabled={busy || !ids.length} title="刷新所选素材"><RotateCcw className={busy ? "animate-spin" : ""} /></button></div>
    <label className="canvas-picker-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索图片" /></label>
    <div className="canvas-picker-filters"><input value={tag} onChange={(event) => setTag(event.target.value)} placeholder="标签" /><select value={collectionId} onChange={(event) => setCollectionId(event.target.value)}><option value="">全部集合</option>{data.collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select></div>
    {ids.length ? <div className="canvas-picker-selected">{urls.map((url, index) => <div key={`${ids[index]}-${index}`}>
      <button type="button" className="canvas-picker-thumb" onClick={() => onPreviewImage(url, index)} style={{ backgroundImage: `url(${JSON.stringify(url)})` }} aria-label={`预览素材 ${index + 1}`} />
      <span>{index + 1}. {names[index] || ids[index]}</span>
      <button type="button" onClick={() => move(index, index - 1)} disabled={index === 0} title="上移"><ArrowUp /></button>
      <button type="button" onClick={() => move(index, index + 1)} disabled={index === ids.length - 1} title="下移"><ArrowDown /></button>
      <button type="button" onClick={() => remove(index)} title="移除"><X /></button>
    </div>)}</div> : null}
    <div className="canvas-picker-results">{data.assets.map((asset) => <label key={asset.id}><input type="checkbox" checked={ids.includes(asset.id)} onChange={() => toggle(asset)} /><span style={{ backgroundImage: `url(${JSON.stringify(asset.publicUrl)})` }} /><small>{asset.name}</small></label>)}</div>
    {data.total > data.assets.length ? <small className="canvas-picker-limit">显示前 {data.assets.length} / {data.total} 张，请使用搜索或筛选缩小范围。</small> : null}
    {error ? <p className="canvas-picker-error">{error}</p> : null}
  </div>;
}

function CanvasQuickAdd({ state, edges, onChoose, onClose }: {
  state: NonNullable<QuickAddState>;
  edges: FlowEdge[];
  onChoose: (type: CanvasNodeType, port?: CanvasPortDefinition) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const allChoices = useMemo(() => quickAddChoices(state.connection, edges), [edges, state.connection]);
  const choices = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return allChoices;
    return allChoices.filter(({ definition, port }) => [
      definition.label,
      definition.description,
      definition.type,
      definition.category,
      categoryLabel(definition.category),
      port?.label,
    ].some((value) => value?.toLowerCase().includes(query)));
  }, [allChoices, search]);
  const resolvedActiveIndex = Math.min(activeIndex, Math.max(choices.length - 1, 0));

  useEffect(() => { searchRef.current?.focus(); }, []);

  const choose = (choice: QuickAddChoice | undefined) => {
    if (choice) onChoose(choice.definition.type, choice.port);
  };
  const style = {
    "--canvas-quick-add-x": `${state.screen.x}px`,
    "--canvas-quick-add-y": `${state.screen.y}px`,
  } as React.CSSProperties;

  return <section
    className="canvas-quick-add"
    style={style}
    role="dialog"
    aria-label={state.connection ? `添加可连接的${portKindLabel(state.connection.kind)}节点` : "添加节点"}
    onMouseDown={(event) => event.stopPropagation()}
    onKeyDown={(event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowDown" && choices.length) {
        event.preventDefault();
        setActiveIndex((current) => (current + 1) % choices.length);
      } else if (event.key === "ArrowUp" && choices.length) {
        event.preventDefault();
        setActiveIndex((current) => (current - 1 + choices.length) % choices.length);
      } else if (event.key === "Enter") {
        event.preventDefault();
        choose(choices[resolvedActiveIndex]);
      }
    }}
  >
    <div className="canvas-quick-add-search"><Search /><input
      ref={searchRef}
      value={search}
      onChange={(event) => { setSearch(event.target.value); setActiveIndex(0); }}
      placeholder={state.connection ? `搜索${portKindLabel(state.connection.kind)}兼容节点` : "搜索节点"}
      role="combobox"
      aria-controls="canvas-quick-add-list"
      aria-expanded="true"
    /><button type="button" onClick={onClose} aria-label="关闭节点搜索" title="关闭"><X /></button></div>
    {state.connection ? <div className="canvas-quick-add-context"><span>{state.connection.handleType === "source" ? "连接到输入" : "从输出连接"}</span><strong>{portKindLabel(state.connection.kind)}</strong></div> : null}
    <div className="canvas-quick-add-list" id="canvas-quick-add-list" role="listbox">
      {(["input", "model", "utility", "compose", "publish"] as const).map((category) => {
        const categoryChoices = choices.filter((choice) => choice.definition.category === category);
        if (!categoryChoices.length) return null;
        return <div className="canvas-quick-add-group" key={category}>
          <small>{categoryLabel(category)}</small>
          {categoryChoices.map((choice) => {
            const index = choices.indexOf(choice);
            const portCount = allChoices.filter((candidate) => candidate.definition.type === choice.definition.type).length;
            return <button
              key={`${choice.definition.type}-${choice.port?.id || "node"}`}
              type="button"
              className={index === resolvedActiveIndex ? "is-active" : ""}
              role="option"
              aria-selected={index === resolvedActiveIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(choice)}
            >
              <span style={{ color: choice.definition.color }}>{iconForNode(choice.definition.type)}</span>
              <span><strong>{choice.definition.label}</strong><small>{choice.definition.description}</small></span>
              {choice.port && portCount > 1 ? <em>{choice.port.label}</em> : null}
            </button>;
          })}
        </div>;
      })}
      {!choices.length ? <div className="canvas-quick-add-empty">{state.connection?.handleType === "target" && isQuickAddTargetOccupied(state.connection, edges) ? "该输入端口已连接" : "没有兼容节点"}</div> : null}
    </div>
  </section>;
}

function CanvasScheduleCenter({ workflow, graph, onSaveBindings, onPreview, onClose, onOpenRuns }: {
  workflow: CanvasWorkflow;
  graph: CanvasGraph;
  onSaveBindings: (bindings: CanvasScheduleBindings) => Promise<CanvasWorkflow | undefined>;
  onPreview: (preview: Extract<NonNullable<PreviewState>, { kind: "image" }>) => void;
  onClose: () => void;
  onOpenRuns: () => void;
}) {
  const [schedules, setSchedules] = useState<CanvasSchedule[]>([]);
  const [selected, setSelected] = useState<CanvasSchedule>();
  const [busy, setBusy] = useState(false);
  const [bindingBusy, setBindingBusy] = useState(false);
  const [bindingDraft, setBindingDraft] = useState<Partial<CanvasScheduleBindings>>(() => schedulerBindingsFromGraph(graph));
  const [error, setError] = useState("");
  const [editSequence, setEditSequence] = useState(0);
  const selectedRef = useRef<CanvasSchedule | undefined>(undefined);
  const editSequenceRef = useRef(0);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const bindingsComplete = hasCompleteSchedulerBindings(bindingDraft);
  const bindingsSaved = bindingsComplete && schedulerBindingsEqual(bindingDraft, schedulerBindingsFromGraph(graph));

  const adoptSchedule = useCallback((schedule: CanvasSchedule, resetEdits = true) => {
    selectedRef.current = schedule;
    setSelected(schedule);
    setSchedules((current) => [schedule, ...current.filter((item) => item.id !== schedule.id)]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
    if (resetEdits) {
      editSequenceRef.current = 0;
      setEditSequence(0);
    }
  }, []);

  const load = useCallback(async (preferredId?: string) => {
    setBusy(true);
    setError("");
    try {
      const data = await api<{ schedules: CanvasSchedule[] }>("/api/canvas/schedules");
      const workflowSchedules = data.schedules.filter((item) => item.workflowId === workflow.id);
      setSchedules(workflowSchedules);
      const currentId = preferredId || selectedRef.current?.id;
      const next = workflowSchedules.find((item) => item.id === currentId) || workflowSchedules[0];
      selectedRef.current = next;
      setSelected(next);
      editSequenceRef.current = 0;
      setEditSequence(0);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setBusy(false);
    }
  }, [workflow.id]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!selected || !["queued", "running", "paused"].includes(selected.status)) return;
    const scheduleId = selected.id;
    const timer = setInterval(async () => {
      try {
        const data = await api<{ schedule: CanvasSchedule }>(`/api/canvas/schedules/${scheduleId}`);
        adoptSchedule(data.schedule);
      } catch (pollError) {
        setError(errorMessage(pollError));
      }
    }, 2_000);
    return () => clearInterval(timer);
  }, [adoptSchedule, selected]);

  const patchSelected = useCallback((updater: (schedule: CanvasSchedule) => CanvasSchedule) => {
    setSelected((current) => {
      if (!current) return current;
      const next = updater(current);
      selectedRef.current = next;
      return next;
    });
    editSequenceRef.current += 1;
    setEditSequence(editSequenceRef.current);
  }, []);

  const persistDraft = useCallback(async (schedule: CanvasSchedule, sequence: number) => {
    let resolveSave!: (value: CanvasSchedule) => void;
    let rejectSave!: (reason?: unknown) => void;
    const result = new Promise<CanvasSchedule>((resolve, reject) => {
      resolveSave = resolve;
      rejectSave = reject;
    });
    saveQueueRef.current = saveQueueRef.current.then(async () => {
      try {
        const current = selectedRef.current;
        const revision = current?.id === schedule.id ? current.revision : schedule.revision;
        const data = await api<{ schedule: CanvasSchedule }>(`/api/canvas/schedules/${schedule.id}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "save", revision, name: schedule.name, batches: schedule.batches, definition: schedule.definition }),
        });
        if (editSequenceRef.current === sequence) {
          adoptSchedule(data.schedule);
          resolveSave(data.schedule);
          return;
        }
        const selectedSchedule = selectedRef.current;
        if (selectedSchedule?.id === data.schedule.id) {
          const merged = { ...selectedSchedule, revision: data.schedule.revision };
          selectedRef.current = merged;
          setSelected((current) => current?.id === merged.id ? merged : current);
          resolveSave(merged);
        } else {
          resolveSave(data.schedule);
        }
      } catch (saveError) {
        rejectSave(saveError);
      }
    });
    return result;
  }, [adoptSchedule]);

  useEffect(() => {
    if (!selected || !editSequence || !["draft", "ready"].includes(selected.status) || busy) return;
    const snapshot = selected;
    const sequence = editSequence;
    const timer = setTimeout(() => {
      void persistDraft(snapshot, sequence).catch((saveError) => setError(errorMessage(saveError)));
    }, 900);
    return () => clearTimeout(timer);
  }, [busy, editSequence, persistDraft, selected]);

  async function createSchedule() {
    setBusy(true);
    setError("");
    try {
      const data = await api<{ schedule: CanvasSchedule }>("/api/canvas/schedules", {
        method: "POST",
        body: JSON.stringify({ workflowId: workflow.id }),
      });
      adoptSchedule(data.schedule);
    } catch (createError) {
      setError(errorMessage(createError));
    } finally {
      setBusy(false);
    }
  }

  async function saveBindings() {
    if (!bindingsComplete) return;
    setBindingBusy(true);
    setError("");
    try {
      const savedWorkflow = await onSaveBindings(bindingDraft);
      if (savedWorkflow) setBindingDraft(schedulerBindingsFromGraph(savedWorkflow.graph));
    } catch (bindingError) {
      setError(errorMessage(bindingError));
    } finally {
      setBindingBusy(false);
    }
  }

  function changeBinding(role: CanvasSchedulerRole, nodeId: string) {
    setBindingDraft((current) => {
      const next = { ...current, [role]: nodeId || undefined };
      if (nodeId) {
        for (const otherRole of CANVAS_SCHEDULER_ROLES) {
          if (otherRole !== role && next[otherRole] === nodeId) next[otherRole] = undefined;
        }
      }
      return next;
    });
  }

  async function scheduleAction(action: string, payload: Record<string, unknown> = {}, saveFirst = false) {
    let schedule = selectedRef.current;
    if (!schedule) return;
    setBusy(true);
    setError("");
    try {
      if (saveFirst && editSequenceRef.current) schedule = await persistDraft(schedule, editSequenceRef.current);
      const data = await api<{ schedule: CanvasSchedule }>(`/api/canvas/schedules/${schedule.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action, revision: schedule.revision, ...payload }),
      });
      adoptSchedule(data.schedule);
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setBusy(false);
    }
  }

  async function removeSchedule() {
    const schedule = selectedRef.current;
    if (!schedule || !window.confirm(`删除“${schedule.name}”？`)) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/canvas/schedules/${schedule.id}`, { method: "DELETE" });
      selectedRef.current = undefined;
      setSelected(undefined);
      await load();
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setBusy(false);
    }
  }

  const editable = selected && ["draft", "ready"].includes(selected.status);
  const patchBatch = (batchId: string, patch: Partial<CanvasScheduleBatch>) => patchSelected((schedule) => ({
    ...schedule,
    status: "draft",
    batches: schedule.batches.map((batch) => batch.id === batchId ? { ...batch, ...patch, updatedAt: new Date().toISOString() } : batch),
  }));
  const addBatch = () => patchSelected((schedule) => {
    const now = new Date().toISOString();
    return {
      ...schedule,
      status: "draft",
      batches: [...schedule.batches, {
        id: `canvas-batch-client-${Date.now()}`,
        name: `批次 ${schedule.batches.length + 1}`,
        strategy: "input-1",
        sceneFilter: emptyScheduleFilter(),
        sceneCount: 1,
        vehicleFilter: emptyScheduleFilter(),
        vehicleCountMin: 1,
        vehicleCountMax: 3,
        status: "draft",
        contentTasks: [],
        createdAt: now,
        updatedAt: now,
      }],
    };
  });
  const removeBatch = (batchId: string) => patchSelected((schedule) => ({
    ...schedule,
    status: "draft",
    batches: schedule.batches.filter((batch) => batch.id !== batchId),
  }));

  return <div className="canvas-task-center" role="dialog" aria-modal="true" aria-label="Canvas 批量调度">
    <button className="canvas-task-center-backdrop" type="button" onClick={onClose} aria-label="关闭批量调度" />
    <aside className="canvas-task-center-panel canvas-schedule-panel">
      <header>
        <div><ListChecks /><span><strong>批量调度</strong><small>{workflow.name} · r{workflow.revision}</small></span></div>
        <div>
          <button className="canvas-center-tab" type="button" onClick={onOpenRuns}><History /><span>任务中心</span></button>
          <button type="button" onClick={() => void load(selected?.id)} disabled={busy} aria-label="刷新调度" title="刷新"><RefreshCw className={busy ? "animate-spin" : ""} /></button>
          <button type="button" onClick={onClose} aria-label="关闭批量调度" title="关闭"><X /></button>
        </div>
      </header>
      <div className="canvas-schedule-toolbar">
        <button type="button" onClick={() => void createSchedule()} disabled={busy}><Plus />新建任务</button>
        {selected ? <button type="button" onClick={() => void scheduleAction("duplicate")} disabled={busy}><CopyPlus />复制为新任务</button> : null}
        {selected && selected.schemaVersion !== 2 && editable ? <button type="button" onClick={() => void scheduleAction("convert-v2")} disabled={busy}><GitBranch />转换为灵活调度</button> : null}
        {selected && editable ? <button className="danger" type="button" onClick={() => void removeSchedule()} disabled={busy}><Trash2 />删除</button> : null}
        <span>{editSequence ? "保存中" : "已保存"}</span>
      </div>
      {error ? <div className="canvas-task-error"><AlertTriangle />{error}</div> : null}
      <div className="canvas-schedule-body">
        <nav className="canvas-schedule-list" aria-label="批量任务列表">
          {schedules.map((schedule) => <button type="button" key={schedule.id} className={selected?.id === schedule.id ? "is-selected" : ""} onClick={() => adoptSchedule(schedule)}>
            <StatusIcon status={schedule.status} />
            <span><strong>{schedule.name}</strong><small>{schedule.schemaVersion === 2 ? `${schedule.totalMainTasks || 0} 主任务 · ${schedule.totalChildTasks || 0} 子任务` : `${schedule.totalContentTasks} 篇 · ${schedule.totalImageTasks} 图`} · {formatCanvasRunTime(schedule.updatedAt)}</small></span>
            <em>{canvasScheduleStatusLabel(schedule.status)}</em>
          </button>)}
          {!schedules.length && !busy ? <div className="canvas-task-empty"><ListChecks /><span>当前还没有批量任务</span></div> : null}
        </nav>
        <section className="canvas-schedule-editor">
          {selected?.schemaVersion !== 2 ? <section className="canvas-scheduler-bindings" aria-label="画布绑定">
            <header>
              <span><strong>画布绑定</strong><small>为当前工作流指定批量调度使用的节点</small></span>
              <button type="button" onClick={() => void saveBindings()} disabled={bindingBusy || !bindingsComplete}>
                {bindingBusy ? <LoaderCircle className="animate-spin" /> : <Save />}保存绑定
              </button>
            </header>
            <div>
              {CANVAS_SCHEDULER_ROLES.map((role) => <label key={role}>
                <span>{schedulerRoleLabel(role)}{role === "copy-input" ? "（可选）" : ""}</span>
                <select value={bindingDraft[role] || ""} onChange={(event) => changeBinding(role, event.target.value)}>
                  <option value="">未选择</option>
                  {schedulerBindingNodeOptions(graph, role).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>)}
            </div>
            {!bindingsComplete ? <p><AlertTriangle />请完成五项必需节点绑定后再预演；使用文案池时还需绑定文案库输入。</p> : !bindingsSaved ? <p><AlertTriangle />绑定已修改，请先保存再预演。</p> : null}
          </section> : null}
          {!selected ? <div className="canvas-task-empty"><Plus /><span>新建一个批量任务</span></div> : <>
            <div className="canvas-schedule-head">
              <input value={selected.name} disabled={!editable} aria-label="批量任务名称" onChange={(event) => patchSelected((schedule) => ({ ...schedule, name: event.target.value }))} />
              <span className={`is-${selected.status}`}>{canvasScheduleStatusLabel(selected.status)}</span>
            </div>
            <div className="canvas-schedule-metrics">
              <div><small>{selected.schemaVersion === 2 ? "主任务" : "图文任务"}</small><strong>{selected.schemaVersion === 2 ? selected.totalMainTasks || 0 : selected.totalContentTasks}</strong></div>
              <div><small>{selected.schemaVersion === 2 ? "子任务" : "图片子任务"}</small><strong>{selected.schemaVersion === 2 ? selected.totalChildTasks || 0 : selected.totalImageTasks}</strong></div>
              <div><small>画布版本</small><strong>r{selected.workflowRevision}</strong></div>
            </div>
            {editable ? selected.schemaVersion === 2 ? <CanvasScheduleV2Editor
              key={selected.id}
              schedule={selected}
              graph={graph}
              busy={busy}
              onPreview={onPreview}
              onDefinitionChange={(definition) => patchSelected((schedule) => ({
                ...schedule,
                status: "draft",
                definition,
                mainTasks: [],
                totalMainTasks: 0,
                totalChildTasks: 0,
                totalContentTasks: 0,
                totalImageTasks: 0,
                previewRevision: undefined,
              }))}
              onAction={(action, payload, saveFirst) => void scheduleAction(action, payload, saveFirst)}
            /> : <>
              <div className="canvas-schedule-batches">
                {selected.batches.map((batch, index) => <section className="canvas-schedule-batch" key={batch.id}>
                  <header><strong>{index + 1}. {batch.name}</strong><button type="button" onClick={() => removeBatch(batch.id)} disabled={selected.batches.length === 1} aria-label="删除批次" title="删除批次"><Trash2 /></button></header>
                  <div className="canvas-schedule-fields">
                    <label><span>批次名称</span><input value={batch.name} onChange={(event) => patchBatch(batch.id, { name: event.target.value })} /></label>
                    <label><span>Switch 输入</span><select value={batch.strategy} onChange={(event) => patchBatch(batch.id, { strategy: event.target.value as CanvasScheduleBatch["strategy"] })}>
                      <option value="input-1">输入 1</option><option value="input-2">输入 2</option><option value="input-3">输入 3</option>
                    </select></label>
                  </div>
                  <ScheduleAssetFilterEditor key={`${selected.id}:${batch.id}:scene`} title="场景 / 内容素材" role="reference" filter={batch.sceneFilter} count={batch.sceneCount} onCountChange={(sceneCount) => patchBatch(batch.id, { sceneCount })} onChange={(sceneFilter) => patchBatch(batch.id, { sceneFilter })} onPreview={onPreview} />
                  <ScheduleAssetFilterEditor key={`${selected.id}:${batch.id}:vehicle`} title="车型素材" role="vehicle" filter={batch.vehicleFilter} onChange={(vehicleFilter) => patchBatch(batch.id, { vehicleFilter })} onPreview={onPreview} />
                  {batch.copyFilter ? <ScheduleCopyFilterEditor filter={batch.copyFilter} onChange={(copyFilter) => patchBatch(batch.id, { copyFilter })} onDisable={() => patchBatch(batch.id, { copyFilter: undefined })} /> : <button className="canvas-schedule-add" type="button" onClick={() => patchBatch(batch.id, { copyFilter: emptyScheduleCopyFilter() })}><BookOpenText />启用文案池</button>}
                  <div className="canvas-schedule-range"><span>每篇车型图片数</span><label><small>最少</small><input type="number" min={1} max={16} value={batch.vehicleCountMin} onChange={(event) => patchBatch(batch.id, { vehicleCountMin: Number(event.target.value) })} /></label><span>至</span><label><small>最多</small><input type="number" min={1} max={16} value={batch.vehicleCountMax} onChange={(event) => patchBatch(batch.id, { vehicleCountMax: Number(event.target.value) })} /></label></div>
                  {batch.contentTasks.length ? <SchedulePreview batch={batch} busy={busy} onResample={(contentTaskId) => void scheduleAction("resample", { batchId: batch.id, contentTaskId }, false)} /> : null}
                </section>)}
              </div>
              <button className="canvas-schedule-add" type="button" onClick={addBatch} disabled={selected.batches.length >= 20}><Plus />添加批次</button>
              <div className="canvas-schedule-primary-actions">
                <button type="button" onClick={() => void scheduleAction("preflight", {}, true)} disabled={busy || bindingBusy || !bindingsSaved}><RefreshCw />预演抽样</button>
                {selected.status === "ready" && selected.previewRevision ? <button type="button" onClick={() => void scheduleAction("launch", { previewRevision: selected.previewRevision })} disabled={busy}><Play />确认并启动</button> : null}
              </div>
            </> : selected.schemaVersion === 2
              ? <ScheduleV2RuntimeTree schedule={selected} busy={busy} onAction={(action, payload) => void scheduleAction(action, payload)} />
              : <ScheduleRuntimeTree schedule={selected} busy={busy} onAction={(action, payload) => void scheduleAction(action, payload)} />}
          </>}
        </section>
      </div>
    </aside>
  </div>;
}

function CanvasScheduleV2Editor({ schedule, graph, busy, onDefinitionChange, onAction, onPreview }: {
  schedule: CanvasSchedule;
  graph: CanvasGraph;
  busy: boolean;
  onDefinitionChange: (definition: CanvasScheduleV2Definition) => void;
  onAction: (action: string, payload?: Record<string, unknown>, saveFirst?: boolean) => void;
  onPreview: (preview: Extract<NonNullable<PreviewState>, { kind: "image" }>) => void;
}) {
  const definition = schedule.definition;
  if (!definition) return <div className="canvas-task-empty"><AlertTriangle /><span>灵活调度定义缺失</span></div>;
  const childOutputs = graph.nodes.flatMap((node) => {
    const nodeDefinition = getCanvasNodeDefinition(node.type, node.version);
    return (nodeDefinition?.outputs || []).filter((port) => ["text", "images", "videos"].includes(port.kind)).map((port) => ({
      node,
      port,
      label: `${canvasNodeDisplayName(node)} · ${port.label} · ${node.id.slice(-4)}`,
    }));
  });
  const sharedOutputCandidates = canvasScheduleSharedOutputCandidates(graph, definition);
  const sharedOutputs = definition.sharedOutputs || [];
  const sharedOutputCandidateKinds = new Map(sharedOutputCandidates.map((candidate) => [`${candidate.node.id}:${candidate.port.id}`, candidate.artifactKind]));
  const isValidSharedOutput = (output: CanvasScheduleV2SharedOutput) =>
    sharedOutputCandidateKinds.get(`${output.nodeId}:${output.outputPort}`) === output.artifactKind;
  const invalidSharedOutputs = sharedOutputs.filter((output) => !isValidSharedOutput(output));
  const mainTargets = graph.nodes.filter((node) => node.type !== "publish.feishu");
  const patchDefinition = (patch: Partial<CanvasScheduleV2Definition>) => onDefinitionChange({ ...definition, ...patch });
  const patchParameter = (parameterId: string, updater: (parameter: CanvasScheduleParameter) => CanvasScheduleParameter) => {
    patchDefinition({ parameters: definition.parameters.map((parameter) => parameter.id === parameterId ? updater(parameter) : parameter) });
  };
  const addParameter = (scope: "main" | "child") => {
    const first = firstCanvasBatchBinding(graph);
    if (!first) return;
    const valueType = first.field.parameterTypes[0];
    const source = defaultCanvasScheduleParameterSource(valueType, first.node.id);
    if (scope === "main" && source.mode === "library-filter") source.filter.mode = "manual";
    patchDefinition({ parameters: [...definition.parameters, {
      id: nextCanvasScheduleParameterId(),
      name: scope === "main" ? `主任务参数 ${definition.parameters.filter((parameter) => parameter.scope === scope).length + 1}` : `子任务参数 ${definition.parameters.filter((parameter) => parameter.scope === scope).length + 1}`,
      scope,
      valueType,
      source,
      expansion: valueType === "video" || scope === "child" ? "each" : "fixed",
      binding: { nodeId: first.node.id, fieldKey: first.field.key },
    }] });
  };
  const applyPeopleSceneVehiclePreset = () => {
    const imageInputs = graph.nodes.filter((node) => getCanvasBatchBindableFields(node).some((field) => field.parameterTypes.includes("image")));
    if (imageInputs.length < 3) return;
    const names = ["人物参考图", "场景参考图", "车辆角度图"];
    const parameters = imageInputs.slice(0, 3).map((node, index): CanvasScheduleParameter => ({
      id: nextCanvasScheduleParameterId(),
      name: names[index],
      scope: index === 2 ? "child" : "main",
      valueType: "image",
      source: { mode: "library-filter", role: index === 2 ? "vehicle" : "reference", filter: { ...emptyScheduleFilter(), mode: "manual" } },
      expansion: index === 2 ? "each" : "fixed",
      binding: { nodeId: node.id, fieldKey: getCanvasBatchBindableFields(node).find((field) => field.parameterTypes.includes("image"))!.key },
    }));
    patchDefinition({ parameters, expansion: { main: "cartesian", child: "cartesian" }, aggregationPolicy: "at-least-one" });
  };
  const sourceVideoNode = graph.nodes.find((node) => getCanvasBatchBindableFields(node).some((field) => field.parameterTypes.includes("source-video")));
  const promptNode = graph.nodes.find((node) => node.type === "input.text");
  const reconstructNode = graph.nodes.find((node) => node.type === "utility.video-reconstruct");
  const applyVideoReconstructPreset = () => {
    if (!sourceVideoNode || !promptNode || !reconstructNode) return;
    const sourceField = getCanvasBatchBindableFields(sourceVideoNode).find((field) => field.parameterTypes.includes("source-video"));
    const promptField = getCanvasBatchBindableFields(promptNode).find((field) => field.parameterTypes.includes("text"));
    if (!sourceField || !promptField) return;
    const parameters: CanvasScheduleParameter[] = [
      {
        id: nextCanvasScheduleParameterId(), name: "源视频", scope: "main", valueType: "source-video",
        source: { mode: "source-video-links", links: [], projectName: "视频内容重构" }, expansion: "each",
        binding: { nodeId: sourceVideoNode.id, fieldKey: sourceField.key },
      },
      {
        id: nextCanvasScheduleParameterId(), name: "画面提示词", scope: "main", valueType: "text",
        source: { mode: "manual-list", values: [""] }, expansion: "each",
        binding: { nodeId: promptNode.id, fieldKey: promptField.key },
      },
    ];
    patchDefinition({
      parameters,
      expansion: { main: "zip", child: "cartesian" },
      childResult: { nodeId: reconstructNode.id, outputPort: "videos", artifactKind: "videos" },
      aggregationPolicy: "all",
    });
  };
  return <div className="canvas-schedule-v2">
    <section className="canvas-scheduler-bindings">
      <header><span><strong>执行节点</strong><small>子任务输出会在主任务阶段替换为冻结结果</small></span><button type="button" disabled={!sourceVideoNode || !promptNode || !reconstructNode} onClick={applyVideoReconstructPreset}><Video />视频重构预设</button><button type="button" disabled={graph.nodes.filter((node) => getCanvasBatchBindableFields(node).some((field) => field.parameterTypes.includes("image"))).length < 3} onClick={applyPeopleSceneVehiclePreset}><Images />人物场景预设</button></header>
      <div>
        <label><span>子任务结果</span><select value={`${definition.childResult.nodeId}::${definition.childResult.outputPort}`} onChange={(event) => {
          const output = childOutputs.find((candidate) => `${candidate.node.id}::${candidate.port.id}` === event.target.value);
          if (output && ["text", "images", "videos"].includes(output.port.kind)) patchDefinition({ childResult: { nodeId: output.node.id, outputPort: output.port.id, artifactKind: output.port.kind as "text" | "images" | "videos" } });
        }}><option value="::">未选择</option>{childOutputs.map((output) => <option key={`${output.node.id}-${output.port.id}`} value={`${output.node.id}::${output.port.id}`}>{output.label}</option>)}</select></label>
        <label><span>主任务目标（可选）</span><select value={definition.mainTargetNodeId || ""} onChange={(event) => patchDefinition({ mainTargetNodeId: event.target.value || undefined })}><option value="">仅汇总子任务结果</option>{mainTargets.map((node) => <option key={node.id} value={node.id}>{canvasNodeOptionLabel(node)}</option>)}</select></label>
        <label><span>失败聚合</span><select value={definition.aggregationPolicy} onChange={(event) => patchDefinition({ aggregationPolicy: event.target.value as CanvasScheduleV2Definition["aggregationPolicy"] })}><option value="at-least-one">至少一个成功</option><option value="all">必须全部成功</option></select></label>
      </div>
      <div className="canvas-schedule-shared-outputs">
        <header><span><strong>主任务共享输出</strong><small>{invalidSharedOutputs.length ? `${invalidSharedOutputs.length} 项选择已失效，请移除后预演` : sharedOutputs.length ? `已选择 ${sharedOutputs.length} 项 · 每个主任务执行一次` : "未启用时保持现有子任务执行方式"}</small></span>{invalidSharedOutputs.length ? <button type="button" onClick={() => patchDefinition({ sharedOutputs: sharedOutputs.filter(isValidSharedOutput) })}><Trash2 />移除失效项</button> : <Share2 />}</header>
        {sharedOutputCandidates.length ? <div role="group" aria-label="主任务共享输出">
          {sharedOutputCandidates.map((candidate) => {
            const selected = sharedOutputs.some((output) => output.nodeId === candidate.node.id && output.outputPort === candidate.port.id);
            return <label key={`${candidate.node.id}-${candidate.port.id}`} className={selected ? "is-selected" : ""}>
              <input type="checkbox" checked={selected} onChange={(event) => patchDefinition({
                sharedOutputs: event.target.checked
                  ? [...sharedOutputs, { nodeId: candidate.node.id, outputPort: candidate.port.id, artifactKind: candidate.artifactKind }]
                  : sharedOutputs.filter((output) => output.nodeId !== candidate.node.id || output.outputPort !== candidate.port.id),
              })} />
              <span><strong>{canvasNodeDisplayName(candidate.node)}</strong><small>{candidate.port.label} · {portKindLabel(candidate.port.kind)} · 每个主任务 1 次</small></span>
              <CheckCircle2 />
            </label>;
          })}
        </div> : <p>当前画布没有可共享的严格上游单输出节点。</p>}
      </div>
    </section>
    {(["main", "child"] as const).map((scope) => <section className="canvas-schedule-parameter-section" key={scope}>
      <header><span><strong>{scope === "main" ? "主任务参数" : "子任务参数"}</strong><small>{definition.parameters.filter((parameter) => parameter.scope === scope).length} 个参数</small></span><label><span>组合</span><select value={definition.expansion[scope]} onChange={(event) => patchDefinition({ expansion: { ...definition.expansion, [scope]: event.target.value as "cartesian" | "zip" } })}><option value="cartesian">笛卡尔积</option><option value="zip">按序配对</option></select></label><button className="canvas-schedule-add" type="button" onClick={() => addParameter(scope)}><Plus />添加参数</button></header>
      <div>{definition.parameters.filter((parameter) => parameter.scope === scope).map((parameter) => <CanvasScheduleParameterEditor
        key={parameter.id}
        parameter={parameter}
        graph={graph}
        onPreview={onPreview}
        onChange={(next) => patchParameter(parameter.id, () => next)}
        onRemove={() => patchDefinition({ parameters: definition.parameters.filter((candidate) => candidate.id !== parameter.id) })}
      />)}</div>
      {!definition.parameters.some((parameter) => parameter.scope === scope) ? <div className="canvas-task-empty"><Plus /><span>添加一个{scope === "main" ? "主任务" : "子任务"}参数</span></div> : null}
    </section>)}
    {schedule.mainTasks?.length ? <ScheduleV2Preview schedule={schedule} onPreview={onPreview} /> : null}
    <div className="canvas-schedule-primary-actions">
      <button type="button" onClick={() => onAction("preflight", {}, true)} disabled={busy}><RefreshCw />预演展开</button>
      {schedule.status === "ready" && schedule.previewRevision ? <button type="button" onClick={() => onAction("launch", { previewRevision: schedule.previewRevision })} disabled={busy}><Play />确认并启动</button> : null}
    </div>
  </div>;
}

function CanvasScheduleParameterEditor({ parameter, graph, onChange, onRemove, onPreview }: {
  parameter: CanvasScheduleParameter;
  graph: CanvasGraph;
  onChange: (parameter: CanvasScheduleParameter) => void;
  onRemove: () => void;
  onPreview: (preview: Extract<NonNullable<PreviewState>, { kind: "image" }>) => void;
}) {
  const bindingOptions = canvasBatchBindingOptions(graph, parameter.valueType);
  const sampleCount = canvasScheduleParameterSampleCount(parameter);
  const updateType = (valueType: CanvasScheduleParameterType) => {
    const binding = canvasBatchBindingOptions(graph, valueType)[0];
    let source = defaultCanvasScheduleParameterSource(valueType, binding?.node.id);
    if (source.mode === "fixed" && parameter.expansion !== "fixed") source = { mode: "manual-list", values: source.values };
    if ((valueType === "image" || valueType === "image-group") && parameter.expansion === "fixed" && source.mode === "library-filter") source.filter.mode = "manual";
    onChange({
      ...parameter,
      valueType,
      source,
      expansion: valueType === "video" ? "each" : parameter.expansion,
      binding: binding ? { nodeId: binding.node.id, fieldKey: binding.field.key } : { nodeId: "", fieldKey: "" },
    });
  };
  const updateExpansion = (expansion: CanvasScheduleParameter["expansion"]) => {
    const source = parameter.source;
    if (source.mode === "fixed" || source.mode === "manual-list") {
      const values = expansion === "fixed" ? source.values.slice(0, 1) : source.values;
      onChange({
        ...parameter,
        expansion,
        sampleCount: expansion === "random" ? sampleCount : undefined,
        randomCount: undefined,
        source: {
          mode: expansion === "fixed" ? "fixed" : "manual-list",
          values: values.length ? values : [defaultCanvasScheduleScalarValue(parameter.valueType)],
        },
      });
      return;
    }
    onChange({ ...parameter, expansion, sampleCount: expansion === "random" ? sampleCount : undefined, randomCount: undefined });
  };
  return <article className="canvas-schedule-parameter">
    <header><input maxLength={80} value={parameter.name} onChange={(event) => onChange({ ...parameter, name: event.target.value })} aria-label="参数名称" /><button type="button" onClick={onRemove} aria-label="删除参数" title="删除参数"><Trash2 /></button></header>
    <div className="canvas-schedule-parameter-grid">
      <label><span>类型</span><select value={parameter.valueType} onChange={(event) => updateType(event.target.value as CanvasScheduleParameterType)}>{canvasScheduleParameterTypes.map((type) => <option key={type} value={type}>{canvasScheduleParameterTypeLabel(type)}</option>)}</select></label>
      <label><span>展开</span><select value={parameter.expansion} onChange={(event) => updateExpansion(event.target.value as CanvasScheduleParameter["expansion"])}><option value="fixed">固定共享</option><option value="each">全量逐项</option><option value="random">随机抽取</option></select></label>
      <label><span>绑定字段</span><select value={`${parameter.binding.nodeId}::${parameter.binding.fieldKey}`} onChange={(event) => {
        const option = bindingOptions.find((candidate) => `${candidate.node.id}::${candidate.field.key}` === event.target.value);
        if (option) onChange({
          ...parameter,
          binding: { nodeId: option.node.id, fieldKey: option.field.key },
          source: parameter.valueType === "video" ? { mode: "video-loader-queue", nodeId: option.node.id } : parameter.source,
        });
      }}><option value="::">未选择</option>{bindingOptions.map((option) => <option key={`${option.node.id}-${option.field.key}`} value={`${option.node.id}::${option.field.key}`}>{option.label}</option>)}</select></label>
    </div>
    {parameter.expansion === "random" ? <CanvasScheduleSampleCountEditor parameter={parameter} sampleCount={sampleCount} onChange={onChange} /> : null}
    <CanvasScheduleParameterSourceEditor parameter={parameter} graph={graph} onChange={onChange} onPreview={onPreview} />
  </article>;
}

function CanvasScheduleSampleCountEditor({ parameter, sampleCount, onChange }: {
  parameter: CanvasScheduleParameter;
  sampleCount: CanvasScheduleSampleCount;
  onChange: (parameter: CanvasScheduleParameter) => void;
}) {
  const setSampleCount = (next: CanvasScheduleSampleCount) => onChange({ ...parameter, sampleCount: next, randomCount: undefined });
  const exactValue = sampleCount.mode === "exact" ? sampleCount.value : sampleCount.min;
  return <div className="canvas-schedule-sample-controls">
    <div className="canvas-schedule-sample-mode"><span>抽取数量</span><div role="group" aria-label="抽取数量模式">
      <button type="button" aria-pressed={sampleCount.mode === "exact"} onClick={() => setSampleCount({ mode: "exact", value: exactValue })}>固定个数</button>
      <button type="button" aria-pressed={sampleCount.mode === "range"} onClick={() => setSampleCount({ mode: "range", min: exactValue, max: exactValue })}>随机范围</button>
    </div></div>
    {sampleCount.mode === "exact"
      ? <label><span>个数</span><input type="number" min={1} step={1} value={sampleCount.value} onChange={(event) => setSampleCount({ mode: "exact", value: positiveCanvasScheduleInteger(event.target.value) })} /></label>
      : <div className="canvas-schedule-sample-range"><label><span>最少</span><input type="number" min={1} step={1} value={sampleCount.min} onChange={(event) => {
        const min = positiveCanvasScheduleInteger(event.target.value);
        setSampleCount({ mode: "range", min, max: Math.max(min, sampleCount.max) });
      }} /></label><label><span>最多</span><input type="number" min={1} step={1} value={sampleCount.max} onChange={(event) => {
        const max = positiveCanvasScheduleInteger(event.target.value);
        setSampleCount({ mode: "range", min: Math.min(sampleCount.min, max), max });
      }} /></label></div>}
    <small>{canvasScheduleSampleCountSummary(parameter.scope, sampleCount)}</small>
  </div>;
}

function CanvasScheduleParameterSourceEditor({ parameter, graph, onChange, onPreview }: { parameter: CanvasScheduleParameter; graph: CanvasGraph; onChange: (parameter: CanvasScheduleParameter) => void; onPreview: (preview: Extract<NonNullable<PreviewState>, { kind: "image" }>) => void }) {
  if (parameter.valueType === "video") {
    const nodeId = parameter.source.mode === "video-loader-queue" ? parameter.source.nodeId : parameter.binding.nodeId;
    const node = graph.nodes.find((candidate) => candidate.id === nodeId && candidate.type === "input.video-loader");
    const count = node ? canvasVideoSnapshotsFromConfig(node.config).length : 0;
    return <div className="canvas-schedule-parameter-source canvas-schedule-video-source">
      <FileVideo2 />
      <span><strong>{node ? canvasNodeDisplayName(node) : "视频加载节点未绑定"}</strong><small>{node ? `预演时按当前顺序冻结 ${count} 个视频` : "请选择兼容的视频队列字段"}</small></span>
    </div>;
  }
  if (parameter.valueType === "source-video") {
    const source = parameter.source.mode === "source-video-links"
      ? parameter.source
      : defaultCanvasScheduleParameterSource("source-video") as Extract<CanvasScheduleParameterSource, { mode: "source-video-links" }>;
    return <div className="canvas-schedule-parameter-source canvas-schedule-parameter-values">
      <label><span>内容池项目</span><input value={source.projectName} maxLength={80} onChange={(event) => onChange({ ...parameter, source: { ...source, projectName: event.target.value } })} /></label>
      <label><span>源链接（每行一个，最多 200 条）</span><textarea value={source.links.join("\n")} onChange={(event) => onChange({ ...parameter, expansion: "each", source: { ...source, links: event.target.value.split(/\r?\n/).map((link) => link.trim()).filter(Boolean).slice(0, 200) } })} /></label>
    </div>;
  }
  if (parameter.valueType === "image" || parameter.valueType === "image-group") {
    const source = parameter.source.mode === "library-filter" ? parameter.source : defaultCanvasScheduleParameterSource(parameter.valueType) as Extract<CanvasScheduleParameterSource, { mode: "library-filter" }>;
    return <div className="canvas-schedule-parameter-source"><label><span>图库</span><select value={source.role} onChange={(event) => onChange({ ...parameter, source: { ...source, role: event.target.value as "reference" | "vehicle" } })}><option value="reference">参考图库</option><option value="vehicle">车型图库</option></select></label><ScheduleAssetFilterEditor title={parameter.valueType === "image-group" ? "图片组来源" : "图片来源"} role={source.role} filter={source.filter} singleSelection={parameter.valueType === "image" && parameter.expansion === "fixed"} filterMatchLabel onChange={(filter) => onChange({ ...parameter, source: { ...source, filter } })} onPreview={onPreview} /></div>;
  }
  if (parameter.valueType === "copy") {
    const source = parameter.source.mode === "copy-filter" ? parameter.source : defaultCanvasScheduleParameterSource("copy") as Extract<CanvasScheduleParameterSource, { mode: "copy-filter" }>;
    return <ScheduleCopyFilterEditor filter={source.filter} singleSelection={parameter.expansion === "fixed"} filterMatchLabel onChange={(filter) => onChange({ ...parameter, source: { mode: "copy-filter", filter } })} />;
  }
  const source = parameter.source.mode === "fixed" || parameter.source.mode === "manual-list" ? parameter.source : defaultCanvasScheduleParameterSource(parameter.valueType) as Extract<CanvasScheduleParameterSource, { mode: "fixed" | "manual-list" }>;
  const values = source.values.map((value) => String(value)).join("\n");
  return <div className="canvas-schedule-parameter-source canvas-schedule-parameter-values"><label><span>值来源</span><select value={source.mode} onChange={(event) => {
    const mode = event.target.value as "fixed" | "manual-list";
    const nextValues = mode === "fixed" ? source.values.slice(0, 1) : source.values;
    onChange({ ...parameter, expansion: mode === "manual-list" ? "each" : "fixed", sampleCount: undefined, randomCount: undefined, source: { mode, values: nextValues.length ? nextValues : [defaultCanvasScheduleScalarValue(parameter.valueType)] } });
  }}><option value="fixed">固定值</option><option value="manual-list">手工列表</option></select></label><label><span>{source.mode === "fixed" ? "参数值" : "每行一个值"}</span><textarea value={values} onChange={(event) => onChange({ ...parameter, source: { mode: source.mode, values: parseCanvasScheduleScalarValues(parameter.valueType, event.target.value, source.mode) } })} /></label></div>;
}

function ScheduleV2Preview({ schedule, onPreview }: {
  schedule: CanvasSchedule;
  onPreview: (preview: Extract<NonNullable<PreviewState>, { kind: "image" }>) => void;
}) {
  const hasSharedOutputs = Boolean(schedule.definition?.sharedOutputs?.length);
  return <div className="canvas-schedule-preview canvas-schedule-v2-preview"><header><span>展开预览 · {schedule.totalMainTasks || 0} 主任务 · {schedule.totalChildTasks || 0} 子任务</span></header><div>{(schedule.mainTasks || []).map((main, index) => <article key={main.id}><div className="canvas-schedule-v2-main-task"><ScheduleV2PreviewImages values={main.parameterValues} label={`主任务 ${index + 1}`} onPreview={onPreview} /><span><strong>主任务 {index + 1} · {main.childTasks.length} 子任务</strong><small>{formatCanvasScheduleParameterValues(main.parameterValues)}</small></span></div>{hasSharedOutputs ? <CanvasScheduleSharedStage main={main} preview /> : null}<div>{main.childTasks.map((child, childIndex) => <span className="canvas-schedule-v2-child-task" key={child.id}><ScheduleV2PreviewImages values={child.parameterValues} label={`子任务 ${childIndex + 1}`} onPreview={onPreview} /><strong>子任务 {childIndex + 1}</strong><small>{formatCanvasScheduleParameterValues(child.parameterValues)}</small></span>)}</div></article>)}</div></div>;
}

function ScheduleV2PreviewImages({ values, label, onPreview }: {
  values: Record<string, CanvasScheduleParameterValue>;
  label: string;
  onPreview: (preview: Extract<NonNullable<PreviewState>, { kind: "image" }>) => void;
}) {
  const images = canvasScheduleParameterImages(values);
  if (!images.length) return null;
  const sequence = images.map((image) => ({ id: image.id, url: image.url, width: image.width, height: image.height }));
  return <div className="canvas-schedule-v2-preview-images">{images.slice(0, 4).map((image, index) => <button
    type="button"
    key={`${image.id}-${index}`}
    onClick={() => onPreview({ kind: "image", url: image.url, index, width: image.width, height: image.height, sequence })}
    aria-label={`预览${label}图片 ${index + 1}：${image.name || image.id}`}
    title="预览图片"
  >
    <Image src={image.url} alt={image.name || ""} width={72} height={52} unoptimized referrerPolicy="no-referrer" />
    {index === 3 && images.length > 4 ? <em>+{images.length - 4}</em> : null}
  </button>)}</div>;
}

function ScheduleV2RuntimeTree({ schedule, busy, onAction }: { schedule: CanvasSchedule; busy: boolean; onAction: (action: string, payload?: Record<string, unknown>) => void }) {
  const mainTasks = schedule.mainTasks || [];
  const completed = mainTasks.filter((main) => ["completed", "partial"].includes(main.status)).length;
  return <div className="canvas-schedule-runtime">
    <div className="canvas-schedule-runtime-actions">
      {["queued", "running"].includes(schedule.status) ? <button type="button" onClick={() => onAction("pause")} disabled={busy}><Square />暂停</button> : null}
      {schedule.status === "paused" ? <button type="button" onClick={() => onAction("resume")} disabled={busy}><Play />继续</button> : null}
      {["queued", "running", "paused"].includes(schedule.status) ? <button className="danger" type="button" onClick={() => onAction("cancel")} disabled={busy}><X />取消</button> : null}
      <span>{completed}/{mainTasks.length} 主任务完成</span>
    </div>
    {mainTasks.map((main, index) => <details key={main.id} open><summary><StatusIcon status={main.status} /><strong>主任务 {index + 1} · {formatCanvasScheduleParameterValues(main.parameterValues)}</strong><span>{main.childTasks.filter((child) => child.status === "completed").length}/{main.childTasks.length}</span><em>{canvasScheduleStatusLabel(main.status)}</em></summary><div className="canvas-schedule-runtime-content">
      {schedule.definition?.sharedOutputs?.length || main.sharedStatus ? <CanvasScheduleSharedStage main={main} busy={busy} onRetry={() => onAction("retry-shared", { mainTaskId: main.id })} /> : null}
      {main.resultArtifacts.length ? <CanvasScheduleArtifactSummary artifacts={main.resultArtifacts} /> : null}
      {["completed", "partial"].includes(main.status) && main.mainRunId ? <CanvasScheduleMainImageDownload runId={main.mainRunId} /> : null}
      {main.pendingCandidateSync ? <button type="button" onClick={() => onAction("accept-candidates", { mainTaskId: main.id })} disabled={busy}>接受新增候选图</button> : null}
      {main.error ? <p>{main.error}</p> : null}
      <ul>{main.childTasks.map((child, childIndex) => <li key={child.id}><StatusIcon status={child.status} /><span>子任务 {childIndex + 1} · {formatCanvasScheduleParameterValues(child.parameterValues)}</span><em>{canvasScheduleStatusLabel(child.status)}</em>{child.error ? <small>{child.error}</small> : null}{child.status === "failed" ? <button type="button" onClick={() => onAction("retry", { mainTaskId: main.id, childTaskId: child.id })} disabled={busy}><RotateCcw />重试</button> : null}</li>)}</ul>
    </div></details>)}
  </div>;
}

function CanvasScheduleMainImageDownload({ runId }: { runId: string }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [hasFailures, setHasFailures] = useState(false);
  const busyRef = useRef(false);

  async function download() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFeedback("");
    setHasFailures(false);
    try {
      const counts = await downloadCanvasRunSaveImages(runId);
      setHasFailures(counts.failed > 0);
      setFeedback(`下载成功 ${counts.success} 张，下载失败 ${counts.failed} 张`);
    } catch (error) {
      setHasFailures(true);
      setFeedback(errorMessage(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return <div className="canvas-schedule-main-download">
    <button type="button" disabled={busy} onClick={() => void download()}>
      {busy ? <LoaderCircle className="animate-spin" /> : <Download />}
      {busy ? "下载中" : "下载图片"}
    </button>
    {feedback ? <small className={hasFailures ? "is-error" : ""} role="status">{feedback}</small> : null}
  </div>;
}

function CanvasScheduleSharedStage({ main, preview = false, busy = false, onRetry }: {
  main: NonNullable<CanvasSchedule["mainTasks"]>[number];
  preview?: boolean;
  busy?: boolean;
  onRetry?: () => void;
}) {
  const status = main.sharedStatus || "pending";
  const artifacts = main.sharedArtifacts?.map((entry) => entry.artifact) || [];
  const canRetry = !preview && (status === "failed" || status === "partial") && onRetry;
  return <section className={`canvas-schedule-shared-stage is-${status}`} aria-label="主任务共享阶段">
    <header><Share2 /><span><strong>共享阶段</strong><small>{preview ? "每个主任务执行一次" : main.sharedRunId || "等待创建运行"}</small></span><em>{canvasScheduleStatusLabel(status)}</em>{canRetry ? <button type="button" onClick={onRetry} disabled={busy}><RotateCcw />重试共享阶段</button> : null}</header>
    {artifacts.length ? <CanvasScheduleArtifactSummary artifacts={artifacts} /> : null}
    {main.sharedError ? <p><AlertTriangle />{main.sharedError}</p> : null}
  </section>;
}

function CanvasScheduleArtifactSummary({ artifacts }: { artifacts: CanvasArtifact[] }) {
  const images = artifacts.flatMap((artifact) => artifact.kind === "images" ? artifact.items : []);
  const videos = artifacts.flatMap((artifact) => artifact.kind === "videos" ? artifact.items : []);
  const texts = artifacts.flatMap((artifact) => artifact.kind === "text" ? [artifact.value] : []);
  const posts = artifacts.flatMap((artifact) => artifact.kind === "socialPost" ? [artifact] : []);
  return <div className="canvas-schedule-runtime-media">{images.map((item, index) => <Image key={`${item.url}-${index}`} src={item.url} alt="" width={70} height={52} unoptimized referrerPolicy="no-referrer" />)}{videos.map((item, index) => <span key={`${item.url}-${index}`}><Video />视频 {index + 1}</span>)}{texts.map((value, index) => <span key={index}>{value.slice(0, 80)}</span>)}{posts.map((artifact) => <Link key={artifact.postId} href={`/review?postId=${encodeURIComponent(artifact.postId)}`}>打开评审草稿</Link>)}</div>;
}

function ScheduleAssetFilterEditor({ title, role, filter, count, onCountChange, onChange, onPreview, singleSelection = false, filterMatchLabel = false }: {
  title: string;
  role: "reference" | "vehicle";
  filter: CanvasScheduleAssetFilter;
  count?: number;
  onCountChange?: (value: number) => void;
  onChange: (filter: CanvasScheduleAssetFilter) => void;
  onPreview: (preview: Extract<NonNullable<PreviewState>, { kind: "image" }>) => void;
  singleSelection?: boolean;
  filterMatchLabel?: boolean;
}) {
  const [data, setData] = useState<LibraryAssetPage>({ assets: [], collections: [], total: 0 });
  const [searchDraftState, setSearchDraftState] = useState({ source: filter.search, value: filter.search });
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);
  const [selectedAllQuery, setSelectedAllQuery] = useState("");
  const [error, setError] = useState("");
  const requestGenerationRef = useRef(0);
  const pageOperationRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const selectingAllRef = useRef(false);
  const selectionAnchorIdRef = useRef<string | undefined>(undefined);
  const searchCommitTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tagsText = filter.tags.join(", ");
  const queryString = useMemo(() => {
    const params = new URLSearchParams({ role, limit: "24" });
    if (filter.search.trim()) params.set("search", filter.search.trim());
    if (filter.collectionId) params.set("collectionId", filter.collectionId);
    splitScheduleTags(tagsText).forEach((tag) => params.append("tag", tag));
    return params.toString();
  }, [filter.collectionId, filter.search, role, tagsText]);
  const queryStringRef = useRef(queryString);
  const filterRef = useRef(filter);
  const searchDraft = searchDraftState.source === filter.search ? searchDraftState.value : filter.search;

  useLayoutEffect(() => {
    queryStringRef.current = queryString;
    filterRef.current = filter;
  }, [filter, queryString]);

  useEffect(() => () => {
    if (searchCommitTimerRef.current) clearTimeout(searchCommitTimerRef.current);
  }, []);

  const commitSearch = useCallback((value: string) => {
    if (searchCommitTimerRef.current) clearTimeout(searchCommitTimerRef.current);
    searchCommitTimerRef.current = undefined;
    if (value === filterRef.current.search) return;
    onChange({ ...filterRef.current, search: value });
  }, [onChange]);

  const updateSearchDraft = (value: string) => {
    setSearchDraftState({ source: filter.search, value });
    if (searchCommitTimerRef.current) clearTimeout(searchCommitTimerRef.current);
    searchCommitTimerRef.current = setTimeout(() => commitSearch(value), 350);
  };

  useEffect(() => {
    const generation = ++requestGenerationRef.current;
    pageOperationRef.current += 1;
    loadingMoreRef.current = false;
    selectingAllRef.current = false;
    selectionAnchorIdRef.current = undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSelectedAllQuery("");
      setBusy(true);
      setLoadingMore(false);
      setSelectingAll(false);
      setError("");
      void (async () => {
        try {
          const result = await api<LibraryAssetPage>(`/api/library/assets?${queryString}`, { signal: controller.signal });
          if (generation === requestGenerationRef.current && queryString === queryStringRef.current) setData(result);
        } catch (loadError) {
          if (!controller.signal.aborted && generation === requestGenerationRef.current && queryString === queryStringRef.current) setError(errorMessage(loadError));
        } finally {
          if (!controller.signal.aborted && generation === requestGenerationRef.current && queryString === queryStringRef.current) setBusy(false);
        }
      })();
    }, 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
      if (requestGenerationRef.current === generation) requestGenerationRef.current += 1;
    };
  }, [queryString]);

  const loadMore = useCallback(async () => {
    const cursor = data.nextCursor;
    if (!cursor || loadingMoreRef.current || selectingAllRef.current) return;
    const generation = requestGenerationRef.current;
    const operation = ++pageOperationRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setError("");
    try {
      const result = await api<LibraryAssetPage>(`/api/library/assets?${queryString}&cursor=${encodeURIComponent(cursor)}`);
      if (generation !== requestGenerationRef.current || queryString !== queryStringRef.current) return;
      if (result.nextCursor === cursor) throw new Error("图库分页游标重复，无法继续加载");
      setData((current) => {
        if (current.nextCursor !== cursor) return current;
        const knownIds = new Set(current.assets.map((asset) => asset.id));
        return { ...result, collections: current.collections.length ? current.collections : result.collections, assets: [...current.assets, ...result.assets.filter((asset) => !knownIds.has(asset.id))] };
      });
    } catch (loadError) {
      if (generation === requestGenerationRef.current && queryString === queryStringRef.current) setError(errorMessage(loadError));
    } finally {
      if (operation === pageOperationRef.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [data.nextCursor, queryString]);

  const selectAllAssets = useCallback(async () => {
    if (busy || loadingMoreRef.current || selectingAllRef.current || !data.assets.length) return;
    selectingAllRef.current = true;
    setSelectingAll(true);
    setError("");
    const generation = requestGenerationRef.current;
    const operation = ++pageOperationRef.current;
    const assetIds = data.assets.map((asset) => asset.id);
    const knownIds = new Set(assetIds);
    const seenCursors = new Set<string>();
    let cursor = data.nextCursor;
    try {
      while (cursor) {
        if (seenCursors.has(cursor)) throw new Error("图库分页游标重复，无法完成全选");
        seenCursors.add(cursor);
        const result = await api<LibraryAssetPage>(`/api/library/assets?${queryString}&cursor=${encodeURIComponent(cursor)}`);
        if (generation !== requestGenerationRef.current || queryString !== queryStringRef.current) return;
        result.assets.forEach((asset) => {
          if (!knownIds.has(asset.id)) {
            knownIds.add(asset.id);
            assetIds.push(asset.id);
          }
        });
        cursor = result.nextCursor;
      }
      const latestFilter = filterRef.current;
      if (generation !== requestGenerationRef.current || queryString !== queryStringRef.current || latestFilter.mode !== "manual") return;
      onChange({ ...latestFilter, assetIds });
      setSelectedAllQuery(queryString);
    } catch (selectError) {
      if (generation === requestGenerationRef.current && queryString === queryStringRef.current) setError(errorMessage(selectError));
    } finally {
      if (operation === pageOperationRef.current) {
        selectingAllRef.current = false;
        setSelectingAll(false);
      }
    }
  }, [busy, data.assets, data.nextCursor, onChange, queryString]);

  const toggle = (assetId: string, event: React.MouseEvent<HTMLButtonElement>) => {
    if (filter.mode !== "manual" || busy) return;
    setSelectedAllQuery("");
    if (singleSelection) {
      selectionAnchorIdRef.current = assetId;
      onChange({ ...filter, assetIds: filter.assetIds.includes(assetId) ? [] : [assetId] });
      return;
    }
    const selectedIds = new Set(filter.assetIds);
    if (event.shiftKey) {
      const anchorId = selectionAnchorIdRef.current;
      const next = selectIdRange(data.assets.map((asset) => asset.id), selectedIds, anchorId, assetId, event.ctrlKey || event.metaKey);
      if (!anchorId || !data.assets.some((asset) => asset.id === anchorId)) selectionAnchorIdRef.current = assetId;
      onChange({ ...filter, assetIds: [...next] });
      return;
    }
    selectionAnchorIdRef.current = assetId;
    if (selectedIds.has(assetId)) selectedIds.delete(assetId);
    else selectedIds.add(assetId);
    onChange({ ...filter, assetIds: [...selectedIds] });
  };

  const openPreview = (asset: LibraryAsset, index: number) => onPreview({
    kind: "image",
    url: asset.publicUrl,
    index,
    width: asset.width,
    height: asset.height,
    sequence: data.assets.map((item) => ({ id: item.id, url: item.publicUrl, width: item.width, height: item.height })),
  });
  const allMatchesSelected = data.total > 0 && selectedAllQuery === queryString;
  const status = busy
    ? "正在筛选"
    : selectingAll
      ? "正在全选匹配图片"
      : loadingMore
        ? `正在加载更多 · 已加载 ${data.assets.length} 张`
        : `已加载 ${data.assets.length} / 匹配 ${data.total} 张${filter.mode === "manual" ? ` · 已选 ${filter.assetIds.length} 张` : ""}`;

  return <div className="canvas-schedule-assets">
    <div className="canvas-schedule-assets-head"><strong>{title}</strong><div className="canvas-task-filters"><button type="button" aria-pressed={filter.mode === "manual"} onClick={() => onChange({ ...filter, mode: "manual" })}>手动选择</button><button type="button" aria-pressed={filter.mode === "random"} onClick={() => onChange({ ...filter, mode: "random" })}>{filterMatchLabel ? "条件匹配" : "条件随机"}</button></div></div>
    <div className="canvas-schedule-filter-row">
      <label><Search /><input value={searchDraft} onChange={(event) => updateSearchDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitSearch(searchDraft); } }} placeholder="关键字" /></label>
      <select value={filter.collectionId || ""} onChange={(event) => onChange({ ...filter, collectionId: event.target.value || undefined })}><option value="">全部集合</option>{data.collections.map((collection) => <option value={collection.id} key={collection.id}>{collection.name}</option>)}</select>
      <input value={tagsText} onChange={(event) => onChange({ ...filter, tags: splitScheduleTags(event.target.value) })} placeholder="多个标签，AND" />
      {count !== undefined && filter.mode === "random" ? <label className="canvas-schedule-count"><span>抽取</span><input type="number" min={1} max={500} value={count} onChange={(event) => onCountChange?.(Number(event.target.value))} /></label> : null}
    </div>
    <div className="canvas-schedule-asset-toolbar">
      <small className="canvas-schedule-pool-count" aria-live="polite">{status}</small>
      {filter.mode === "manual" && !singleSelection ? <div>
        <button type="button" onClick={() => void selectAllAssets()} disabled={busy || loadingMore || selectingAll || !data.assets.length || allMatchesSelected}><CheckCircle2 />{selectingAll ? "全选中..." : allMatchesSelected ? "已全选" : "全选当前筛选结果"}</button>
        <button type="button" onClick={() => { setSelectedAllQuery(""); onChange({ ...filter, assetIds: [] }); }} disabled={selectingAll || !filter.assetIds.length}><X />清空已选</button>
      </div> : null}
    </div>
    <div className={`canvas-schedule-asset-results ${busy ? "is-loading" : ""}`} aria-busy={busy}>
      {busy && !data.assets.length ? <div className="canvas-schedule-asset-state"><LoaderCircle className="animate-spin" />正在载入图片</div> : null}
      {!busy && !error && !data.assets.length ? <div className="canvas-schedule-asset-state"><Images />当前筛选没有图片</div> : null}
      {data.assets.length ? <div className="canvas-schedule-asset-grid">{data.assets.map((asset, index) => <article key={asset.id} className={filter.assetIds.includes(asset.id) ? "is-selected" : ""}>
        <button className="canvas-schedule-asset-select" type="button" onClick={(event) => toggle(asset.id, event)} disabled={filter.mode !== "manual" || selectingAll || busy} title={filter.mode === "manual" ? asset.name : undefined} aria-label={`${filter.assetIds.includes(asset.id) ? "取消选择" : "选择"} ${asset.name}`}>
          <ScheduleAssetThumbnail asset={asset} /><span>{asset.name}</span>{filter.mode === "manual" && filter.assetIds.includes(asset.id) ? <CheckCircle2 className="canvas-schedule-asset-selected-mark" /> : null}
        </button>
        <button className="canvas-schedule-asset-preview" type="button" disabled={busy} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); openPreview(asset, index); }} aria-label={`预览 ${asset.name}`} title="预览图片"><Eye /></button>
      </article>)}</div> : null}
      {data.nextCursor ? <div className="canvas-schedule-asset-load-more"><button type="button" onClick={() => void loadMore()} disabled={busy || loadingMore || selectingAll}>{loadingMore ? <LoaderCircle className="animate-spin" /> : <ArrowDown />}{loadingMore ? "正在加载下一页..." : "加载更多"}</button></div> : null}
    </div>
    {error ? <p className="canvas-picker-error">{error}</p> : null}
  </div>;
}

function ScheduleAssetThumbnail({ asset }: { asset: LibraryAsset }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  return <span className={`canvas-schedule-asset-thumbnail is-${state}`}>
    {state === "loading" ? <LoaderCircle className="animate-spin" /> : null}
    {state === "error" ? <ImageOff /> : null}
    <Image
      src={`/api/library/assets/${encodeURIComponent(asset.id)}/thumbnail`}
      alt=""
      width={240}
      height={144}
      unoptimized
      loading="lazy"
      onLoad={() => setState("ready")}
      onError={() => setState("error")}
    />
  </span>;
}

function ScheduleCopyFilterEditor({ filter, onChange, onDisable, singleSelection = false, filterMatchLabel = false }: {
  filter: CanvasScheduleCopyFilter;
  onChange: (filter: CanvasScheduleCopyFilter) => void;
  onDisable?: () => void;
  singleSelection?: boolean;
  filterMatchLabel?: boolean;
}) {
  const [data, setData] = useState<CanvasCopyLibraryResponse>({ entries: [], tags: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tagsText = filter.tags.join(", ");
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const params = new URLSearchParams();
        if (filter.search.trim()) params.set("q", filter.search.trim());
        if (filter.mode === "tags") splitScheduleTags(tagsText).forEach((tagValue) => params.append("tag", tagValue));
        const response = await fetch(`/api/copy-library${params.size ? `?${params}` : ""}`, { signal: controller.signal });
        const result = (await response.json()) as CanvasCopyLibraryResponse & { error?: string };
        if (!response.ok) throw new Error(result.error || "文案池加载失败");
        setData(result);
        setError("");
      } catch (loadError) {
        if (!controller.signal.aborted) setError(errorMessage(loadError));
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [filter.mode, filter.search, tagsText]);
  const toggle = (entryId: string) => onChange({
    ...filter,
    entryIds: filter.entryIds.includes(entryId) ? filter.entryIds.filter((id) => id !== entryId) : singleSelection ? [entryId] : [...filter.entryIds, entryId],
  });
  const allMatchesSelected = data.entries.length > 0 && data.entries.every((entry) => filter.entryIds.includes(entry.id));
  const selectAllEntries = () => {
    if (filter.mode !== "manual" || singleSelection || !data.entries.length) return;
    onChange({ ...filter, entryIds: data.entries.map((entry) => entry.id) });
  };
  const clearSelectedEntries = () => {
    if (singleSelection || !filter.entryIds.length) return;
    onChange({ ...filter, entryIds: [] });
  };
  return <div className="canvas-schedule-assets canvas-schedule-copy-pool">
    <div className="canvas-schedule-assets-head"><strong>文案池</strong><div className="canvas-task-filters"><button type="button" aria-pressed={filter.mode === "manual"} onClick={() => onChange({ ...filter, mode: "manual" })}>手动选择</button><button type="button" aria-pressed={filter.mode === "tags"} onClick={() => onChange({ ...filter, mode: "tags" })}>{filterMatchLabel ? "条件匹配" : "条件随机"}</button>{onDisable ? <button type="button" onClick={onDisable}>停用</button> : null}</div></div>
    <div className="canvas-schedule-filter-row">
      <label><Search /><input value={filter.search} onChange={(event) => onChange({ ...filter, search: event.target.value })} placeholder="搜索文案" /></label>
      <input value={tagsText} disabled={filter.mode !== "tags"} onChange={(event) => onChange({ ...filter, tags: splitScheduleTags(event.target.value) })} placeholder="多个标签，AND" />
    </div>
    <div className="canvas-schedule-asset-toolbar">
      <small className="canvas-schedule-pool-count" aria-live="polite">{busy ? "正在筛选" : filter.mode === "manual" ? `匹配 ${data.entries.length} 篇 · 已选 ${filter.entryIds.length} 篇 · 批次内随机去重` : `条件匹配 ${data.entries.length} 篇 · 批次内随机去重`}</small>
      {filter.mode === "manual" && !singleSelection ? <div>
        <button type="button" onClick={selectAllEntries} disabled={busy || !data.entries.length || allMatchesSelected}><CheckCircle2 />{allMatchesSelected ? "已全选" : "全选当前筛选结果"}</button>
        <button type="button" onClick={clearSelectedEntries} disabled={busy || !filter.entryIds.length}><X />清空已选</button>
      </div> : null}
    </div>
    <div className="canvas-schedule-copy-list">{data.entries.slice(0, 50).map((entry) => <button type="button" key={entry.id} className={filter.entryIds.includes(entry.id) ? "is-selected" : ""} onClick={() => filter.mode === "manual" && toggle(entry.id)} disabled={filter.mode === "tags"}>
      <BookOpenText /><span><strong>{entry.title}</strong><small>{entry.tags.join(" · ") || "无标签"}</small></span>{filter.mode === "manual" && filter.entryIds.includes(entry.id) ? <CheckCircle2 /> : null}
    </button>)}</div>
    {error ? <p className="canvas-picker-error">{error}</p> : null}
  </div>;
}

function SchedulePreview({ batch, busy, onResample }: { batch: CanvasScheduleBatch; busy: boolean; onResample: (contentTaskId?: string) => void }) {
  return <div className="canvas-schedule-preview">
    <header><span>抽样预览 · {batch.contentTasks.length} 篇</span><button type="button" onClick={() => onResample()} disabled={busy}><RefreshCw />重抽本批次</button></header>
    <div>{batch.contentTasks.map((task, index) => <article key={task.id}>
      <div><Image src={task.scene.url} alt="" width={96} height={68} unoptimized referrerPolicy="no-referrer" /><span><strong>图文 {index + 1}</strong><small>{task.scene.name || task.scene.id}{task.copy ? ` · 文案：${task.copy.title}` : ""}</small></span><button type="button" onClick={() => onResample(task.id)} disabled={busy} aria-label="重抽本篇车型素材" title="重抽本篇"><RefreshCw /></button></div>
      <div>{task.vehicles.map((vehicle) => <Image key={vehicle.id} src={vehicle.url} alt="" width={58} height={44} unoptimized referrerPolicy="no-referrer" />)}</div>
    </article>)}</div>
  </div>;
}

function ScheduleRuntimeTree({ schedule, busy, onAction }: { schedule: CanvasSchedule; busy: boolean; onAction: (action: string, payload?: Record<string, unknown>) => void }) {
  const completed = schedule.batches.flatMap((batch) => batch.contentTasks).filter((task) => ["completed", "partial"].includes(task.status)).length;
  return <div className="canvas-schedule-runtime">
    <div className="canvas-schedule-runtime-actions">
      {["queued", "running"].includes(schedule.status) ? <button type="button" onClick={() => onAction("pause")} disabled={busy}><Square />暂停</button> : null}
      {schedule.status === "paused" ? <button type="button" onClick={() => onAction("resume")} disabled={busy}><Play />继续</button> : null}
      {["queued", "running", "paused"].includes(schedule.status) ? <button className="danger" type="button" onClick={() => onAction("cancel")} disabled={busy}><X />取消</button> : null}
      <button type="button" onClick={() => onAction("duplicate")} disabled={busy}><CopyPlus />复制重跑</button>
      <span>{completed}/{schedule.totalContentTasks} 篇完成</span>
    </div>
    {schedule.batches.map((batch) => <details key={batch.id} open>
      <summary><StatusIcon status={batch.status} /><strong>{batch.name}</strong><span>{batch.contentTasks.filter((task) => ["completed", "partial"].includes(task.status)).length}/{batch.contentTasks.length}</span><em>{canvasScheduleStatusLabel(batch.status)}</em></summary>
      <div>{batch.contentTasks.map((content, index) => <details key={content.id} className={`is-${content.status}`}>
        <summary><StatusIcon status={content.status} /><strong>图文 {index + 1}</strong><span>{content.candidateImageUrls.length}/{content.imageTasks.length} 图</span><em>{canvasScheduleStatusLabel(content.status)}</em></summary>
        <div className="canvas-schedule-runtime-content">
          <div className="canvas-schedule-runtime-media"><Image src={content.scene.url} alt="" width={90} height={64} unoptimized referrerPolicy="no-referrer" />{content.candidateImageUrls.map((url) => <Image key={url} src={url} alt="" width={70} height={52} unoptimized referrerPolicy="no-referrer" />)}</div>
          {content.generatedPostId ? <Link href={`/review?postId=${encodeURIComponent(content.generatedPostId)}`}>打开评审草稿</Link> : null}
          {content.pendingCandidateSync ? <button type="button" onClick={() => onAction("accept-candidates", { batchId: batch.id, contentTaskId: content.id })} disabled={busy}>接受新增候选图</button> : null}
          {content.error ? <p>{content.error}</p> : null}
          <ul>{content.imageTasks.map((task, taskIndex) => <li key={task.id}><StatusIcon status={task.status} /><span>图片 {taskIndex + 1} · {task.vehicle.name || task.vehicle.id}</span><em>{canvasScheduleStatusLabel(task.status)}</em>{task.error ? <small>{task.error}</small> : null}{task.status === "failed" ? <button type="button" onClick={() => onAction("retry", { batchId: batch.id, contentTaskId: content.id, imageTaskId: task.id })} disabled={busy}><RotateCcw />重试</button> : null}</li>)}</ul>
        </div>
      </details>)}</div>
    </details>)}
  </div>;
}

function CanvasTaskCenter({
  runs,
  workflows,
  selectedRun,
  selectedRunId,
  busy,
  error,
  onClose,
  onRefresh,
  onSelect,
  onOpenScheduler,
}: {
  runs: CanvasRun[];
  workflows: CanvasWorkflow[];
  selectedRun?: CanvasRunWithNodes;
  selectedRunId?: string;
  busy: boolean;
  error: string;
  onClose: () => void;
  onRefresh: () => void;
  onSelect: (runId: string) => void;
  onOpenScheduler: () => void;
}) {
  const [filter, setFilter] = useState<CanvasTaskFilter>("all");
  const [query, setQuery] = useState("");
  const workflowNames = useMemo(() => new Map(workflows.map((workflow) => [workflow.id, workflow.name])), [workflows]);
  const matchingRuns = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return runs.filter((run) => {
      const active = isActiveCanvasRun(run.status);
      if (filter === "active" && !active) return false;
      if (filter === "history" && active) return false;
      if (filter === "failed" && !isFailedCanvasRun(run.status)) return false;
      if (!normalizedQuery) return true;
      return [run.id, workflowNames.get(run.workflowId) || run.workflowId, run.status, `r${run.workflowRevision}`]
        .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
    });
  }, [filter, query, runs, workflowNames]);
  const activeRuns = matchingRuns.filter((run) => isActiveCanvasRun(run.status));
  const historicalRuns = matchingRuns.filter((run) => !isActiveCanvasRun(run.status));

  const renderTaskList = (items: CanvasRun[]) => items.map((run) => (
    <button
      className={`canvas-task-row ${selectedRunId === run.id ? "is-selected" : ""}`}
      type="button"
      key={run.id}
      onClick={() => onSelect(run.id)}
      aria-pressed={selectedRunId === run.id}
    >
      <StatusIcon status={run.status} />
      <span><strong>{workflowNames.get(run.workflowId) || "已删除画布"}</strong><small>{formatCanvasRunTime(run.createdAt)} · r{run.workflowRevision}</small></span>
      <em>{canvasRunStatusLabel(run.status)}</em>
    </button>
  ));

  return <div className="canvas-task-center" role="dialog" aria-modal="true" aria-label="Canvas 任务中心">
    <button className="canvas-task-center-backdrop" type="button" onClick={onClose} aria-label="关闭任务中心" />
    <aside className="canvas-task-center-panel">
      <header>
        <div><History /><span><strong>任务中心</strong><small>最近 {runs.length} 次运行</small></span></div>
        <div>
          <button className="canvas-center-tab" type="button" onClick={onOpenScheduler}><ListChecks /><span>批量调度</span></button>
          <button type="button" onClick={onRefresh} disabled={busy} aria-label="刷新任务" title="刷新任务"><RefreshCw className={busy ? "animate-spin" : ""} /></button>
          <button type="button" onClick={onClose} aria-label="关闭任务中心" title="关闭"><X /></button>
        </div>
      </header>
      <div className="canvas-task-center-tools">
        <label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索画布、任务 ID 或版本" /></label>
        <div className="canvas-task-filters" aria-label="任务状态筛选">
          {([['all', '全部'], ['active', '进行中'], ['history', '历史'], ['failed', '异常']] as const).map(([value, label]) => <button type="button" key={value} onClick={() => setFilter(value)} aria-pressed={filter === value}>{label}</button>)}
        </div>
      </div>
      {error ? <div className="canvas-task-error"><AlertTriangle />{error}</div> : null}
      <div className="canvas-task-center-body">
        <nav className="canvas-task-list" aria-label="Canvas 运行任务">
          {activeRuns.length ? <section><h3>进行中 <span>{activeRuns.length}</span></h3>{renderTaskList(activeRuns)}</section> : null}
          {historicalRuns.length ? <section><h3>历史任务 <span>{historicalRuns.length}</span></h3>{renderTaskList(historicalRuns)}</section> : null}
          {!matchingRuns.length && !busy ? <div className="canvas-task-empty"><Search /><span>没有匹配的任务</span></div> : null}
          {busy && !runs.length ? <div className="canvas-task-empty"><LoaderCircle className="animate-spin" /><span>正在载入任务</span></div> : null}
        </nav>
        <section className="canvas-task-detail">
          {selectedRun ? <>
            <div className="canvas-task-detail-head">
              <div><StatusIcon status={selectedRun.run.status} /><span><strong>{workflowNames.get(selectedRun.run.workflowId) || "已删除画布"}</strong><small>{selectedRun.run.id}</small></span></div>
              <em className={`is-${selectedRun.run.status}`}>{canvasRunStatusLabel(selectedRun.run.status)}</em>
            </div>
            <dl className="canvas-task-meta">
              <div><dt>版本</dt><dd>r{selectedRun.run.workflowRevision}</dd></div>
              <div><dt>运行方式</dt><dd>{canvasRunModeLabel(selectedRun.run.runMode)}</dd></div>
              <div><dt>创建时间</dt><dd>{formatCanvasRunTime(selectedRun.run.createdAt)}</dd></div>
              <div><dt>完成时间</dt><dd>{selectedRun.run.completedAt ? formatCanvasRunTime(selectedRun.run.completedAt) : "-"}</dd></div>
            </dl>
            {selectedRun.run.error ? <div className="canvas-task-detail-error"><AlertTriangle />{selectedRun.run.error}</div> : null}
            <RunSummary value={selectedRun} />
          </> : <div className="canvas-task-empty"><History /><span>选择任务查看节点详情</span></div>}
        </section>
      </div>
    </aside>
  </div>;
}

function RunSummary({ value, onRetry }: { value: CanvasRunWithNodes; onRetry?: (nodeId: string) => void }) {
  const latest = latestAttempts(value.nodeRuns);
  return <div className="canvas-run-summary">
    <div className="canvas-run-summary-head"><StatusIcon status={value.run.status} /><strong>{canvasRunStatusLabel(value.run.status)}</strong><span>版本 r{value.run.workflowRevision}</span></div>
    <div className="canvas-run-node-list">{Array.from(latest.values()).map((nodeRun) => <div key={nodeRun.id} className={`canvas-run-node is-${nodeRun.status}`}>
      <span>{getCanvasNodeDefinition(nodeRun.nodeType)?.label || nodeRun.nodeType}</span><small>{canvasNodeRunStatusLabel(nodeRun.status)} · 第 {nodeRun.attempt} 次</small>
      {nodeRun.providerTaskId ? <code>{nodeRun.providerTaskId}</code> : null}
      {nodeRun.reusedFrom ? <small>复用 r{nodeRun.reusedFrom.workflowRevision} · {nodeRun.reusedFrom.nodeRunId}</small> : null}
      {nodeRun.error ? <p>{nodeRun.error}</p> : null}
      {Object.values(nodeRun.outputs).map((artifact, index) => <ArtifactPreview key={index} artifact={artifact} />)}
      {onRetry && ["failed", "blocked", "needs_config", "running"].includes(nodeRun.status) ? <button type="button" onClick={() => onRetry(nodeRun.nodeId)}><RotateCcw />重试</button> : null}
    </div>)}</div>
  </div>;
}

function ArtifactPreview({ artifact }: { artifact: CanvasArtifact }) {
  if (artifact.kind === "text") return <p className="canvas-artifact-text">{artifact.value}</p>;
  if (artifact.kind === "images") return <div className="canvas-artifact-media">{artifact.items.map((item) => <img key={item.url} src={item.url} alt="" referrerPolicy="no-referrer" />)}</div>;
  if (artifact.kind === "videos") return <div className="canvas-artifact-media">{artifact.items.map((item) => <video key={item.url} src={item.url} controls />)}</div>;
  if (artifact.kind === "socialPost") return <Link href={`/review?postId=${encodeURIComponent(artifact.postId)}`}>打开评审：{artifact.post.title}</Link>;
  return <span>飞书任务 {artifact.jobId}</span>;
}

function CanvasTextPreviewDialog({ value, onClose }: { value: string; onClose: () => void }) {
  const [copyLabel, setCopyLabel] = useState("复制");
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  usePreviewDialogLifecycle(closeButtonRef, onClose);
  return <div className="canvas-result-viewer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="canvas-result-viewer canvas-text-viewer" role="dialog" aria-modal="true" aria-labelledby="canvas-text-viewer-title">
      <header>
        <div><FileText /><strong id="canvas-text-viewer-title">完整文本</strong></div>
        <div className="canvas-result-viewer-actions">
          <button type="button" onClick={() => void navigator.clipboard.writeText(value).then(() => setCopyLabel("已复制"), () => setCopyLabel("复制失败"))}><Copy />{copyLabel}</button>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="关闭文本预览" title="关闭"><X /></button>
        </div>
      </header>
      <pre>{value}</pre>
    </section>
  </div>;
}

function CanvasVideoPreviewDialog({ url, index, onClose }: { url: string; index: number; onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  usePreviewDialogLifecycle(closeButtonRef, onClose);
  return <div className="canvas-result-viewer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="canvas-result-viewer canvas-video-viewer" role="dialog" aria-modal="true" aria-labelledby="canvas-video-viewer-title">
      <header>
        <div><Clapperboard /><strong id="canvas-video-viewer-title">视频 {index + 1}</strong></div>
        <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="关闭视频预览" title="关闭"><X /></button>
      </header>
      <div><video src={url} controls playsInline /></div>
    </section>
  </div>;
}

function usePreviewDialogLifecycle(closeButtonRef: React.RefObject<HTMLButtonElement | null>, onClose: () => void) {
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [closeButtonRef, onClose]);
}

const imagePreviewMinZoom = 0.5;
const imagePreviewMaxZoom = 4;
const imagePreviewZoomStep = 0.25;

function CanvasImagePreviewDialog({ preview, onClose }: { preview: Extract<NonNullable<PreviewState>, { kind: "image" }>; onClose: () => void }) {
  const sequence = preview.sequence?.length ? preview.sequence : [{ id: `${preview.url}-${preview.index}`, url: preview.url, width: preview.width, height: preview.height }];
  const [activeIndex, setActiveIndex] = useState(() => Math.min(Math.max(0, preview.index), sequence.length - 1));
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const active = sequence[activeIndex] || sequence[0];

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex((current) => Math.max(0, current - 1));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex((current) => Math.min(sequence.length - 1, current + 1));
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [onClose, sequence.length]);

  return <div className="canvas-image-viewer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="canvas-image-viewer" role="dialog" aria-modal="true" aria-labelledby="canvas-image-viewer-title">
      <CanvasImagePreviewBody key={active.id} item={active} index={preview.sequence?.length ? activeIndex : preview.index} total={preview.sequence?.length ? sequence.length : 1} closeButtonRef={closeButtonRef} onClose={onClose} />
      {sequence.length > 1 ? <>
        <button className="canvas-image-viewer-sequence-button is-previous" type="button" onClick={() => setActiveIndex((current) => current - 1)} disabled={activeIndex === 0} aria-label="上一张图片" title="上一张"><ChevronLeft /></button>
        <button className="canvas-image-viewer-sequence-button is-next" type="button" onClick={() => setActiveIndex((current) => current + 1)} disabled={activeIndex === sequence.length - 1} aria-label="下一张图片" title="下一张"><ChevronRight /></button>
      </> : null}
    </section>
  </div>;
}

function CanvasImagePreviewBody({ item, index, total, closeButtonRef, onClose }: {
  item: { id: string; url: string; width?: number; height?: number };
  index: number;
  total: number;
  closeButtonRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{ pointerId: number; x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  const zoomRef = useRef(1);
  const zoomAnchorRef = useRef<{
    x: number;
    y: number;
    scrollLeft: number;
    scrollTop: number;
    scrollWidth: number;
    scrollHeight: number;
  } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [naturalSize, setNaturalSize] = useState(item.width && item.height ? { width: item.width, height: item.height } : undefined);
  const updateZoom = useCallback((next: number | ((current: number) => number)) => {
    const current = zoomRef.current;
    const value = typeof next === "function" ? next(current) : next;
    const clamped = Math.min(imagePreviewMaxZoom, Math.max(imagePreviewMinZoom, value));
    if (clamped === current) return current;
    zoomRef.current = clamped;
    setZoom(clamped);
    return clamped;
  }, []);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const anchor = zoomAnchorRef.current;
    if (!stage || !anchor) return;
    zoomAnchorRef.current = null;
    stage.scrollLeft = (anchor.scrollLeft + anchor.x) * (stage.scrollWidth / anchor.scrollWidth) - anchor.x;
    stage.scrollTop = (anchor.scrollTop + anchor.y) * (stage.scrollHeight / anchor.scrollHeight) - anchor.y;
  }, [zoom]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const current = zoomRef.current;
      const next = Math.min(imagePreviewMaxZoom, Math.max(
        imagePreviewMinZoom,
        current + (event.deltaY < 0 ? imagePreviewZoomStep : -imagePreviewZoomStep),
      ));
      if (next === current) return;
      const bounds = stage.getBoundingClientRect();
      zoomAnchorRef.current = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
        scrollLeft: stage.scrollLeft,
        scrollTop: stage.scrollTop,
        scrollWidth: stage.scrollWidth,
        scrollHeight: stage.scrollHeight,
      };
      updateZoom(next);
    };
    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => stage.removeEventListener("wheel", handleWheel);
  }, [updateZoom]);

  const zoomPercent = Math.round(zoom * 100);
  const canvasSize = `${Math.max(100, zoomPercent)}%`;
  const imageLimit = `${92 / Math.max(1, zoom)}%`;
  const finishPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId !== event.pointerId) return;
    panRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setIsPanning(false);
  };

  return <>
      <header>
        <div><ImageIcon /><strong id="canvas-image-viewer-title">图片 {index + 1}{total > 1 ? ` / ${total}` : ""}</strong>{naturalSize ? <small>{naturalSize.width}×{naturalSize.height}</small> : null}</div>
        <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="关闭图片预览" title="关闭"><X /></button>
      </header>
      <div
        ref={stageRef}
        className={`canvas-image-viewer-stage${zoom > 1 ? " is-pannable" : ""}${isPanning ? " is-panning" : ""}`}
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse" || event.button !== 0 || zoom <= 1) return;
          panRef.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            scrollLeft: event.currentTarget.scrollLeft,
            scrollTop: event.currentTarget.scrollTop,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          setIsPanning(true);
          event.preventDefault();
        }}
        onPointerMove={(event) => {
          const pan = panRef.current;
          if (!pan || pan.pointerId !== event.pointerId) return;
          event.currentTarget.scrollLeft = pan.scrollLeft - (event.clientX - pan.x);
          event.currentTarget.scrollTop = pan.scrollTop - (event.clientY - pan.y);
        }}
        onPointerUp={finishPan}
        onPointerCancel={finishPan}
        onLostPointerCapture={finishPan}
        onMouseDown={(event) => {
          if (event.button === 1) event.preventDefault();
        }}
      >
        <div className="canvas-image-viewer-canvas" style={{ width: canvasSize, height: canvasSize }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="canvas-image-viewer-image"
            src={item.url}
            alt={`图片 ${index + 1} 预览`}
            width={item.width}
            height={item.height}
            draggable={false}
            referrerPolicy="no-referrer"
            onLoad={(event) => {
              const width = event.currentTarget.naturalWidth;
              const height = event.currentTarget.naturalHeight;
              if (width && height) setNaturalSize({ width, height });
            }}
            style={{ maxWidth: imageLimit, maxHeight: imageLimit, transform: `scale(${zoom})` }}
          />
        </div>
      </div>
      <footer>
        <button type="button" onClick={() => updateZoom((current) => current - imagePreviewZoomStep)} disabled={zoom <= imagePreviewMinZoom} aria-label="缩小图片" title="缩小"><ZoomOut /></button>
        <output aria-live="polite">{zoomPercent}%</output>
        <button type="button" onClick={() => updateZoom((current) => current + imagePreviewZoomStep)} disabled={zoom >= imagePreviewMaxZoom} aria-label="放大图片" title="放大"><ZoomIn /></button>
        <button type="button" onClick={() => updateZoom(1)} disabled={zoom === 1} aria-label="重置图片缩放" title="重置缩放"><RotateCcw /></button>
        <a href={item.url} target="_blank" rel="noreferrer" aria-label="打开原图" title="打开原图"><ExternalLink /></a>
      </footer>
  </>;
}

function ToolbarButton({ label, ariaLabel, icon, onClick, disabled, danger, ariaKeyShortcuts }: { label: string; ariaLabel?: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean; ariaKeyShortcuts?: string }) {
  return <button className={danger ? "danger" : ""} type="button" onClick={onClick} disabled={disabled} title={ariaLabel || label} aria-label={ariaLabel || label} aria-keyshortcuts={ariaKeyShortcuts}>{icon}<span>{label}</span></button>;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 />;
  if (status === "queued" || status === "running") return <LoaderCircle className={status === "running" ? "animate-spin" : ""} />;
  return <AlertTriangle />;
}

function canvasViewportDetail(zoom: number): CanvasViewportDetail {
  if (zoom < canvasViewportDetailZoom.overview) return "overview";
  if (zoom < canvasViewportDetailZoom.reduced) return "reduced";
  return "full";
}
function syncCanvasViewportDetail(stage: HTMLElement | null, zoom: number): CanvasViewportDetail {
  const detail = canvasViewportDetail(zoom);
  if (stage && stage.dataset.canvasViewportDetail !== detail) stage.dataset.canvasViewportDetail = detail;
  return detail;
}

function toFlowNodes(nodes: CanvasNode[], compact = false) { return nodes.map((node) => toFlowNode(node, compact)); }
function toFlowNode(node: CanvasNode, compact = false): FlowNode {
  return applyFlowNodeSize({ id: node.id, type: "canvasNode", position: node.position, data: { canvasNode: node } }, compact);
}
function applyFlowNodeSize(node: FlowNode, compact: boolean): FlowNode {
  const size = node.data.canvasNode.size;
  return size && !compact
    ? { ...node, width: size.width, height: size.height }
    : { ...node, width: undefined, height: undefined };
}
function applyCanvasNodeChanges(changes: NodeChange<FlowNode>[], nodes: FlowNode[]) {
  const resized = new Map(changes.flatMap((change) => change.type === "dimensions" && change.setAttributes && change.dimensions
    ? [[change.id, change.dimensions] as const]
    : []));
  const changed = applyNodeChanges(changes, nodes);
  if (!resized.size) return changed;
  return changed.map((node) => {
    const size = resized.get(node.id);
    return size ? { ...node, data: { canvasNode: { ...node.data.canvasNode, size } } } : node;
  });
}
function isDurableCanvasNodeChange(change: NodeChange<FlowNode>) {
  return change.type === "position"
    || change.type === "remove"
    || change.type === "add"
    || change.type === "replace"
    || (change.type === "dimensions" && Boolean(change.setAttributes));
}
function markActiveCanvasEdges(edges: FlowEdge[], latestNodeRuns: Map<string, CanvasNodeRun>): FlowEdge[] {
  const activeNodeIds = new Set(Array.from(latestNodeRuns.entries())
    .filter(([, nodeRun]) => nodeRun.status === "queued" || nodeRun.status === "running")
    .map(([nodeId]) => nodeId));
  return edges.map((edge) => ({
    ...edge,
    data: { ...edge.data, beamActive: activeNodeIds.has(edge.source) || activeNodeIds.has(edge.target) },
  }));
}
function toFlowEdges(edges: CanvasEdge[], nodes: CanvasNode[]): FlowEdge[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  return edges.map((edge) => {
    const source = nodeById.get(edge.source);
    const edgeColor = source ? getCanvasNodeDefinition(source.type, source.version)?.color : undefined;
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourcePort,
      targetHandle: edge.targetPort,
      type: "flowing",
      style: { "--canvas-edge-color": edgeColor || "var(--accent)", "--xy-edge-stroke-selected": edgeColor || "var(--accent)" } as React.CSSProperties,
    };
  });
}
function currentGraph(nodes: FlowNode[], edges: FlowEdge[], viewport: Viewport): CanvasGraph {
  return {
    nodes: nodes.map((node) => ({ ...node.data.canvasNode, position: node.position })),
    edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, sourcePort: edge.sourceHandle || "", targetPort: edge.targetHandle || "" })),
    viewport,
  };
}

function canvasGraphsEqual(left: CanvasGraph, right: CanvasGraph) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function createCanvasHistory(graph: CanvasGraph): CanvasHistory {
  return { entries: [structuredClone(graph)], index: 0 };
}

function commitCanvasHistory(history: CanvasHistory, graph: CanvasGraph, limit = canvasHistoryLimit): CanvasHistory {
  if (history.index >= 0 && canvasGraphsEqual(history.entries[history.index], graph)) return history;
  const entries = [...history.entries.slice(0, history.index + 1), structuredClone(graph)].slice(-limit);
  return { entries, index: entries.length - 1 };
}

function stepCanvasHistory(history: CanvasHistory, graph: CanvasGraph, direction: -1 | 1): CanvasHistoryStep {
  const committed = commitCanvasHistory(history, graph);
  const index = committed.index + direction;
  if (index < 0 || index >= committed.entries.length) return { history: committed };
  return {
    history: { ...committed, index },
    graph: structuredClone(committed.entries[index]),
  };
}

function normalizeConfigUrls(value: CanvasNode["config"][string]) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\r?\n/) : [];
  return Array.from(new Set(values.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)));
}

function configStringList(value: CanvasNode["config"][string]) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()) : [];
}

function contentPoolSnapshotConfig(item: NormalizedSourceItem): CanvasNode["config"] {
  const downloadedImages = normalizeConfigUrls(item.downloadedImages);
  return {
    sourceItemId: item.id,
    snapshotAt: new Date().toISOString(),
    snapshotTitle: item.title || "",
    snapshotBody: item.contentText || "",
    snapshotSourceUrl: item.sourceUrl || "",
    snapshotImageUrls: downloadedImages.length ? downloadedImages : normalizeConfigUrls(item.images),
    snapshotVideoUrls: normalizeConfigUrls(item.downloadedVideoUrl ? [item.downloadedVideoUrl] : item.videoUrl ? [item.videoUrl] : []),
  };
}

function copyLibrarySnapshotConfig(entry: CopyLibraryEntryView): CanvasNode["config"] {
  return {
    entryId: entry.id,
    entryTitle: entry.title,
    snapshotTitle: entry.title,
    snapshotBody: entry.body,
    snapshotTags: entry.tags,
    snapshotAt: new Date().toISOString(),
  };
}

function formatSnapshotTime(value: CanvasNode["config"][string]) {
  const timestamp = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : "未记录时间";
}

function moveListItem<T>(items: T[], from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function dataTransferImageFiles(data: DataTransfer) {
  const itemFiles = Array.from(data.items)
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
  return itemFiles.length ? itemFiles : Array.from(data.files).filter((file) => file.type.startsWith("image/"));
}

function dataTransferHasImageFile(data: DataTransfer) {
  return Array.from(data.items).some((item) => item.kind === "file" && item.type.startsWith("image/"))
    || Array.from(data.files).some((file) => file.type.startsWith("image/"));
}

const canvasVideoFileTypes = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const canvasVideoFileExtensions = [".mp4", ".mov", ".webm"];

function isCanvasVideoFile(file: File) {
  const name = file.name.toLowerCase();
  return canvasVideoFileTypes.has(file.type.toLowerCase()) || canvasVideoFileExtensions.some((extension) => name.endsWith(extension));
}

function dataTransferVideoFiles(data: DataTransfer) {
  const itemFiles = Array.from(data.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null && isCanvasVideoFile(file));
  return itemFiles.length ? itemFiles : Array.from(data.files).filter(isCanvasVideoFile);
}

function dataTransferHasVideoFile(data: DataTransfer) {
  return Array.from(data.items).some((item) => item.kind === "file" && canvasVideoFileTypes.has(item.type.toLowerCase()))
    || Array.from(data.files).some(isCanvasVideoFile);
}

function canvasImageDropTargetId(target: EventTarget | null, nodes: FlowNode[]) {
  if (!(target instanceof Element)) return undefined;
  const nodeId = target.closest(".react-flow__node")?.getAttribute("data-id");
  if (!nodeId) return undefined;
  const node = nodes.find((candidate) => candidate.id === nodeId)?.data.canvasNode;
  return node && (node.type === "input.images" || node.type === "model.seedance" || (node.type === "model.gpt-image" && node.version >= 2)) ? nodeId : undefined;
}

function canvasVideoDropTargetId(target: EventTarget | null, nodes: FlowNode[]) {
  if (!(target instanceof Element)) return undefined;
  const nodeId = target.closest(".react-flow__node")?.getAttribute("data-id");
  return nodeId && nodes.some((candidate) => candidate.id === nodeId && candidate.data.canvasNode.type === "input.video-loader")
    ? nodeId
    : undefined;
}

function uploadCanvasVideo(file: File, onProgress: (progress: number) => void) {
  return new Promise<CanvasVideoSnapshot>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `/api/canvas/video-uploads?filename=${encodeURIComponent(file.name)}`);
    request.responseType = "json";
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    });
    request.addEventListener("load", () => {
      const response = request.response as { video?: CanvasVideoSnapshot; error?: string } | null;
      if (request.status >= 200 && request.status < 300 && response?.video) {
        onProgress(100);
        resolve(response.video);
        return;
      }
      reject(new Error(response?.error || `视频上传失败 (${request.status})`));
    });
    request.addEventListener("error", () => reject(new Error("视频上传网络连接失败。")));
    request.addEventListener("abort", () => reject(new Error("视频上传已取消。")));
    request.send(file);
  });
}

function formatMediaDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function clipboardImageFiles(items: ClipboardItem[]) {
  const files: File[] = [];
  for (const item of items) {
    for (const mimeType of item.types.filter((type) => type.startsWith("image/"))) {
      const blob = await item.getType(mimeType);
      files.push(new File([blob], `clipboard-${files.length + 1}.${imageExtension(mimeType)}`, { type: mimeType }));
    }
  }
  return files;
}

function imageExtension(mimeType: string) {
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/avif": "avif" } as Record<string, string>)[mimeType] || "img";
}

function isEditableClipboardTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function resolveQuickAddConnection(nodes: FlowNode[], params: OnConnectStartParams): QuickAddConnection | null {
  if (!params.nodeId || !params.handleId || (params.handleType !== "source" && params.handleType !== "target")) return null;
  const node = nodes.find((candidate) => candidate.id === params.nodeId)?.data.canvasNode;
  const definition = node && getCanvasNodeDefinition(node.type, node.version);
  const port = params.handleType === "source"
    ? definition?.outputs.find((candidate) => candidate.id === params.handleId)
    : definition?.inputs.find((candidate) => candidate.id === params.handleId);
  return port ? { nodeId: params.nodeId, portId: params.handleId, handleType: params.handleType, kind: port.kind, multiple: port.multiple } : null;
}

function quickAddChoices(connection: QuickAddConnection | undefined, edges: FlowEdge[]): QuickAddChoice[] {
  if (connection?.handleType === "target" && isQuickAddTargetOccupied(connection, edges)) return [];
  return canvasNodeDefinitions.flatMap((definition) => {
    if (!connection) return [{ definition }];
    const ports = connection.handleType === "source" ? definition.inputs : definition.outputs;
    return ports.filter((port) => isQuickAddPortCompatible(connection, port)).map((port) => ({ definition, port }));
  });
}

function isQuickAddPortCompatible(connection: QuickAddConnection, port: CanvasPortDefinition) {
  return connection.handleType === "source"
    ? areCanvasPortKindsCompatible(connection.kind, port.kind)
    : areCanvasPortKindsCompatible(port.kind, connection.kind);
}

function isQuickAddTargetOccupied(connection: QuickAddConnection, edges: FlowEdge[]) {
  return connection.handleType === "target"
    && !connection.multiple
    && edges.some((edge) => edge.target === connection.nodeId && edge.targetHandle === connection.portId);
}

function eventPoint(event: MouseEvent | TouchEvent) {
  if ("changedTouches" in event) {
    const touch = event.changedTouches[0] || event.touches[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : null;
  }
  return { x: event.clientX, y: event.clientY };
}

function stageCenter(stage: HTMLElement | null) {
  const bounds = stage?.getBoundingClientRect();
  return bounds ? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 } : { x: 320, y: 240 };
}

function wouldCreateCycle(edges: FlowEdge[], source: string, target: string) {
  if (source === target) return true;
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) outgoing.set(edge.source, [...(outgoing.get(edge.source) || []), edge.target]);
  const pending = [target];
  const seen = new Set<string>();
  while (pending.length) {
    const id = pending.pop();
    if (!id || seen.has(id)) continue;
    if (id === source) return true;
    seen.add(id);
    pending.push(...(outgoing.get(id) || []));
  }
  return false;
}

function canvasEdgeBeamProfile(sourceX: number, sourceY: number, targetX: number, targetY: number) {
  const chordLength = Math.max(Math.hypot(targetX - sourceX, targetY - sourceY), 1);
  const bodyCanvasLength = clampCanvasEdgeValue(chordLength * 0.12, 40, 70);
  const trailCanvasLength = clampCanvasEdgeValue(bodyCanvasLength * 1.55, 64, 110);
  const coreCanvasLength = clampCanvasEdgeValue(bodyCanvasLength * 0.16, 6, 12);
  const trailLength = normalizedCanvasEdgeLength(trailCanvasLength, chordLength, 28);
  const bodyLength = normalizedCanvasEdgeLength(bodyCanvasLength, chordLength, 18);
  const coreLength = normalizedCanvasEdgeLength(coreCanvasLength, chordLength, 6);
  return {
    trailDash: canvasEdgeDashPattern(trailLength),
    bodyDash: canvasEdgeDashPattern(bodyLength),
    coreDash: canvasEdgeDashPattern(coreLength),
    bodyShift: roundCanvasEdgeValue(-(trailLength - bodyLength) * 0.55),
    coreShift: roundCanvasEdgeValue(-(trailLength - coreLength) * 0.84),
  };
}

function normalizedCanvasEdgeLength(canvasLength: number, chordLength: number, maximum: number) {
  return roundCanvasEdgeValue(Math.min((canvasLength / chordLength) * 100, maximum));
}

function canvasEdgeDashPattern(length: number) {
  return `${length} ${roundCanvasEdgeValue(100 - length)}`;
}

function canvasEdgeLayerStyle(shift: number) {
  return {
    "--canvas-edge-layer-start": roundCanvasEdgeValue(100 + shift),
    "--canvas-edge-layer-end": shift,
  } as React.CSSProperties;
}

function clampCanvasEdgeValue(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundCanvasEdgeValue(value: number) {
  return Number(value.toFixed(3));
}

function edgeAnimationDelay(edgeId: string, durationSeconds: number) {
  let hash = 0;
  for (let index = 0; index < edgeId.length; index += 1) hash = ((hash << 5) - hash + edgeId.charCodeAt(index)) | 0;
  const phase = (Math.abs(hash) % 1000) / 1000;
  return roundCanvasEdgeValue(-phase * durationSeconds);
}

function getModelArtifact(nodeType: CanvasNodeType, nodeRun: CanvasNodeRun) {
  const definition = getCanvasNodeDefinition(nodeType);
  const expectedKind = definition?.outputs.find((port) => port.kind === "text" || port.kind === "images" || port.kind === "videos")?.kind;
  if (expectedKind !== "text" && expectedKind !== "images" && expectedKind !== "videos") return undefined;
  const declaredOutputs = (definition?.outputs || [])
    .filter((port) => port.kind === expectedKind)
    .map((port) => nodeRun.outputs[port.id]);
  return [...declaredOutputs, ...Object.values(nodeRun.outputs)].find((artifact) => isPreviewableModelArtifact(artifact, expectedKind));
}

function getImagesArtifact(nodeRun: CanvasNodeRun) {
  return Object.values(nodeRun.outputs).find((artifact): artifact is Extract<CanvasArtifact, { kind: "images" }> => artifact.kind === "images" && artifact.items.length > 0);
}

function getSaveImagesArtifact(nodeRun: CanvasNodeRun) {
  const artifact = nodeRun.outputs.downloads;
  return artifact?.kind === "images" && artifact.items.length > 0 && artifact.items.length <= CANVAS_SAVE_IMAGE_MAX_ITEMS ? artifact : undefined;
}

function parseCanvasDownloadFilename(contentDisposition: string | null) {
  if (!contentDisposition) return undefined;
  const encoded = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/iu)?.[1]?.trim();
  if (encoded) {
    try {
      const filename = decodeURIComponent(encoded);
      if (filename && !/[\u0000-\u001f\u007f/\\]/u.test(filename)) return filename;
    } catch {
      // Fall through to the ASCII filename supplied by the same response.
    }
  }
  const quoted = contentDisposition.match(/filename\s*=\s*"([^"]+)"/iu)?.[1]?.trim();
  return quoted && !/[\u0000-\u001f\u007f/\\]/u.test(quoted) ? quoted : undefined;
}

async function downloadCanvasSaveImages(runId: string, nodeRunId: string, count: number) {
  let success = 0;
  let failed = 0;
  for (let index = 0; index < count; index += 1) {
    try {
      const response = await fetch(`/api/canvas/runs/${encodeURIComponent(runId)}/downloads/images?nodeRunId=${encodeURIComponent(nodeRunId)}&index=${index}`);
      if (!response.ok) {
        await response.text();
        throw new Error(`Image download failed (${response.status})`);
      }
      const filename = parseCanvasDownloadFilename(response.headers.get("Content-Disposition"));
      if (!filename) throw new Error("Image download filename is missing.");
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      try {
        link.href = objectUrl;
        link.download = filename;
        link.hidden = true;
        document.body.append(link);
        link.click();
        success += 1;
      } finally {
        link.remove();
        URL.revokeObjectURL(objectUrl);
      }
    } catch {
      failed += 1;
    }
  }
  return { success, failed };
}

async function downloadCanvasRunSaveImages(runId: string) {
  const data = await api<CanvasRunWithNodes>(`/api/canvas/runs/${encodeURIComponent(runId)}`);
  const latest = latestAttempts(data.nodeRuns);
  const results = data.run.graphSnapshot.nodes.flatMap((node) => {
    if (node.type !== "utility.save-images") return [];
    const nodeRun = latest.get(node.id);
    const artifact = nodeRun && (nodeRun.status === "completed" || nodeRun.status === "reused")
      ? getSaveImagesArtifact(nodeRun)
      : undefined;
    return nodeRun && artifact ? [{ nodeRunId: nodeRun.id, count: artifact.items.length }] : [];
  });
  if (!results.length) throw new Error("该主任务没有可下载的保存图片结果。");

  const total = { success: 0, failed: 0 };
  for (const result of results) {
    const counts = await downloadCanvasSaveImages(runId, result.nodeRunId, result.count);
    total.success += counts.success;
    total.failed += counts.failed;
  }
  return total;
}

function getDisplayAnyArtifact(nodeRun: CanvasNodeRun) {
  return nodeRun.outputs.preview;
}

function getTextOutputArtifact(nodeRun: CanvasNodeRun, outputId: string) {
  const artifact = nodeRun.outputs[outputId];
  return artifact?.kind === "text" && artifact.value.trim() ? artifact : undefined;
}

function getSocialPostArtifact(nodeRun: CanvasNodeRun) {
  return Object.values(nodeRun.outputs).find((artifact): artifact is Extract<CanvasArtifact, { kind: "socialPost" }> => artifact.kind === "socialPost");
}

function legacyNodeRatio(node: CanvasNode) {
  const size = String(node.config.size || "1024x1024");
  return ({ "1024x1536": "2:3", "1536x1024": "3:2", "1152x2048": "9:16", "2048x1152": "16:9", "2160x3840": "9:16", "3840x2160": "16:9" } as Record<string, string>)[size] || "1:1";
}

function legacyNodeResolution(node: CanvasNode) {
  const size = String(node.config.size || "1024x1024");
  if (size === "3840x2160" || size === "2160x3840") return "4k";
  if (size.startsWith("2048x") || size.endsWith("x2048")) return "2k";
  return "1k";
}

function cssAspectRatio(ratio?: string) {
  const [width, height] = String(ratio || "1:1").split(":").map(Number);
  return width > 0 && height > 0 ? `${width} / ${height}` : "1 / 1";
}

function isPreviewableModelArtifact(artifact: CanvasArtifact | undefined, expectedKind: "text" | "images" | "videos") {
  if (!artifact || artifact.kind !== expectedKind) return false;
  if (artifact.kind === "text") return Boolean(artifact.value.trim());
  return artifact.items.length > 0;
}

function canvasNodeRunStatusLabel(status: CanvasNodeRun["status"]) {
  return ({
    queued: "排队中",
    running: "生成中",
    completed: "已完成",
    reused: "已复用",
    bypassed: "已跳过",
    disabled: "已禁用",
    failed: "生成失败",
    blocked: "已阻塞",
    cancelled: "已取消",
    needs_config: "缺少配置",
  } as const)[status];
}

function latestAttempts(nodeRuns: CanvasNodeRun[]) {
  const result = new Map<string, CanvasNodeRun>();
  nodeRuns.forEach((nodeRun) => {
    if (!result.has(nodeRun.nodeId) || (result.get(nodeRun.nodeId)?.attempt || 0) < nodeRun.attempt) result.set(nodeRun.nodeId, nodeRun);
  });
  return result;
}

function mergeRunHistory(current: CanvasRun[], updated: CanvasRun) {
  const scoped = current.filter((run) => run.workflowId === updated.workflowId);
  if (scoped.some((run) => run.id === updated.id)) {
    return scoped.map((run) => run.id === updated.id ? updated : run);
  }
  return [updated, ...scoped].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

function mergeTaskRunHistory(current: CanvasRun[], updated: CanvasRun) {
  const sameWorkflow = mergeRunHistory(current, updated);
  const merged = [...sameWorkflow, ...current.filter((run) => run.workflowId !== updated.workflowId)];
  return merged.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)).slice(0, 50);
}

function isActiveCanvasRun(status: CanvasRun["status"]) {
  return status === "queued" || status === "running";
}

function isFailedCanvasRun(status: CanvasRun["status"]) {
  return status === "partial" || status === "failed";
}

function canvasRunStatusLabel(status: CanvasRun["status"]) {
  return ({
    queued: "排队中",
    running: "运行中",
    completed: "已完成",
    partial: "部分完成",
    failed: "失败",
    cancelled: "已取消",
  } as const)[status];
}

function canvasRunModeLabel(mode?: CanvasRunMode) {
  if (mode === "isolated") return "仅此节点";
  if (mode === "with-upstream") return "包含上游";
  return "全部节点";
}

function formatCanvasRunTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function schedulerRolesForNode(node: CanvasNode): CanvasSchedulerRole[] {
  if (node.type === "input.images" || node.type === "input.library-images") return ["scene-input", "vehicle-input"];
  if (node.type === "utility.prompt-switch") return ["prompt-switch"];
  if (node.type === "model.gpt-image" && node.version >= 2) return ["image-target"];
  if (node.type === "compose.social-post") return ["content-target"];
  if (node.type === "input.copy-library") return ["copy-input"];
  return [];
}

function canvasBatchBindingOptions(graph: CanvasGraph, valueType: CanvasScheduleParameterType) {
  return graph.nodes.flatMap((node) => getCanvasBatchBindableFields(node)
    .filter((field) => field.parameterTypes.includes(valueType))
    .map((field) => ({ node, field, label: `${canvasNodeDisplayName(node)} · ${field.label} · ${node.id.slice(-4)}` })));
}

function firstCanvasBatchBinding(graph: CanvasGraph) {
  for (const node of graph.nodes) {
    const field = getCanvasBatchBindableFields(node)[0];
    if (field) return { node, field };
  }
  return undefined;
}

function canvasNodeDisplayName(node: CanvasNode) {
  return node.label?.trim() || getCanvasNodeDefinition(node.type, node.version)?.label || node.type;
}

function canvasNodeOptionLabel(node: CanvasNode) {
  return `${canvasNodeDisplayName(node)} · ${getCanvasNodeDefinition(node.type, node.version)?.label || node.type} · ${node.id.slice(-4)}`;
}

function nextCanvasScheduleParameterId() {
  canvasScheduleParameterSequence += 1;
  return `canvas-v2-parameter-${Date.now()}-${canvasScheduleParameterSequence}`;
}

function defaultCanvasScheduleParameterSource(valueType: CanvasScheduleParameterType, nodeId = ""): CanvasScheduleParameterSource {
  if (valueType === "video") return { mode: "video-loader-queue", nodeId };
  if (valueType === "source-video") return { mode: "source-video-links", links: [], projectName: "视频内容重构" };
  if (valueType === "image" || valueType === "image-group") return { mode: "library-filter", role: "reference", filter: emptyScheduleFilter() };
  if (valueType === "copy") return { mode: "copy-filter", filter: emptyScheduleCopyFilter() };
  return { mode: "fixed", values: [defaultCanvasScheduleScalarValue(valueType)] };
}

function canvasScheduleParameterSampleCount(parameter: CanvasScheduleParameter): CanvasScheduleSampleCount {
  if (parameter.sampleCount?.mode === "exact") return { mode: "exact", value: positiveCanvasScheduleInteger(parameter.sampleCount.value) };
  if (parameter.sampleCount?.mode === "range") return {
    mode: "range",
    min: positiveCanvasScheduleInteger(parameter.sampleCount.min),
    max: Math.max(positiveCanvasScheduleInteger(parameter.sampleCount.min), positiveCanvasScheduleInteger(parameter.sampleCount.max)),
  };
  return { mode: "exact", value: positiveCanvasScheduleInteger(parameter.randomCount) };
}

function positiveCanvasScheduleInteger(value: unknown) {
  return Math.max(1, Math.trunc(Number(value) || 1));
}

function canvasScheduleSampleCountSummary(scope: CanvasScheduleParameter["scope"], sampleCount: CanvasScheduleSampleCount) {
  const count = sampleCount.mode === "exact" ? `${sampleCount.value}` : `${sampleCount.min}-${sampleCount.max}`;
  return scope === "child" ? `每个主任务随机抽取 ${count} 项` : `每次预演随机抽取 ${count} 项`;
}

function defaultCanvasScheduleScalarValue(valueType: CanvasScheduleParameterType): CanvasScheduleParameterValue {
  if (valueType === "number") return 1;
  if (valueType === "boolean") return false;
  return "";
}

function parseCanvasScheduleScalarValues(valueType: CanvasScheduleParameterType, value: string, mode: "fixed" | "manual-list") {
  const lines = value.split(/\r?\n/).map((item) => item.trim()).filter((item, index) => item || (mode === "fixed" && index === 0));
  const selected = mode === "fixed" ? lines.slice(0, 1) : lines;
  return (selected.length ? selected : [""]).map((item): CanvasScheduleParameterValue => {
    if (valueType === "number") return Number(item || 0);
    if (valueType === "boolean") return ["true", "1", "是", "yes"].includes(item.toLowerCase());
    return item;
  });
}

function canvasScheduleParameterTypeLabel(value: CanvasScheduleParameterType) {
  return ({ image: "图片", "image-group": "图片组", video: "视频", "source-video": "源视频", text: "文本", copy: "文案记录", number: "数字", boolean: "布尔值", enum: "枚举" } as const)[value];
}

function formatCanvasScheduleParameterValues(values: Record<string, CanvasScheduleParameterValue>) {
  const labels = Object.values(values).map((value) => {
    if (Array.isArray(value)) return `${value.length} 张图片`;
    if (value && typeof value === "object") {
      if ("projectName" in value) return value.title || value.id;
      if ("url" in value) return ("name" in value ? value.name : "filename" in value ? value.filename : undefined) || value.id;
      if ("body" in value) return value.title;
    }
    return String(value);
  }).filter(Boolean);
  return labels.join(" · ") || "固定参数";
}

function canvasScheduleParameterImages(values: Record<string, CanvasScheduleParameterValue>) {
  const seen = new Set<string>();
  return Object.values(values).flatMap((value) => Array.isArray(value) ? value : [value])
    .filter((value): value is CanvasScheduleAssetSnapshot => Boolean(
      value
      && typeof value === "object"
      && "id" in value
      && typeof value.id === "string"
      && "url" in value
      && typeof value.url === "string"
      && value.url
      && !("projectName" in value)
      && !("filename" in value),
    ))
    .filter((image) => {
      const key = `${image.id}\u0000${image.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function schedulerRoleLabel(role: CanvasSchedulerRole) {
  return CANVAS_SCHEDULER_ROLE_LABELS[role];
}

function schedulerBindingsFromGraph(graph: CanvasGraph): Partial<CanvasScheduleBindings> {
  return Object.fromEntries(graph.nodes.flatMap((node) => node.schedulerRole ? [[node.schedulerRole, node.id]] : []));
}

function hasCompleteSchedulerBindings(bindings: Partial<CanvasScheduleBindings>): bindings is CanvasScheduleBindings {
  const requiredIds = CANVAS_REQUIRED_SCHEDULER_ROLES.map((role) => bindings[role]).filter((nodeId): nodeId is string => Boolean(nodeId));
  const selectedIds = CANVAS_SCHEDULER_ROLES.map((role) => bindings[role]).filter((nodeId): nodeId is string => Boolean(nodeId));
  return requiredIds.length === CANVAS_REQUIRED_SCHEDULER_ROLES.length && new Set(selectedIds).size === selectedIds.length;
}

function schedulerBindingsEqual(left: CanvasScheduleBindings, right: Partial<CanvasScheduleBindings>) {
  return CANVAS_SCHEDULER_ROLES.every((role) => left[role] === right[role]);
}

function schedulerBindingNodeOptions(graph: CanvasGraph, role: CanvasSchedulerRole) {
  const compatibleNodes = graph.nodes.filter((node) => schedulerRolesForNode(node).includes(role));
  return compatibleNodes.map((node, index) => {
    const assetNames = Array.isArray(node.config.assetNames) ? node.config.assetNames.filter((item): item is string => typeof item === "string") : [];
    const definition = getCanvasNodeDefinition(node.type, node.version);
    return {
      id: node.id,
      label: `${node.label?.trim() || assetNames[0]?.trim() || `${definition?.label || node.type} ${index + 1}`} · ${definition?.label || node.type} · ${node.id.slice(-4)}`,
    };
  });
}

function canvasScheduleSharedOutputCandidates(
  graph: CanvasGraph,
  definition: CanvasScheduleV2Definition,
): Array<{ node: CanvasNode; port: CanvasPortDefinition; artifactKind: CanvasScheduleV2Definition["childResult"]["artifactKind"] }> {
  const childBindingNodeIds = new Set(definition.parameters
    .filter((parameter) => parameter.scope === "child")
    .map((parameter) => parameter.binding.nodeId));
  const candidates: Array<{ node: CanvasNode; port: CanvasPortDefinition; artifactKind: CanvasScheduleV2Definition["childResult"]["artifactKind"] }> = [];
  for (const node of graph.nodes) {
    const nodeDefinition = getCanvasNodeDefinition(node.type, node.version);
    const port = nodeDefinition?.outputs[0];
    if (!nodeDefinition
      || nodeDefinition.category === "input"
      || nodeDefinition.passiveSink
      || nodeDefinition.capability === "external_write"
      || getCanvasNodeExecutionMode(node) === "disabled"
      || nodeDefinition.outputs.length !== 1
      || !port
      || !isCanvasScheduleArtifactKind(port.kind)
      || node.id === definition.childResult.nodeId
      || !hasCanvasGraphPath(graph, node.id, definition.childResult.nodeId)) continue;
    const ancestors = collectCanvasGraphAncestors(graph, node.id);
    if (Array.from(childBindingNodeIds).some((nodeId) => ancestors.has(nodeId))) continue;
    candidates.push({ node, port, artifactKind: port.kind });
  }
  return candidates;
}

function isCanvasScheduleArtifactKind(kind: CanvasPortKind): kind is "text" | "images" | "videos" {
  return kind === "text" || kind === "images" || kind === "videos";
}

function hasCanvasGraphPath(graph: CanvasGraph, sourceId: string, targetId: string) {
  const outgoing = new Map<string, string[]>();
  for (const edge of graph.edges) outgoing.set(edge.source, [...(outgoing.get(edge.source) || []), edge.target]);
  const pending = [sourceId];
  const visited = new Set<string>();
  while (pending.length) {
    const current = pending.pop()!;
    if (current === targetId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(outgoing.get(current) || []));
  }
  return false;
}

function collectCanvasGraphAncestors(graph: CanvasGraph, targetId: string) {
  const incoming = new Map<string, string[]>();
  for (const edge of graph.edges) incoming.set(edge.target, [...(incoming.get(edge.target) || []), edge.source]);
  const pending = [targetId];
  const result = new Set<string>();
  while (pending.length) {
    const current = pending.pop()!;
    if (result.has(current)) continue;
    result.add(current);
    pending.push(...(incoming.get(current) || []));
  }
  return result;
}

function emptyScheduleFilter(): CanvasScheduleAssetFilter {
  return { mode: "manual", assetIds: [], search: "", tags: [] };
}

function emptyScheduleCopyFilter(): CanvasScheduleCopyFilter {
  return { mode: "manual", entryIds: [], search: "", tags: [] };
}

function splitScheduleTags(value: string) {
  return Array.from(new Set(value.split(/[,，]/).map((item) => item.trim()).filter(Boolean)));
}

function canvasScheduleStatusLabel(status: string) {
  return ({
    draft: "草稿",
    ready: "待确认",
    pending: "待调度",
    queued: "排队中",
    running: "运行中",
    paused: "已暂停",
    completed: "已完成",
    partial: "部分完成",
    failed: "失败",
    cancelled: "已取消",
  } as Record<string, string>)[status] || status;
}

async function api<T = { ok: boolean }>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function errorMessage(error: unknown) { return error instanceof Error ? error.message : "操作失败"; }
function categoryLabel(category: string) { return ({ input: "输入", model: "模型", utility: "工具", compose: "组装", publish: "发布" } as Record<string, string>)[category] || category; }
function portKindLabel(kind: CanvasPortKind) { return ({ any: "任意", visual: "图片或视频", text: "文字", images: "图片", videos: "视频", socialPost: "内容", publishJobRef: "发布任务" } as Record<CanvasPortKind, string>)[kind]; }
function iconForNode(type: CanvasNodeType) {
  const props = { className: "h-4 w-4" };
  if (type === "input.text") return <Type {...props} />;
  if (type === "input.images") return <ImageIcon {...props} />;
  if (type === "input.source-video") return <FileVideo2 {...props} />;
  if (type === "input.video-loader") return <FileUp {...props} />;
  if (type === "input.videos") return <Video {...props} />;
  if (type === "input.content-pool") return <Layers3 {...props} />;
  if (type === "input.library-images") return <Images {...props} />;
  if (type === "input.copy-library") return <BookOpenText {...props} />;
  if (type === "model.gpt-text") return <Sparkles {...props} />;
  if (type === "model.gpt-image") return <WandSparkles {...props} />;
  if (type === "model.gpt-vision") return <Search {...props} />;
  if (type === "model.seedance") return <Clapperboard {...props} />;
  if (type === "utility.image-preview") return <Images {...props} />;
  if (type === "utility.save-images") return <Download {...props} />;
  if (type === "utility.video-reconstruct") return <RefreshCw {...props} />;
  if (type === "utility.display-any") return <Eye {...props} />;
  if (type === "utility.prompt-template") return <FileText {...props} />;
  if (type === "utility.text-concatenate") return <Combine {...props} />;
  if (type === "utility.prompt-switch") return <GitBranch {...props} />;
  if (type === "utility.text-split") return <Scissors {...props} />;
  if (type === "utility.image-select") return <ImageIcon {...props} />;
  if (type === "utility.image-transform") return <Maximize2 {...props} />;
  if (type === "utility.video-frames") return <Clapperboard {...props} />;
  if (type === "utility.video-subtitles") return <Captions {...props} />;
  if (type === "compose.social-post") return <PanelsTopLeft {...props} />;
  return <Send {...props} />;
}
