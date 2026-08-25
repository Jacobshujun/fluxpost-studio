# Fix image generation through local Xray

## Goal

Make all FluxPost remote image-provider traffic use the local Xray HTTP proxy at `127.0.0.1:10808`, survive temporary proxy/network outages without losing Canvas work, and expose a free administrator health check with actionable state.

## Background

- The 2026-08-25 13:41 Canvas run reached its GPT vision node, then both configured image routes failed at transport time with `fetch failed`; direct route handshakes timed out.
- The competitor-workbook change did not modify `src/lib/image-generation.ts`, provider profiles, proxy behavior, or the local launcher. Legacy Canvas workflows failed through the same shared GPT image executor.
- Windows currently contains two v2rayN logon tasks. The valid executable is `D:\v2rayN-windows-64\v2rayN.exe`; the other task points to a missing desktop copy. The intended HTTP proxy is loopback-only `127.0.0.1:10808`.

## Requirements

- Add an explicit image-only proxy configuration with default `http://127.0.0.1:10808`. Do not inherit WinINET, `HTTP_PROXY`, `HTTPS_PROXY`, or `NODE_USE_ENV_PROXY`.
- Route provider submission, reference upload/download, task query, result download, and remote image normalization through one image transport. Do not proxy text, database, Feishu, localhost, or ComfyUI traffic.
- Preserve TLS verification and redact proxy/provider credentials from APIs, logs, and errors.
- Classify pre-acceptance network failures as retryable image-network unavailability. Canvas keeps the image node non-terminal, preserves upstream work, requeues after 30 seconds, and displays `等待图片网络恢复`.
- Preserve accepted ToAPIs task identity and GET-only resume. Parameter, safety, authentication, capability, and explicit provider failures remain terminal according to existing contracts.
- Add a free administrator transport-health endpoint and configuration-page status for proxy listening, primary reachability, backup reachability, and duplicate primary/backup origin. The check must not generate images or send authorization.
- At startup, record one credential-safe health result without preventing the app from starting.
- Replace the duplicate v2rayN scheduled tasks with one valid logon task for `D:\v2rayN-windows-64\v2rayN.exe`, configured for restart on failure, then start it and verify loopback port 10808.

## Acceptance Criteria

- [ ] With a mocked unavailable proxy, image-provider traffic returns an actionable network-unavailable classification and Canvas remains running/queued rather than partial or failed.
- [ ] When the mocked proxy recovers, the same Canvas run resumes after 30 seconds and successful upstream results are reused.
- [ ] An accepted ToAPIs task is queried by its existing id and is never resubmitted during recovery.
- [ ] Every remote image fetch in the shared image-generation module uses the explicit image dispatcher; unrelated integrations do not.
- [ ] The admin health endpoint performs only bounded TCP/HTTP transport checks without provider credentials or paid requests.
- [ ] The configuration page distinguishes Xray unavailable, route unavailable, duplicate origins, and healthy routes.
- [ ] One valid v2rayN auto-start task remains, the invalid duplicate is removed, and `127.0.0.1:10808` is listening.
- [ ] Focused image/Canvas checks and the complete deterministic baseline pass; one bounded credential-free live handshake succeeds through Xray.

## Out Of Scope

- Changing image providers, API keys, prompts, production deployment, or production networking.
- Sending a paid image-generation probe as part of automated verification.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
