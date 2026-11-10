import { getCanvasNodeDefinition } from "./registry";
import { areCanvasPortKindsCompatible } from "./types";
import type { CanvasArtifact, CanvasNode } from "./types";

/** Check real artifacts, not the source port's potentially polymorphic declaration. */
export function canvasInputTypeError(node: CanvasNode, inputs: Record<string, CanvasArtifact[]>): string | undefined {
  const definition = getCanvasNodeDefinition(node.type, node.version);
  for (const port of definition?.inputs || []) {
    const incompatible = inputs[port.id]?.find((artifact) => !areCanvasPortKindsCompatible(artifact.kind, port.kind));
    if (incompatible) return `${node.label?.trim() || definition?.label || node.type} (${node.id}): 输入 ${port.label} (${port.id}) 需要 ${port.kind}，实际收到 ${incompatible.kind}。`;
  }
  return undefined;
}
