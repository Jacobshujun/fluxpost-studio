# Design

Launch one small Node supervisor from the existing PowerShell candidate starter.
It directly spawns the existing Next CLI with the same host, port, cwd and env;
no shell/npm intermediary hides the server exit code. It pipes both output
streams to bounded binary log segments with timestamp/stream prefixes and
records lifecycle events in the same log plus a small current-run receipt.

Store artifacts only under ignored `data/local-diagnostics/`: `logs/`,
`reports/`, `current-run.json`, and a supervisor stderr file containing at most
one runtime logging failure notice per launch. Ten log segments of 10 MiB each
enforce the agreed 100 MiB limit, including many low-output starts. Keep at most
three Node reports, seven days, and 30 MiB total after startup/child-exit pruning;
a newly generated native report can temporarily exceed this budget.

Fatal reports use Node CLI flags for fatal/uncaught errors with env/network
excluded. Do not use NODE_OPTIONS (which would affect unrelated build/provider
children). No inspector, heap snapshots, signal-based reports or periodic
memory/resource polling. No restarts. The latest receipt is diagnostic only;
the existing candidate receipt remains the release authority.

Preflight verifies writable log/report directories and retention before stopping
3001. Runtime log I/O failure is reported once to supervisor stderr and receipt
where possible; it must not kill an active business operation. New and rollback
starts both use this supervisor. Health/identity checks still gate activation.
Tests invoke the supervisor with isolated benign Node fixture children only;
the public CLI always targets this project's Next CLI.
