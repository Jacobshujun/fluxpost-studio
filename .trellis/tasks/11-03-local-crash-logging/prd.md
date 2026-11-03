# Bounded local crash diagnostics

## Requirements

Retain enough evidence to diagnose the two observed exit-134 failures without
unbounded disk growth. The user approved ordinary logs at 10 MiB per file and
100 MiB total; retain at most three fatal reports for seven days. Do not enable
heap snapshots, increase heap limits, restart automatically, or replay jobs.

## Acceptance

- stdout/stderr and lifecycle evidence identify timestamp, SHA, slot, server PID
  and actual Node exit code/signal even after the launcher exits.
- Ordinary output rotates during runtime, including oversized single chunks;
  all retained log segments together stay at most 100 MiB / ten files.
- Fatal reports omit environment/network data, are local/ignored, and are
  pruned on startup and child exit by age/count/size. No heap dump is enabled.
- Existing clean-tree, primary-worktree, inactive build-slot, rollback, version
  identity and worker behavior remain intact.
- Isolated fixtures verify rotation/retention and actual abnormal child exit
  capture; the full baseline passes before commit/activation.
- Check real active jobs before replacing 3001; defer activation if jobs run.
