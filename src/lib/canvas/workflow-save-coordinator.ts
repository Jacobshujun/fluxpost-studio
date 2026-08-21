export type WorkflowSaveMode = "automatic" | "manual";

export type WorkflowSaveSnapshot<TGraph> = {
  workflowId: string;
  dirtyVersion: number;
  name: string;
  revision: number;
  graph: TGraph;
};

type SavedWorkflow = {
  id: string;
  revision: number;
};

type SaveBatch<TGraph> = {
  snapshot: WorkflowSaveSnapshot<TGraph>;
  mode: WorkflowSaveMode;
  resolve: Array<(saved: boolean) => void>;
};

type WorkflowSaveCoordinatorOptions<TGraph, TResult extends SavedWorkflow> = {
  capture: () => WorkflowSaveSnapshot<TGraph> | undefined;
  save: (snapshot: WorkflowSaveSnapshot<TGraph>) => Promise<TResult>;
  onSavingChange?: (saving: boolean) => void;
  onSaved?: (result: TResult, snapshot: WorkflowSaveSnapshot<TGraph>, mode: WorkflowSaveMode) => void;
  onError?: (error: unknown, snapshot: WorkflowSaveSnapshot<TGraph>, mode: WorkflowSaveMode) => void;
};

export type WorkflowSaveCoordinator = {
  request: (mode: WorkflowSaveMode) => Promise<boolean>;
};

export function createWorkflowSaveCoordinator<TGraph, TResult extends SavedWorkflow>(
  options: WorkflowSaveCoordinatorOptions<TGraph, TResult>,
): WorkflowSaveCoordinator {
  let active: SaveBatch<TGraph> | undefined;
  const pending: SaveBatch<TGraph>[] = [];
  const knownRevisions = new Map<string, number>();
  const automaticBlocked = new Set<string>();
  let draining = false;

  function mergeMode(current: WorkflowSaveMode, incoming: WorkflowSaveMode): WorkflowSaveMode {
    return current === "manual" || incoming === "manual" ? "manual" : "automatic";
  }

  function resolveBatch(batch: SaveBatch<TGraph>, saved: boolean) {
    for (const resolve of batch.resolve) resolve(saved);
  }

  function discardPendingWorkflow(workflowId: string) {
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      if (pending[index].snapshot.workflowId !== workflowId) continue;
      resolveBatch(pending[index], false);
      pending.splice(index, 1);
    }
  }

  async function drain() {
    if (draining) return;
    draining = true;
    options.onSavingChange?.(true);
    try {
      while (pending.length) {
        active = pending.shift();
        if (!active) continue;
        const knownRevision = knownRevisions.get(active.snapshot.workflowId);
        if (knownRevision !== undefined && knownRevision > active.snapshot.revision) {
          active.snapshot = { ...active.snapshot, revision: knownRevision };
        }
        try {
          const result = await options.save(active.snapshot);
          knownRevisions.set(active.snapshot.workflowId, result.revision);
          automaticBlocked.delete(active.snapshot.workflowId);
          options.onSaved?.(result, active.snapshot, active.mode);
          resolveBatch(active, true);
        } catch (error) {
          automaticBlocked.add(active.snapshot.workflowId);
          options.onError?.(error, active.snapshot, active.mode);
          resolveBatch(active, false);
          discardPendingWorkflow(active.snapshot.workflowId);
        } finally {
          active = undefined;
        }
      }
    } finally {
      draining = false;
      options.onSavingChange?.(false);
    }
  }

  function request(mode: WorkflowSaveMode): Promise<boolean> {
    const snapshot = options.capture();
    if (!snapshot) return Promise.resolve(false);
    if (mode === "automatic" && automaticBlocked.has(snapshot.workflowId)) return Promise.resolve(false);
    if (mode === "manual") automaticBlocked.delete(snapshot.workflowId);

    return new Promise<boolean>((resolve) => {
      if (active
        && active.snapshot.workflowId === snapshot.workflowId
        && active.snapshot.dirtyVersion >= snapshot.dirtyVersion) {
        active.mode = mergeMode(active.mode, mode);
        active.resolve.push(resolve);
        return;
      }

      const queued = pending.find((batch) => batch.snapshot.workflowId === snapshot.workflowId);
      if (queued) {
        if (snapshot.dirtyVersion >= queued.snapshot.dirtyVersion) queued.snapshot = snapshot;
        queued.mode = mergeMode(queued.mode, mode);
        queued.resolve.push(resolve);
      } else {
        pending.push({ snapshot, mode, resolve: [resolve] });
      }
      void drain();
    });
  }

  return { request };
}
