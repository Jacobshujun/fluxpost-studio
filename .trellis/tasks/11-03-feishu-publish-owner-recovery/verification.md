# Verification

## Owner Divergence Snapshot (before repair, 2026-11-03)

Query:
`generated_posts` joined `runtime_posts` on `id` where `ownerUserId` differs.

Count: 9

| Post | Generated owner | Runtime owner (before) |
| --- | --- | --- |
| post-xiaohongshu-6ae4b0e10000000025018c65-1793611405302 | whitelist:liqiong / 李琼 | acct-1780914293402-dc1c0796 / jacob |
| post-douyin-7702314564889089892-1793611376737 | whitelist:liqiong / 李琼 | acct-1780914293402-dc1c0796 / jacob |
| post-xiaohongshu-6acee582000000001b01c1b3-1793611467821 | whitelist:liqiong / 李琼 | acct-1780914293402-dc1c0796 / jacob |
| canvas-post-1788345813974-9f0bec99 | whitelist:liqiong / 李琼 | acct-1780914293402-dc1c0796 / jacob |
| canvas-post-1788503580430-da14fca7 | whitelist:dailihui / 戴丽慧 | acct-1780914293402-dc1c0796 / jacob |
| post-xiaohongshu-6a809ab2000000002903264a-1788421921386 | whitelist:dailihui / 戴丽慧 | whitelist:liqiong / 李琼 |
| post-douyin-7678980571880554161-1788168709230 | whitelist:liqiong / 李琼 | acct-1780914293402-dc1c0796 / jacob |
| post-xiaohongshu-6a40b550000000001602597b-1784632960457 | whitelist:liqiong / 李琼 | acct-1780914293402-dc1c0796 / jacob |
| post-xiaohongshu-687a1ac40000000017031875-1781576060910 | whitelist:liqiong / 李琼 | acct-1780914293402-dc1c0796 / jacob |

Repair: copy `ownerUserId` / `ownerDisplayName` from `generated_posts.data_json`
into `runtime_posts.data_json` for the mismatched rows only. Idempotent.

## Data Repair Result

- Repaired rows: 9
- Mismatches after repair: 0
- Repair statement touched only `ownerUserId`, `ownerDisplayName` and
  `updated_at` on `runtime_posts`; values were copied from `generated_posts`.

## Checks (2026-11-03)

- `node .trellis/verification/workspace_accounts_check.mjs` — passed.
- `node .trellis/verification/feishu_publish_queue_check.mjs` — passed.
- `node .trellis/verification/feishu_publish_resume_check.mjs` — passed.
- `node .trellis/verification/finished_body_policy_check.mjs` — passed after
  updating its expected review-side-effect call.
- Full baseline `check.ps1` with `TRELLIS_SMOKE_PORT=45678` — passed:
  `Baseline verification passed.`, lint `0 errors, 16 warnings`,
  `TypeScript noEmit`, production config sync, HTTP smoke and SQLite store.

## Activation

- Committed `cb8b3d0dc49774fa48296889f3d8331919100c84`.
- `npm run local` built the inactive slot `.next-local-a` and replaced PID 18092.
- Local smoke passed; `/api/version` reports
  `cb8b3d0dc49774fa48296889f3d8331919100c84`; `/review` and `/content` return 200.
- Slot `.next-local-a`, launcher PID 31476, listener PID 40596.
- LAN activation from clean HEAD `52e1c6d`: slot `.next-local-b`, listener
  `0.0.0.0:3001` (launcher PID 9716, listener PID 33288), smoke passed;
  `/api/version` reports `52e1c6d55cbafb04fbd173575057926988fed242` on loopback
  and LAN; LAN `/review` and `/content` return 200.

## Re-Publish

Pending operator approval.

