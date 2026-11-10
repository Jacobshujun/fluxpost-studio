# Design

Register utility.switch-any@1 with config.index=0, any value inputs/output and optional text index input. Generate valid value port IDs through the existing graph edge budget plus a spare; visible ports derive from highest connected ID. Registry remains the shared port truth for UI, graph and serialization.

Pure switch selection/validation is shared by executor and bypass. Preserve connected-but-missing index information when collecting inputs. Allow any output connections but retain concrete/visual rules; validate actual artifacts before execute/reuse/bypass, and at executor entry. Keep graph dependency traversal unchanged.

Bypass selects using the same resolver; preflight resolves manual routing and defers connected index selection until runtime. Iteration allowlist includes the new node; any outputs may be selected as text/images with runtime aggregate type checks.

Custom compact index port row uses existing config callbacks/history/autosave/updateNodeInternals. No duplicate editable inspector field. No database migration or API routes. Rollback is code-only; saved new-node workflows require the new release.
