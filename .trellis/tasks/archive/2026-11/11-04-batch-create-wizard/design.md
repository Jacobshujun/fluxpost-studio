# Design system
Reuse existing globals.css theme tokens, system typography and lucide icons. Four-step navigation, central form and right summary at desktop; single column with collapsible summary at narrow widths. Form labels and body text 14px or larger in the guided surface, controls at least 40px tall. Keep advanced configuration in native details sections and visible nondefault summaries. No generated imagery is needed for this operational interface.

## Architecture and data flow

The `/batch-create` client owns wizard steps, selected task and request state. Shared source editors, presets, previews, runtime controls and helpers live in `src/components/canvas-schedule/shared.tsx`; the original Canvas imports the same implementation. Executor, queue, persistence and ownership checks are unchanged.

Workflow/schedule lists lead to ID-scoped details. Explicit saves submit the current revision, preflight returns a preview revision, and launch submits both. Editing clears the preview token and stale expansion locally. Requests are mutually exclusive. Conflicts remain visible and require explicit reload. Status refresh uses sequential requests only for queued/running/paused tasks; stale responses cannot replace a different selection or a newer action response.

Definitions remain `CanvasScheduleV2Definition`. Source snapshots, Excel sources, separator metadata, inner bindings, sampling ranges and shared outputs survive unrelated edits. The wizard requires an explicit compatible input binding. Directory groups read already-scanned snapshots and preserve structured values. No database migration or API payload change.

## Compatibility and delivery

V2 drafts can be edited in either interface. V1 records link to the original scheduler using workflowId, panel=schedules and scheduleId. Runtime uses existing pause/resume/cancel/retry/accept operations. Results expose text/image/video previews and review/download links. Loading/configuring never launches external generation.

Missing bindings, blank inputs, invalid outputs, version conflicts and API errors are explicit. Launch requires a ready preview. Dirty navigation asks before discarding. Browser checks intercept APIs/media; isolated fixtures and a worker-disabled smoke server handle verification. The application candidate stays in the primary worktree on 3001. Rollback reverses page/navigation/shared extraction without data migration.
