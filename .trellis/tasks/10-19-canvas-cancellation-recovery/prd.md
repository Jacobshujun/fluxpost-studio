# Canvas cancellation and queue recovery

## Problem

Cancelled schedules return to running, abandoned collection runs never acknowledge cancellation, and image processing can occupy every Canvas execution slot while later schedules wait.

## Required behavior

- Cancellation closes queued/abandoned work and preserves successful outputs and existing publishing receipts.
- Running image operations and resource waiters can stop without leaving detached processing or fake free capacity.
- Reconciliation and late writes cannot revive cancelled schedules/runs/nodes or launch downstream work.
- Current incident can recover locally without replaying completed generation or publishing, or bulk-cleaning unrelated historical work.
- Verify isolated regression tests, baseline, types/build and local activation with the existing clean candidate protocol.

## Scope

Cancellation persistence, execution cancellation, bounded isolated image encoding, scoped incident recovery and local delivery. General queue fairness redesign and broad historical cleanup are excluded.
