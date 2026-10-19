# Design

- Make cancellation an atomic persistence operation for the run, its unfinished attempts and queue, with terminal-state fences on late writes. Preserve successful attempts/output and ownership checks in the service.
- Track executing run abort controllers in process-global state; pass the signal through executor context to image processing and resource acquisition. Only return a worker slot once its callback actually ends.
- Make pool waiters removable on abort. Separate image CPU admission from source reading/storage, run Sharp encoding in an isolated terminable worker with a bounded deadline, and propagate source/download cancellation. Maintain byte/geometry/cache contracts.
- Preserve cancelled schedule state during reconciliation and fence atomic fan-out/aggregate creation against cancellation. Handle the race between cancelling and starting a run.
- Recover only the incident's requested cancellations and interrupted current runs, preserving completed outputs. Do not automatically replay publishing or clean unrelated historical records.
- Use isolated SQLite and mocked scheduling/executors plus real local image fixtures. Keep live provider and Feishu calls out of automated checks.
