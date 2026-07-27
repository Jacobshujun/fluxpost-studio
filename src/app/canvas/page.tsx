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
  CheckCircle2,
  Clapperboard,
  ClipboardPaste,
  Copy,
  CopyPlus,
  FileText,
  ExternalLink,
  Home,
  Image as ImageIcon,
  Images,
  Layers3,
  LoaderCircle,
  Maximize2,
  Menu,
  EllipsisVertical,
  PanelRight,
  PanelsTopLeft,
  Play,
  Plus,
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
import { getStoredTheme, subscribeTheme } from "@/lib/theme";
import type { ContentPoolSnapshot, NormalizedSourceItem } from "@/lib/types";
import type {
  CanvasArtifact,
  CanvasArtifactKind,
  CanvasEdge,
  CanvasGraph,
  CanvasLatestSuccessfulNodeRun,
  CanvasNode,
  CanvasNodeExecutionMode,
  CanvasNodeRun,
  CanvasNodeType,
  CanvasPortDefinition,
  CanvasRun,
  CanvasRunMode,
  CanvasRunPlan,
  CanvasRunWithNodes,
  CanvasWorkflow,
} from "@/lib/canvas/types";

type FlowNode = Node<{ canvasNode: CanvasNode }, "canvasNode">;
type FlowEdge = Edge;
type ConfirmationState = { plan: CanvasRunPlan; targetNodeIds?: string[]; runMode: CanvasRunMode } | null;
type QuickAddConnection = { nodeId: string; portId: string; handleType: "source" | "target"; kind: CanvasArtifactKind; multiple?: boolean };
type QuickAddState = { screen: { x: number; y: number }; position: { x: number; y: number }; connection?: QuickAddConnection } | null;
type QuickAddChoice = { definition: (typeof canvasNodeDefinitions)[number]; port?: CanvasPortDefinition };
type CanvasLibraryAsset = { id: string; name: string; publicUrl: string };
type CanvasLibraryAssetPage = {
  assets: CanvasLibraryAsset[];
  collections: Array<{ id: string; name: string }>;
  total: number;
};
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

export default function CanvasPage() {
  const [workflows, setWorkflows] = useState<CanvasWorkflow[]>([]);
  const [activeWorkflow, setActiveWorkflow] = useState<CanvasWorkflow | null>(null);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [runs, setRuns] = useState<CanvasRun[]>([]);
  const [activeRun, setActiveRun] = useState<CanvasRunWithNodes>();
  const [latestSuccessfulNodeRuns, setLatestSuccessfulNodeRuns] = useState<Map<string, CanvasLatestSuccessfulNodeRun>>(new Map());
  const [message, setMessage] = useState("正在载入画布...");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationState>(null);
  const [mobilePalette, setMobilePalette] = useState(false);
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
  const dirtyVersionRef = useRef(0);
  const connectionStartRef = useRef<QuickAddConnection | null>(null);

  const selectedFlowNode = nodes.find((node) => node.id === selectedNodeId);
  const selectedCanvasNode = selectedFlowNode?.data.canvasNode;
  const latestNodeRuns = useMemo(() => latestAttempts(activeRun?.nodeRuns || []), [activeRun?.nodeRuns]);
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
  const focusCanvasNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);
  const nodeInteraction = useMemo<CanvasNodeInteraction>(() => ({
    activeRun,
    latestNodeRuns,
    latestSuccessfulNodeRuns,
    selectedNodeId,
    workflowRevision: activeWorkflow?.revision,
    onConfigChange: updateNodeConfig,
    onExecutionModeChange: updateNodeExecutionMode,
    onNodeFocus: focusCanvasNode,
    onPreview: setPreview,
  }), [activeRun, activeWorkflow?.revision, focusCanvasNode, latestNodeRuns, latestSuccessfulNodeRuns, selectedNodeId, updateNodeConfig, updateNodeExecutionMode]);

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
    activeWorkflowIdRef.current = workflow.id;
    loadRunsRequestRef.current += 1;
    setActiveWorkflow(workflow);
    setNodes(toFlowNodes(workflow.graph.nodes));
    setEdges(toFlowEdges(workflow.graph.edges, workflow.graph.nodes));
    setViewport(workflow.graph.viewport);
    setSelectedNodeId(undefined);
    setRuns([]);
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
    if (connection && port && connection.kind !== port.kind) {
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
    setNodes((current) => [...current, toFlowNode(canvasNode)]);
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
    const pastedNodes = fragment.nodes.map((node) => ({ ...toFlowNode(node), selected: true }));
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
        setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), { ...toFlowNode(canvasNode), selected: true }]);
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
    setNodes((current) => applyNodeChanges(changes, current));
    if (changes.some((change) => change.type !== "select")) markDirty();
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
    if (!output || !input || output.kind !== input.kind) {
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
      if (data.plan.capabilities.length) setConfirmation({ plan: data.plan, targetNodeIds, runMode });
      else await startRun(data.plan, targetNodeIds, runMode);
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
      setConfirmation(null);
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
      setRuns(data.runs);
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

  async function refreshRun(runId: string, expectedWorkflowId = activeWorkflowIdRef.current) {
    try {
      const data = await api<CanvasRunWithNodes>(`/api/canvas/runs/${runId}`);
      if (!expectedWorkflowId || activeWorkflowIdRef.current !== expectedWorkflowId || data.run.workflowId !== expectedWorkflowId) return;
      setRuns((current) => mergeRunHistory(current, data.run));
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
      if (isMobile || isEditableClipboardTarget(event.target)) return;
      if (event.key === "Tab" && activeWorkflow) {
        event.preventDefault();
        const point = canvasPointerRef.current || stageCenter(stageRef.current);
        openQuickAdd(point.x, point.y);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
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
          <button type="button" onClick={() => void copySelectedNodes()} disabled={isMobile || !getSelectedNodeIds().length} aria-label="复制节点" title="复制节点"><Copy /></button>
          <button type="button" onClick={() => void copySelectedNodes(true)} disabled={isMobile || !getSelectedNodeIds().length} aria-label="剪切节点" title="剪切节点"><Scissors /></button>
          <button type="button" onClick={() => void pasteFromSystemClipboard()} disabled={isMobile || !activeWorkflow || mediaBusy} aria-label="粘贴" title="粘贴"><ClipboardPaste /></button>
          <button type="button" onClick={duplicateSelectedNodes} disabled={isMobile || !getSelectedNodeIds().length} aria-label="创建节点副本" title="创建节点副本"><CopyPlus /></button>
          <button type="button" onClick={removeSelectedNodes} disabled={isMobile || !getSelectedNodeIds().length} aria-label="删除节点" title="删除节点"><Trash2 /></button>
        </div>
        <div className="canvas-toolbar-actions">
          <ToolbarButton label="新建" icon={<Plus />} onClick={createWorkflow} disabled={busy} />
          <ToolbarButton label="保存" icon={busy ? <LoaderCircle className="animate-spin" /> : <Save />} onClick={() => void saveWorkflow()} disabled={!activeWorkflow || busy} />
          <ToolbarButton label="复制" icon={<Copy />} onClick={() => void duplicateWorkflow()} disabled={!activeWorkflow || busy} />
          <ToolbarButton label="存为模板" icon={<FileText />} onClick={() => void duplicateWorkflow(true)} disabled={!activeWorkflow || busy} />
          <ToolbarButton label="删除" icon={<Trash2 />} onClick={() => void removeWorkflow()} disabled={!activeWorkflow || busy} danger />
        </div>
        <button className="canvas-icon-button canvas-mobile-menu" type="button" onClick={() => setMobilePalette(true)} aria-label="打开节点库"><Menu className="h-4 w-4" /></button>
      </header>

      <section className="canvas-workspace">
        <aside className={`canvas-palette ${mobilePalette ? "canvas-palette-open" : ""}`}>
          <div className="canvas-pane-heading"><span>节点库</span><button type="button" onClick={() => setMobilePalette(false)} aria-label="关闭节点库"><X /></button></div>
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
            nodes={nodes}
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
            panOnDrag
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
            onImportImages={(files) => importImageFiles(files, selectedCanvasNode.id)}
            onPasteImages={() => pasteFromSystemClipboard(selectedCanvasNode.id)}
            onPreviewImage={openImagePreview}
            mediaBusy={mediaBusy}
          /> : <div className="canvas-inspector-empty">选择节点查看参数与端口</div>}
        </aside>
      </section>

      <section className="canvas-run-dock">
        <div className="canvas-run-actions">
          <button type="button" onClick={() => void requestRun()} disabled={!activeWorkflow || !nodes.length || busy}><Play />运行全部</button>
          <button type="button" onClick={() => selectedNodeId && void requestRun([selectedNodeId], "isolated")} disabled={!selectedNodeId || busy}><Square />仅运行此节点</button>
          <button type="button" onClick={() => selectedNodeId && void requestRun([selectedNodeId], "with-upstream")} disabled={!selectedNodeId || busy}><Play />运行到此节点</button>
          {activeRun && !terminalStatuses.has(activeRun.run.status) ? <button type="button" onClick={() => void runAction("cancel")} disabled={busy}><X />取消</button> : null}
        </div>
        <div className="canvas-message"><span className={dirty ? "is-dirty" : ""} />{message}</div>
        <select className="canvas-run-select" value={activeRun?.run.id || ""} onChange={(event) => {
          if (!event.target.value) return;
          selectedRunIdRef.current = event.target.value;
          runSelectionIsExplicitRef.current = true;
          void refreshRun(event.target.value);
        }}>
          <option value="">运行记录</option>
          {runs.map((run) => <option key={run.id} value={run.id}>r{run.workflowRevision} · {run.status} · {new Date(run.createdAt).toLocaleString()}</option>)}
        </select>
        {activeRun ? <RunSummary value={activeRun} onRetry={(nodeId) => void runAction("retry", nodeId)} /> : null}
      </section>

      {confirmation ? <ConfirmationDialog state={confirmation} onCancel={() => setConfirmation(null)} onConfirm={() => void startRun(confirmation.plan, confirmation.targetNodeIds, confirmation.runMode)} busy={busy} /> : null}
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
  const portRows = Array.from({ length: Math.max(definition.inputs.length, definition.outputs.length, 1) }, (_, index) => ({
    input: definition.inputs[index],
    output: definition.outputs[index],
  }));
  return <div className={`canvas-node ${selected || interaction?.selectedNodeId === node.id ? "canvas-node-selected" : ""} ${executionMode === "bypass" ? "canvas-node-bypassed" : ""} ${executionMode === "disabled" ? "canvas-node-disabled" : ""}`} style={{ "--node-color": definition.color } as React.CSSProperties}>
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
    {node.type === "input.text" ? <textarea
      className="canvas-node-text-editor nodrag nopan nowheel"
      value={String(node.config.text || "")}
      placeholder="输入文字"
      aria-label="文本节点内容"
      onChange={(event) => interaction?.onConfigChange(node.id, "text", event.target.value)}
      onFocus={() => interaction?.onNodeFocus(node.id)}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        event.currentTarget.focus({ preventScroll: true });
        interaction?.onNodeFocus(node.id);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
      onPaste={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
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
    {node.type.startsWith("model.") || ["utility.prompt-template", "utility.text-split", "utility.image-select", "utility.image-transform", "utility.video-frames"].includes(node.type) ? <CanvasModelNodeResult node={node} nodeRun={nodeRun} latestSuccessful={latestSuccessful} historicalRevision={historicalRevision} onPreview={(next) => interaction?.onPreview(next)} /> : null}
    {node.type === "utility.image-preview" ? <CanvasImagePreviewNodeResult nodeRun={nodeRun} latestSuccessful={latestSuccessful} onPreview={(next) => interaction?.onPreview(next)} /> : null}
    {node.type === "compose.social-post" ? <CanvasCompositionNodeResult nodeRun={nodeRun} latestSuccessful={latestSuccessful} /> : null}
    <div className="canvas-node-ports">
      {portRows.map(({ input, output }, index) => <div className="canvas-port-row" key={`${input?.id || "none"}-${output?.id || "none"}-${index}`}>
        {input ? <div className="canvas-port canvas-port-input"><Handle type="target" position={Position.Left} id={input.id} /><span>{input.label}</span></div> : <span />}
        {output ? <div className="canvas-port canvas-port-output"><span>{output.label}</span><Handle type="source" position={Position.Right} id={output.id} /></div> : <span />}
      </div>)}
    </div>
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
  onImportImages,
  onPasteImages,
  onPreviewImage,
  mediaBusy,
}: {
  node: CanvasNode;
  onChange: (key: string, value: string | number | string[]) => void;
  onPatch: (patch: CanvasNode["config"]) => void;
  onExecutionModeChange: (mode: CanvasNodeExecutionMode) => void;
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
      if (field.key === "delimiter" && node.config.mode !== "delimiter") return null;
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
    <div className="canvas-port-list"><span>输入</span>{definition.inputs.length ? definition.inputs.map((port) => <small key={port.id}>{port.label} · {port.kind}{port.required ? " · 必填" : ""}</small>) : <small>无</small>}</div>
    <div className="canvas-port-list"><span>输出</span>{definition.outputs.map((port) => <small key={port.id}>{port.label} · {port.kind}</small>)}</div>
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
    aria-label={state.connection ? `添加可连接的${artifactKindLabel(state.connection.kind)}节点` : "添加节点"}
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
      placeholder={state.connection ? `搜索${artifactKindLabel(state.connection.kind)}兼容节点` : "搜索节点"}
      role="combobox"
      aria-controls="canvas-quick-add-list"
      aria-expanded="true"
    /><button type="button" onClick={onClose} aria-label="关闭节点搜索" title="关闭"><X /></button></div>
    {state.connection ? <div className="canvas-quick-add-context"><span>{state.connection.handleType === "source" ? "连接到输入" : "从输出连接"}</span><strong>{artifactKindLabel(state.connection.kind)}</strong></div> : null}
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

function RunSummary({ value, onRetry }: { value: CanvasRunWithNodes; onRetry: (nodeId: string) => void }) {
  const latest = latestAttempts(value.nodeRuns);
  return <div className="canvas-run-summary">
    <div className="canvas-run-summary-head"><StatusIcon status={value.run.status} /><strong>{value.run.status}</strong><span>revision {value.run.workflowRevision}</span></div>
    <div className="canvas-run-node-list">{Array.from(latest.values()).map((nodeRun) => <div key={nodeRun.id} className={`canvas-run-node is-${nodeRun.status}`}>
      <span>{getCanvasNodeDefinition(nodeRun.nodeType)?.label || nodeRun.nodeType}</span><small>{nodeRun.status} · attempt {nodeRun.attempt}</small>
      {nodeRun.providerTaskId ? <code>{nodeRun.providerTaskId}</code> : null}
      {nodeRun.reusedFrom ? <small>复用 r{nodeRun.reusedFrom.workflowRevision} · {nodeRun.reusedFrom.nodeRunId}</small> : null}
      {nodeRun.error ? <p>{nodeRun.error}</p> : null}
      {Object.values(nodeRun.outputs).map((artifact, index) => <ArtifactPreview key={index} artifact={artifact} />)}
      {["failed", "blocked", "needs_config", "running"].includes(nodeRun.status) ? <button type="button" onClick={() => onRetry(nodeRun.nodeId)}><RotateCcw />重试</button> : null}
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

function ConfirmationDialog({ state, onCancel, onConfirm, busy }: { state: NonNullable<ConfirmationState>; onCancel: () => void; onConfirm: () => void; busy: boolean }) {
  return <div className="canvas-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="canvas-confirm-title"><div className="canvas-confirm-dialog">
    <div><AlertTriangle /><h2 id="canvas-confirm-title">确认外部执行</h2></div>
    <p>本次将执行 {state.plan.confirmationNodeIds.length} 个付费模型或外部写入节点。</p>
    <ul>{state.plan.capabilities.map((capability) => <li key={capability}>{capabilityLabel(capability)}</li>)}</ul>
    {state.plan.confirmationDetails?.map((detail) => <div className="canvas-confirm-detail" key={detail.nodeId}>
      <strong>{detail.label}</strong>
      {detail.model ? <span>{detail.model} · {detail.resolution} · {detail.durationSeconds}s</span> : null}
      {detail.credit !== undefined ? <span>当前额度 {detail.credit}</span> : null}
      {detail.message ? <small>{detail.message}</small> : null}
    </div>)}
    {state.plan.capabilities.includes("video_model") ? <p>Seedance 将在提交前查询额度；低于 100 积分或高合规风险会被阻止。</p> : null}
    <footer><button type="button" onClick={onCancel} disabled={busy}>取消</button><button type="button" className="primary" onClick={onConfirm} disabled={busy || state.plan.preflightBlocked}>{busy ? <LoaderCircle className="animate-spin" /> : <Play />}确认并运行</button></footer>
  </div></div>;
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

function ToolbarButton({ label, icon, onClick, disabled, danger }: { label: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return <button className={danger ? "danger" : ""} type="button" onClick={onClick} disabled={disabled} title={label}>{icon}<span>{label}</span></button>;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 />;
  if (status === "queued" || status === "running") return <LoaderCircle className={status === "running" ? "animate-spin" : ""} />;
  return <AlertTriangle />;
}

function toFlowNodes(nodes: CanvasNode[]) { return nodes.map(toFlowNode); }
function toFlowNode(node: CanvasNode): FlowNode { return { id: node.id, type: "canvasNode", position: node.position, data: { canvasNode: node } }; }
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
    return ports.filter((port) => port.kind === connection.kind).map((port) => ({ definition, port }));
  });
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

async function api<T = { ok: boolean }>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function errorMessage(error: unknown) { return error instanceof Error ? error.message : "操作失败"; }
function categoryLabel(category: string) { return ({ input: "输入", model: "模型", utility: "工具", compose: "组装", publish: "发布" } as Record<string, string>)[category] || category; }
function artifactKindLabel(kind: CanvasArtifactKind) { return ({ text: "文字", images: "图片", videos: "视频", socialPost: "内容", publishJobRef: "发布任务" } as Record<CanvasArtifactKind, string>)[kind]; }
function capabilityLabel(capability: string) { return ({ text_model: "GPT 文本模型", image_model: "GPT-Image-2 图片生成", video_model: "Seedance 视频生成", external_write: "飞书外部写入" } as Record<string, string>)[capability] || capability; }
function iconForNode(type: CanvasNodeType) {
  const props = { className: "h-4 w-4" };
  if (type === "input.text") return <Type {...props} />;
  if (type === "input.images") return <ImageIcon {...props} />;
  if (type === "input.videos") return <Video {...props} />;
  if (type === "input.content-pool") return <Layers3 {...props} />;
  if (type === "input.library-images") return <Images {...props} />;
  if (type === "model.gpt-text") return <Sparkles {...props} />;
  if (type === "model.gpt-image") return <WandSparkles {...props} />;
  if (type === "model.gpt-vision") return <Search {...props} />;
  if (type === "model.seedance") return <Clapperboard {...props} />;
  if (type === "utility.image-preview") return <Images {...props} />;
  if (type === "utility.prompt-template") return <FileText {...props} />;
  if (type === "utility.text-split") return <Scissors {...props} />;
  if (type === "utility.image-select") return <ImageIcon {...props} />;
  if (type === "utility.image-transform") return <Maximize2 {...props} />;
  if (type === "utility.video-frames") return <Clapperboard {...props} />;
  if (type === "compose.social-post") return <PanelsTopLeft {...props} />;
  return <Send {...props} />;
}
