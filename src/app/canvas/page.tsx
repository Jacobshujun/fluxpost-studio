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
  CheckCircle2,
  Clapperboard,
  ClipboardPaste,
  Copy,
  CopyPlus,
  FileText,
  ExternalLink,
  GitBranch,
  Home,
  Image as ImageIcon,
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
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  CANVAS_CLIPBOARD_MIME,
  createCanvasClipboardPayload,
  instantiateCanvasClipboardPayload,
  parseCanvasClipboardPayload,
  type CanvasClipboardPayload,
} from "@/lib/canvas/clipboard";
import { canvasNodeDefinitions, createCanvasNode, getCanvasNodeDefinition } from "@/lib/canvas/registry";
import { createCanvasSchedulerSkeleton } from "@/lib/canvas/scheduler-skeleton";
import {
  areCanvasPortKindsCompatible,
  CANVAS_NODE_SIZE_LIMITS,
  CANVAS_REQUIRED_SCHEDULER_ROLES,
  CANVAS_SCHEDULER_ROLES,
  CANVAS_SCHEDULER_ROLE_LABELS,
} from "@/lib/canvas/types";
import { getStoredTheme, subscribeTheme } from "@/lib/theme";
import type { ContentPoolSnapshot, CopyLibraryEntryView, NormalizedSourceItem } from "@/lib/types";
import type {
  CanvasArtifact,
  CanvasEdge,
  CanvasGraph,
  CanvasLatestSuccessfulNodeRun,
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
  CanvasScheduleBatch,
  CanvasScheduleBindings,
  CanvasScheduleCopyFilter,
  CanvasSchedulerRole,
  CanvasWorkflow,
} from "@/lib/canvas/types";

type FlowNode = Node<{ canvasNode: CanvasNode }, "canvasNode">;
type FlowEdge = Edge;
type CanvasHistory = { entries: CanvasGraph[]; index: number };
type CanvasHistoryStep = { history: CanvasHistory; graph?: CanvasGraph };
type QuickAddConnection = { nodeId: string; portId: string; handleType: "source" | "target"; kind: CanvasPortKind; multiple?: boolean };
type QuickAddState = { screen: { x: number; y: number }; position: { x: number; y: number }; connection?: QuickAddConnection } | null;
type QuickAddChoice = { definition: (typeof canvasNodeDefinitions)[number]; port?: CanvasPortDefinition };
type CanvasLibraryAsset = { id: string; name: string; publicUrl: string };
type CanvasLibraryAssetPage = {
  assets: CanvasLibraryAsset[];
  collections: Array<{ id: string; name: string }>;
  total: number;
};
type CanvasCopyLibraryResponse = { entries: CopyLibraryEntryView[]; tags: string[] };
type CanvasTaskFilter = "all" | "active" | "history" | "failed";
type PreviewState =
  | { kind: "text"; value: string }
  | { kind: "image"; url: string; index: number; width?: number; height?: number }
  | { kind: "video"; url: string; index: number }
  | null;
type CanvasNodeInteraction = {
  activeRun?: CanvasRunWithNodes;
  latestNodeRuns: Map<string, CanvasNodeRun>;
  latestSuccessfulNodeRuns: Map<string, CanvasLatestSuccessfulNodeRun>;
  selectedNodeId?: string;
  canResize: boolean;
  workflowRevision?: number;
  onConfigChange: (nodeId: string, key: string, value: string | number | string[]) => void;
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

export default function CanvasPage() {
  const [workflows, setWorkflows] = useState<CanvasWorkflow[]>([]);
  const [activeWorkflow, setActiveWorkflow] = useState<CanvasWorkflow | null>(null);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [activeRun, setActiveRun] = useState<CanvasRunWithNodes>();
  const [latestSuccessfulNodeRuns, setLatestSuccessfulNodeRuns] = useState<Map<string, CanvasLatestSuccessfulNodeRun>>(new Map());
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
  const [preview, setPreview] = useState<PreviewState>(null);
  const [quickAdd, setQuickAdd] = useState<QuickAddState>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactFlowRef = useRef<ReactFlowInstance<FlowNode, FlowEdge> | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasPointerRef = useRef<{ x: number; y: number } | null>(null);
  const pasteSequenceRef = useRef(0);
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
  const latestNodeRuns = useMemo(() => latestAttempts(activeRun?.nodeRuns || []), [activeRun?.nodeRuns]);
  const activeTaskCount = taskRuns.length
    ? taskRuns.filter((run) => isActiveCanvasRun(run.status)).length
    : activeRun && isActiveCanvasRun(activeRun.run.status) ? 1 : 0;
  const openImagePreview = useCallback((url: string, index: number) => setPreview({ kind: "image", url, index }), []);
  const markDirty = useCallback(() => {
    dirtyVersionRef.current += 1;
    setDirty(true);
  }, []);
  const updateNodeConfig = useCallback((nodeId: string, key: string, value: string | number | string[]) => {
    setNodes((current) => current.map((node) => node.id !== nodeId ? node : {
      ...node,
      data: { canvasNode: { ...node.data.canvasNode, config: { ...node.data.canvasNode.config, [key]: value } } },
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
  const updateNodeExecutionMode = useCallback((nodeId: string, executionMode: CanvasNodeExecutionMode) => {
    setNodes((current) => current.map((node) => node.id !== nodeId ? node : {
      ...node,
      data: { canvasNode: { ...node.data.canvasNode, executionMode } },
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
    const sequence = ++pasteSequenceRef.current;
    const fragment = instantiateCanvasClipboardPayload(payload, position, (kind, index) => `${kind}-paste-${Date.now()}-${sequence}-${index}`);
    const pastedNodes = fragment.nodes.map((node) => ({ ...toFlowNode(node, isMobile), selected: true }));
    setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), ...pastedNodes]);
    setEdges((current) => [...current, ...toFlowEdges(fragment.edges, fragment.nodes)]);
    setSelectedNodeId(fragment.nodes[0]?.id);
    markDirty();
    setMessage(`已粘贴 ${fragment.nodes.length} 个节点`);
  }

  async function copySelectedNodes(removeAfterCopy = false) {
    const payload = getSelectionPayload();
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload));
      if (removeAfterCopy) removeSelectedNodes();
      else setMessage(`已复制 ${payload.nodes.length} 个节点`);
    } catch (error) {
      setMessage(errorMessage(error));
    }
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
        ? nodes.find((flowNode) => flowNode.id === targetNodeId && ["input.images", "model.gpt-image"].includes(flowNode.data.canvasNode.type))
        : undefined;
      const isGptReference = target?.data.canvasNode.type === "model.gpt-image" && target.data.canvasNode.version >= 2;
      const configKey = isGptReference ? "referenceUrls" : "urls";
      const currentUrls = target ? normalizeConfigUrls(target.data.canvasNode.config[configKey]) : [];
      if (isGptReference) {
        if (currentUrls.length + files.length > 16) throw new Error(`GPT-Image-2 最多支持 16 张参考图片，当前 ${currentUrls.length} 张。`);
        const invalid = files.find((file) => !["image/png", "image/jpeg"].includes(file.type) || file.size > 50 * 1024 * 1024);
        if (invalid) throw new Error(`${invalid.name} 必须是 PNG/JPEG 且不超过 50MB。`);
      }
      const imageUrls: string[] = [];
      for (const file of files) {
        const form = new FormData();
        form.append("files", file);
        if (isGptReference) form.append("mode", "gpt-reference");
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

  async function pasteFromSystemClipboard(targetNodeId?: string) {
    try {
      const clipboardItems = await navigator.clipboard.read();
      const imageFiles = await clipboardImageFiles(clipboardItems);
      if (imageFiles.length) {
        await importImageFiles(imageFiles, targetNodeId);
        return;
      }
      const payload = parseCanvasClipboardPayload(await navigator.clipboard.readText());
      if (payload && !targetNodeId) {
        pasteCanvasPayload(payload);
        return;
      }
      setMessage("剪贴板中没有可导入的图片或画布节点");
    } catch (error) {
      setMessage(errorMessage(error));
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

  function updateSelectedConfig(key: string, value: string | number | string[]) {
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
      if (!payload || !event.clipboardData) return;
      const serialized = JSON.stringify(payload);
      event.preventDefault();
      event.clipboardData.setData(CANVAS_CLIPBOARD_MIME, serialized);
      event.clipboardData.setData("text/plain", serialized);
      setMessage(`已复制 ${payload.nodes.length} 个节点`);
    };
    const handleCut = (event: ClipboardEvent) => {
      if (isMobile || isEditableClipboardTarget(event.target)) return;
      const payload = getSelectionPayload();
      if (!payload || !event.clipboardData) return;
      const serialized = JSON.stringify(payload);
      event.preventDefault();
      event.clipboardData.setData(CANVAS_CLIPBOARD_MIME, serialized);
      event.clipboardData.setData("text/plain", serialized);
      removeSelectedNodes();
    };
    const handlePaste = (event: ClipboardEvent) => {
      if (isEditableClipboardTarget(event.target) || !event.clipboardData) return;
      const imageFiles = clipboardDataImageFiles(event.clipboardData);
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
          <ToolbarButton label="复制" icon={<Copy />} onClick={() => void duplicateWorkflow()} disabled={!activeWorkflow || busy} />
          <ToolbarButton label="存为模板" icon={<FileText />} onClick={() => void duplicateWorkflow(true)} disabled={!activeWorkflow || busy} />
          <ToolbarButton label="删除" icon={<Trash2 />} onClick={() => void removeWorkflow()} disabled={!activeWorkflow || busy} danger />
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

        <div className="canvas-stage" data-testid="canvas-stage" ref={stageRef} onContextMenu={(event) => {
          const target = event.target instanceof Element ? event.target : null;
          if (isEditableClipboardTarget(event.target) || isMobile || !activeWorkflow || !target?.closest(".react-flow__pane")) return;
          event.preventDefault();
          openQuickAdd(event.clientX, event.clientY);
        }} onPointerMove={(event) => { canvasPointerRef.current = { x: event.clientX, y: event.clientY }; }} onPointerLeave={() => { canvasPointerRef.current = null; }}>
          {activeWorkflow ? <CanvasNodeInteractionContext.Provider value={nodeInteraction}><ReactFlow<FlowNode, FlowEdge>
            nodes={displayedNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectStart={(_, params) => startQuickConnection(params)}
            onConnectEnd={finishQuickConnection}
            onInit={(instance) => { reactFlowRef.current = instance; }}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => { setSelectedNodeId(undefined); setQuickAdd(null); }}
            onSelectionChange={({ nodes: selectedNodes }) => {
              const selectedNode = selectedNodes.at(-1);
              if (selectedNode) setSelectedNodeId(selectedNode.id);
            }}
            onMoveEnd={(_, nextViewport) => { setViewport(nextViewport); markDirty(); }}
            defaultViewport={viewport}
            minZoom={0.2}
            maxZoom={2.2}
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
            onPatch={(patch) => updateNodeConfigPatch(selectedCanvasNode.id, patch)}
            onExecutionModeChange={(mode) => updateNodeExecutionMode(selectedCanvasNode.id, mode)}
            onSchedulerRoleChange={(role) => updateNodeSchedulerRole(selectedCanvasNode.id, role)}
            onImportImages={(files) => importImageFiles(files, selectedCanvasNode.id)}
            onPasteImages={() => pasteFromSystemClipboard(selectedCanvasNode.id)}
            onPreviewImage={openImagePreview}
            mediaBusy={mediaBusy}
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
    {node.type === "input.copy-library" ? <div className="canvas-node-copy-summary"><BookOpenText /><div><strong>{String(node.config.entryTitle || node.config.snapshotTitle || "未选择文案")}</strong><small>{configStringList(node.config.snapshotTags).slice(0, 3).join(" · ") || "无标签"}</small></div></div> : null}
    {node.type === "utility.text-split" && node.version >= 2 ? <CanvasTextSplitControls
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
      : node.type.startsWith("model.") || ["utility.prompt-template", "utility.image-select", "utility.image-transform", "utility.video-frames"].includes(node.type)
        ? <CanvasModelNodeResult node={node} nodeRun={nodeRun} latestSuccessful={latestSuccessful} historicalRevision={historicalRevision} onPreview={(next) => interaction?.onPreview(next)} />
        : null}
    {node.type === "utility.image-preview" ? <CanvasImagePreviewNodeResult nodeRun={nodeRun} latestSuccessful={latestSuccessful} onPreview={(next) => interaction?.onPreview(next)} /> : null}
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

function FlowingCanvasEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style }: EdgeProps) {
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const animationDelay = `${edgeAnimationDelay(id)}s`;
  return <g style={{ ...style, "--canvas-edge-delay": animationDelay } as React.CSSProperties}>
    <BaseEdge id={id} path={path} markerEnd={markerEnd} className="canvas-flow-edge-base" />
    <path d={path} pathLength={100} className="canvas-flow-edge-glow" aria-hidden="true" />
    <path d={path} pathLength={100} className="canvas-flow-edge-highlight" aria-hidden="true" />
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
  onExecutionModeChange,
  onSchedulerRoleChange,
  onImportImages,
  onPasteImages,
  onPreviewImage,
  mediaBusy,
}: {
  node: CanvasNode;
  onChange: (key: string, value: string | number | string[]) => void;
  onPatch: (patch: CanvasNode["config"]) => void;
  onExecutionModeChange: (mode: CanvasNodeExecutionMode) => void;
  onSchedulerRoleChange: (role?: CanvasSchedulerRole) => void;
  onImportImages: (files: File[]) => Promise<void>;
  onPasteImages: () => Promise<void>;
  onPreviewImage: (url: string, index: number) => void;
  mediaBusy: boolean;
}) {
  const definition = getCanvasNodeDefinition(node.type, node.version);
  if (!definition) return null;
  const isGptImageV2 = node.type === "model.gpt-image" && node.version >= 2;
  const imageConfigKey = isGptImageV2 ? "referenceUrls" : "urls";
  const imageUrls = node.type === "input.images" || isGptImageV2 ? normalizeConfigUrls(node.config[imageConfigKey]) : [];
  const executionMode = node.executionMode === "bypass" || node.executionMode === "disabled" ? node.executionMode : "enabled";
  return <div className="canvas-inspector-content">
    <div className="canvas-inspector-title"><span style={{ color: definition.color }}>{iconForNode(node.type)}</span><div><strong>{definition.label}</strong><small>{definition.description}</small></div></div>
    <label><span>节点状态</span><select value={executionMode} onChange={(event) => onExecutionModeChange(event.target.value as CanvasNodeExecutionMode)}>
      <option value="enabled">启用</option>
      <option value="bypass" disabled={!definition.bypass}>跳过</option>
      <option value="disabled">禁用</option>
    </select></label>
    <label><span>调度角色</span><select value={node.schedulerRole || ""} onChange={(event) => onSchedulerRoleChange((event.target.value || undefined) as CanvasSchedulerRole | undefined)}>
      <option value="">未绑定</option>
      {schedulerRolesForNode(node).map((role) => <option key={role} value={role}>{schedulerRoleLabel(role)}</option>)}
    </select></label>
    {node.type === "input.images" || isGptImageV2 ? <div className="canvas-image-import">
      {isGptImageV2 ? <div className="canvas-image-import-count"><strong>参考图片</strong><span>{imageUrls.length}/16</span></div> : null}
      <div className="canvas-image-import-actions">
        <label className={mediaBusy || (isGptImageV2 && imageUrls.length >= 16) ? "is-disabled" : ""}>
          <Upload /><span>{mediaBusy ? "导入中" : "导入图片"}</span>
          <input className="canvas-image-file-input" type="file" accept={isGptImageV2 ? "image/jpeg,image/png" : "image/jpeg,image/png,image/gif,image/webp,image/avif"} multiple disabled={mediaBusy || (isGptImageV2 && imageUrls.length >= 16)} onChange={(event) => {
            const files = Array.from(event.target.files || []);
            event.target.value = "";
            if (files.length) void onImportImages(files);
          }} />
        </label>
        <button type="button" onClick={() => void onPasteImages()} disabled={mediaBusy || (isGptImageV2 && imageUrls.length >= 16)}><ClipboardPaste /><span>粘贴图片</span></button>
      </div>
      {imageUrls.length ? <div className={`canvas-image-preview-list ${isGptImageV2 ? "is-ordered" : ""}`}>{imageUrls.map((url, index) => <div className="canvas-image-preview" key={`${url}-${index}`}>
        <button className="canvas-image-preview-open" type="button" onClick={() => onPreviewImage(url, index)} aria-label={`预览图片 ${index + 1}`} title="预览图片">
          <span style={{ backgroundImage: `url(${JSON.stringify(url)})` }} />
        </button>
        {isGptImageV2 ? <span className="canvas-image-preview-index">图片{index + 1}</span> : null}
        {isGptImageV2 ? <span className="canvas-image-preview-order">
          <button type="button" disabled={index === 0} onClick={() => onChange(imageConfigKey, moveListItem(imageUrls, index, index - 1))} aria-label={`上移图片 ${index + 1}`} title="上移"><ArrowUp /></button>
          <button type="button" disabled={index === imageUrls.length - 1} onClick={() => onChange(imageConfigKey, moveListItem(imageUrls, index, index + 1))} aria-label={`下移图片 ${index + 1}`} title="下移"><ArrowDown /></button>
        </span> : null}
        <button className="canvas-image-preview-remove" type="button" onClick={() => onChange(imageConfigKey, imageUrls.filter((_, currentIndex) => currentIndex !== index))} aria-label={`移除图片 ${index + 1}`} title="移除图片"><X /></button>
      </div>)}</div> : null}
    </div> : null}
    {definition.fields.map((field) => {
      if (field.key === "outputCompression" && node.config.outputFormat !== "jpeg") return null;
      if (field.key === "template" && node.config.preset !== "custom") return null;
      if ((field.key === "delimiter" || field.key === "delimiterIndex") && node.config.mode !== "delimiter") return null;
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
      return <label key={field.key}><span>{field.label}</span>
        {field.kind === "textarea" || field.kind === "url-list" ? <textarea value={field.kind === "url-list" && Array.isArray(value) ? value.join("\n") : String(value || "")} placeholder={field.placeholder} onChange={(event) => onChange(field.key, field.kind === "url-list" ? event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) : event.target.value)} />
          : field.kind === "select" ? <select value={String(value || "")} onChange={(event) => {
            const next = event.target.value;
            if (field.key === "resolution" && next === "4k" && !["16:9", "9:16", "2:1", "1:2", "21:9", "9:21"].includes(String(node.config.ratio))) {
              const [width, height] = String(node.config.ratio || "1:1").split(":").map(Number);
              onChange("ratio", width < height ? "9:16" : "16:9");
            }
            onChange(field.key, next);
          }}>{options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          : <input type={field.kind === "number" ? "number" : "text"} min={field.min} max={field.max} value={value === undefined ? "" : String(value)} placeholder={field.placeholder} onChange={(event) => onChange(field.key, field.kind === "number" ? Number(event.target.value) : event.target.value)} />}
      </label>;
    })}
    <div className="canvas-port-list"><span>输入</span>{definition.inputs.length ? definition.inputs.map((port) => <small key={port.id}>{port.label} · {portKindLabel(port.kind)}{port.required ? " · 必填" : ""}</small>) : <small>无</small>}</div>
    <div className="canvas-port-list"><span>输出</span>{definition.outputs.length ? definition.outputs.map((port) => <small key={port.id}>{port.label} · {portKindLabel(port.kind)}</small>) : <small>无</small>}</div>
  </div>;
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
  const [data, setData] = useState<CanvasLibraryAssetPage>({ assets: [], collections: [], total: 0 });
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
      setData(await api<CanvasLibraryAssetPage>(`/api/library/assets?${params}`));
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
  const toggle = (asset: CanvasLibraryAsset) => {
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
      const assets = await Promise.all(ids.map((id) => api<{ asset: CanvasLibraryAsset }>(`/api/library/assets/${encodeURIComponent(id)}`).then((result) => result.asset)));
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

function CanvasScheduleCenter({ workflow, graph, onSaveBindings, onClose, onOpenRuns }: {
  workflow: CanvasWorkflow;
  graph: CanvasGraph;
  onSaveBindings: (bindings: CanvasScheduleBindings) => Promise<CanvasWorkflow | undefined>;
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
          body: JSON.stringify({ action: "save", revision, name: schedule.name, batches: schedule.batches }),
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
        {selected && editable ? <button className="danger" type="button" onClick={() => void removeSchedule()} disabled={busy}><Trash2 />删除</button> : null}
        <span>{editSequence ? "保存中" : "已保存"}</span>
      </div>
      {error ? <div className="canvas-task-error"><AlertTriangle />{error}</div> : null}
      <div className="canvas-schedule-body">
        <nav className="canvas-schedule-list" aria-label="批量任务列表">
          {schedules.map((schedule) => <button type="button" key={schedule.id} className={selected?.id === schedule.id ? "is-selected" : ""} onClick={() => adoptSchedule(schedule)}>
            <StatusIcon status={schedule.status} />
            <span><strong>{schedule.name}</strong><small>{schedule.totalContentTasks} 篇 · {schedule.totalImageTasks} 图 · {formatCanvasRunTime(schedule.updatedAt)}</small></span>
            <em>{canvasScheduleStatusLabel(schedule.status)}</em>
          </button>)}
          {!schedules.length && !busy ? <div className="canvas-task-empty"><ListChecks /><span>当前还没有批量任务</span></div> : null}
        </nav>
        <section className="canvas-schedule-editor">
          <section className="canvas-scheduler-bindings" aria-label="画布绑定">
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
          </section>
          {!selected ? <div className="canvas-task-empty"><Plus /><span>新建一个批量任务</span></div> : <>
            <div className="canvas-schedule-head">
              <input value={selected.name} disabled={!editable} aria-label="批量任务名称" onChange={(event) => patchSelected((schedule) => ({ ...schedule, name: event.target.value }))} />
              <span className={`is-${selected.status}`}>{canvasScheduleStatusLabel(selected.status)}</span>
            </div>
            <div className="canvas-schedule-metrics">
              <div><small>图文任务</small><strong>{selected.totalContentTasks}</strong></div>
              <div><small>图片子任务</small><strong>{selected.totalImageTasks}</strong></div>
              <div><small>画布版本</small><strong>r{selected.workflowRevision}</strong></div>
            </div>
            {editable ? <>
              <div className="canvas-schedule-batches">
                {selected.batches.map((batch, index) => <section className="canvas-schedule-batch" key={batch.id}>
                  <header><strong>{index + 1}. {batch.name}</strong><button type="button" onClick={() => removeBatch(batch.id)} disabled={selected.batches.length === 1} aria-label="删除批次" title="删除批次"><Trash2 /></button></header>
                  <div className="canvas-schedule-fields">
                    <label><span>批次名称</span><input value={batch.name} onChange={(event) => patchBatch(batch.id, { name: event.target.value })} /></label>
                    <label><span>Switch 输入</span><select value={batch.strategy} onChange={(event) => patchBatch(batch.id, { strategy: event.target.value as CanvasScheduleBatch["strategy"] })}>
                      <option value="input-1">输入 1</option><option value="input-2">输入 2</option><option value="input-3">输入 3</option>
                    </select></label>
                  </div>
                  <ScheduleAssetFilterEditor title="场景 / 内容素材" role="reference" filter={batch.sceneFilter} count={batch.sceneCount} onCountChange={(sceneCount) => patchBatch(batch.id, { sceneCount })} onChange={(sceneFilter) => patchBatch(batch.id, { sceneFilter })} />
                  <ScheduleAssetFilterEditor title="车型素材" role="vehicle" filter={batch.vehicleFilter} onChange={(vehicleFilter) => patchBatch(batch.id, { vehicleFilter })} />
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
            </> : <ScheduleRuntimeTree schedule={selected} busy={busy} onAction={(action, payload) => void scheduleAction(action, payload)} />}
          </>}
        </section>
      </div>
    </aside>
  </div>;
}

function ScheduleAssetFilterEditor({ title, role, filter, count, onCountChange, onChange }: {
  title: string;
  role: "reference" | "vehicle";
  filter: CanvasScheduleAssetFilter;
  count?: number;
  onCountChange?: (value: number) => void;
  onChange: (filter: CanvasScheduleAssetFilter) => void;
}) {
  const [data, setData] = useState<CanvasLibraryAssetPage>({ assets: [], collections: [], total: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tagsText = filter.tags.join(", ");
  useEffect(() => {
    const timer = setTimeout(async () => {
      setBusy(true);
      setError("");
      const params = new URLSearchParams({ role, limit: "100" });
      if (filter.search) params.set("search", filter.search);
      if (filter.collectionId) params.set("collectionId", filter.collectionId);
      splitScheduleTags(tagsText).forEach((tag) => params.append("tag", tag));
      try {
        setData(await api<CanvasLibraryAssetPage>(`/api/library/assets?${params}`));
      } catch (loadError) {
        setError(errorMessage(loadError));
      } finally {
        setBusy(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [filter.collectionId, filter.search, tagsText, role]);
  const toggle = (assetId: string) => onChange({
    ...filter,
    assetIds: filter.assetIds.includes(assetId) ? filter.assetIds.filter((id) => id !== assetId) : [...filter.assetIds, assetId],
  });
  return <div className="canvas-schedule-assets">
    <div className="canvas-schedule-assets-head"><strong>{title}</strong><div className="canvas-task-filters"><button type="button" aria-pressed={filter.mode === "manual"} onClick={() => onChange({ ...filter, mode: "manual" })}>手动选择</button><button type="button" aria-pressed={filter.mode === "random"} onClick={() => onChange({ ...filter, mode: "random" })}>条件随机</button></div></div>
    <div className="canvas-schedule-filter-row">
      <label><Search /><input value={filter.search} onChange={(event) => onChange({ ...filter, search: event.target.value })} placeholder="关键字" /></label>
      <select value={filter.collectionId || ""} onChange={(event) => onChange({ ...filter, collectionId: event.target.value || undefined })}><option value="">全部集合</option>{data.collections.map((collection) => <option value={collection.id} key={collection.id}>{collection.name}</option>)}</select>
      <input value={tagsText} onChange={(event) => onChange({ ...filter, tags: splitScheduleTags(event.target.value) })} placeholder="多个标签，AND" />
      {count !== undefined && filter.mode === "random" ? <label className="canvas-schedule-count"><span>抽取</span><input type="number" min={1} max={500} value={count} onChange={(event) => onCountChange?.(Number(event.target.value))} /></label> : null}
    </div>
    <div className="canvas-schedule-asset-grid">{data.assets.slice(0, 30).map((asset) => <button type="button" key={asset.id} className={filter.assetIds.includes(asset.id) ? "is-selected" : ""} onClick={() => filter.mode === "manual" && toggle(asset.id)} disabled={filter.mode === "random"} title={asset.name}>
      <Image src={asset.publicUrl} alt="" width={88} height={64} unoptimized referrerPolicy="no-referrer" /><span>{asset.name}</span>{filter.mode === "manual" && filter.assetIds.includes(asset.id) ? <CheckCircle2 /> : null}
    </button>)}</div>
    <small className="canvas-schedule-pool-count">{busy ? "正在筛选" : `匹配 ${data.total} 张${filter.mode === "manual" ? ` · 已选 ${filter.assetIds.length} 张` : ""}`}</small>
    {error ? <p className="canvas-picker-error">{error}</p> : null}
  </div>;
}

function ScheduleCopyFilterEditor({ filter, onChange, onDisable }: {
  filter: CanvasScheduleCopyFilter;
  onChange: (filter: CanvasScheduleCopyFilter) => void;
  onDisable: () => void;
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
        if (filter.mode === "tags") filter.tags.forEach((tagValue) => params.append("tag", tagValue));
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
    entryIds: filter.entryIds.includes(entryId) ? filter.entryIds.filter((id) => id !== entryId) : [...filter.entryIds, entryId],
  });
  return <div className="canvas-schedule-assets canvas-schedule-copy-pool">
    <div className="canvas-schedule-assets-head"><strong>文案池</strong><div className="canvas-task-filters"><button type="button" aria-pressed={filter.mode === "manual"} onClick={() => onChange({ ...filter, mode: "manual" })}>手动选择</button><button type="button" aria-pressed={filter.mode === "tags"} onClick={() => onChange({ ...filter, mode: "tags" })}>条件随机</button><button type="button" onClick={onDisable}>停用</button></div></div>
    <div className="canvas-schedule-filter-row">
      <label><Search /><input value={filter.search} onChange={(event) => onChange({ ...filter, search: event.target.value })} placeholder="搜索文案" /></label>
      <input value={tagsText} disabled={filter.mode !== "tags"} onChange={(event) => onChange({ ...filter, tags: splitScheduleTags(event.target.value) })} placeholder="多个标签，AND" />
    </div>
    <div className="canvas-schedule-copy-list">{data.entries.slice(0, 50).map((entry) => <button type="button" key={entry.id} className={filter.entryIds.includes(entry.id) ? "is-selected" : ""} onClick={() => filter.mode === "manual" && toggle(entry.id)} disabled={filter.mode === "tags"}>
      <BookOpenText /><span><strong>{entry.title}</strong><small>{entry.tags.join(" · ") || "无标签"}</small></span>{filter.mode === "manual" && filter.entryIds.includes(entry.id) ? <CheckCircle2 /> : null}
    </button>)}</div>
    <small className="canvas-schedule-pool-count">{busy ? "正在筛选" : filter.mode === "manual" ? `匹配 ${data.entries.length} 篇 · 已选 ${filter.entryIds.length} 篇 · 批次内随机去重` : `条件匹配 ${data.entries.length} 篇 · 批次内随机去重`}</small>
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
  const [zoom, setZoom] = useState(1);
  const [naturalSize, setNaturalSize] = useState(preview.width && preview.height ? { width: preview.width, height: preview.height } : undefined);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const updateZoom = useCallback((next: number | ((current: number) => number)) => {
    setZoom((current) => {
      const value = typeof next === "function" ? next(current) : next;
      return Math.min(imagePreviewMaxZoom, Math.max(imagePreviewMinZoom, value));
    });
  }, []);

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
  }, [onClose]);

  const zoomPercent = Math.round(zoom * 100);
  const canvasSize = `${Math.max(100, zoomPercent)}%`;
  const imageLimit = `${92 / Math.max(1, zoom)}%`;

  return <div className="canvas-image-viewer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="canvas-image-viewer" role="dialog" aria-modal="true" aria-labelledby="canvas-image-viewer-title">
      <header>
        <div><ImageIcon /><strong id="canvas-image-viewer-title">图片 {preview.index + 1}</strong>{naturalSize ? <small>{naturalSize.width}×{naturalSize.height}</small> : null}</div>
        <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="关闭图片预览" title="关闭"><X /></button>
      </header>
      <div className="canvas-image-viewer-stage" onWheel={(event) => {
        event.preventDefault();
        updateZoom((current) => current + (event.deltaY < 0 ? imagePreviewZoomStep : -imagePreviewZoomStep));
      }}>
        <div className="canvas-image-viewer-canvas" style={{ width: canvasSize, height: canvasSize }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="canvas-image-viewer-image"
            src={preview.url}
            alt={`图片 ${preview.index + 1} 预览`}
            width={preview.width}
            height={preview.height}
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
        <a href={preview.url} target="_blank" rel="noreferrer" aria-label="打开原图" title="打开原图"><ExternalLink /></a>
      </footer>
    </section>
  </div>;
}

function ToolbarButton({ label, icon, onClick, disabled, danger, ariaKeyShortcuts }: { label: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean; ariaKeyShortcuts?: string }) {
  return <button className={danger ? "danger" : ""} type="button" onClick={onClick} disabled={disabled} title={label} aria-keyshortcuts={ariaKeyShortcuts}>{icon}<span>{label}</span></button>;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 />;
  if (status === "queued" || status === "running") return <LoaderCircle className={status === "running" ? "animate-spin" : ""} />;
  return <AlertTriangle />;
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
      style: { "--canvas-edge-color": edgeColor || "var(--accent)" } as React.CSSProperties,
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
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function configStringList(value: CanvasNode["config"][string]) {
  return Array.isArray(value) ? value.map((item) => item.trim()) : [];
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

function clipboardDataImageFiles(data: DataTransfer) {
  const itemFiles = Array.from(data.items)
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
  return itemFiles.length ? itemFiles : Array.from(data.files).filter((file) => file.type.startsWith("image/"));
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

function edgeAnimationDelay(edgeId: string) {
  let hash = 0;
  for (let index = 0; index < edgeId.length; index += 1) hash = ((hash << 5) - hash + edgeId.charCodeAt(index)) | 0;
  return -(Math.abs(hash) % 1800) / 1000;
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
    const assetNames = Array.isArray(node.config.assetNames) ? node.config.assetNames : [];
    const definition = getCanvasNodeDefinition(node.type, node.version);
    return {
      id: node.id,
      label: node.label?.trim() || assetNames[0]?.trim() || `${definition?.label || node.type} ${index + 1}`,
    };
  });
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
function portKindLabel(kind: CanvasPortKind) { return ({ any: "任意", text: "文字", images: "图片", videos: "视频", socialPost: "内容", publishJobRef: "发布任务" } as Record<CanvasPortKind, string>)[kind]; }
function iconForNode(type: CanvasNodeType) {
  const props = { className: "h-4 w-4" };
  if (type === "input.text") return <Type {...props} />;
  if (type === "input.images") return <ImageIcon {...props} />;
  if (type === "input.videos") return <Video {...props} />;
  if (type === "input.content-pool") return <Layers3 {...props} />;
  if (type === "input.library-images") return <Images {...props} />;
  if (type === "input.copy-library") return <BookOpenText {...props} />;
  if (type === "model.gpt-text") return <Sparkles {...props} />;
  if (type === "model.gpt-image") return <WandSparkles {...props} />;
  if (type === "model.gpt-vision") return <Search {...props} />;
  if (type === "model.seedance") return <Clapperboard {...props} />;
  if (type === "utility.image-preview") return <Images {...props} />;
  if (type === "utility.display-any") return <Eye {...props} />;
  if (type === "utility.prompt-template") return <FileText {...props} />;
  if (type === "utility.prompt-switch") return <GitBranch {...props} />;
  if (type === "utility.text-split") return <Scissors {...props} />;
  if (type === "utility.image-select") return <ImageIcon {...props} />;
  if (type === "utility.image-transform") return <Maximize2 {...props} />;
  if (type === "utility.video-frames") return <Clapperboard {...props} />;
  if (type === "compose.social-post") return <PanelsTopLeft {...props} />;
  return <Send {...props} />;
}
