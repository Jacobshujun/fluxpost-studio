# Design

Use a Windows-native process launcher, loaded through PowerShell Add-Type,
to start the existing Node supervisor with no console and explicit Job
breakaway when its parent is in a Job. Create suspended, verify the child
belongs to no Job, then resume. Never retry inside the parent Job. Startup
failure terminates only the suspended process created by the helper.

Use explicit executable/cwd and correctly quoted argv, inherit environment,
and restrict inherited handles to NUL stdin/stdout plus the existing supervisor
stderr log using STARTUPINFOEX's handle list. No secrets are serialized.
Return the supervisor Process object so existing readiness/rollback code works.

Before listener replacement run a harmless Node exit probe using the same
helper. This tests actual breakaway permissions and file/handle setup. A
failure preserves the old listener. Candidate and rollback share the helper.

Regression uses the actual Start-CandidateServer function with stubbed HTTP
and smoke and a harmless real supervised child. An owned kill-on-close Job
is closed while the child is active; child must complete and supervisor must
write its exit receipt. A restrictive Job verifies rejection before payload
execution. Preserve existing local diagnostic tests; raise their V8 probe
expectation to 24 GiB. Production data/services are not used.
