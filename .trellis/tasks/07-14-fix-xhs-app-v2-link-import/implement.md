# Implementation

- [x] Replace obsolete Xiaohongshu Web endpoint constants/builders with App V2 image/video detail builders.
- [x] Route source-link import and keyword detail enrichment through a shared App V2 detail resolver.
- [x] Add TikHub HTTP-200 business-envelope validation with compact redacted errors.
- [x] Replace obsolete endpoint assertions with App V2 builders, fixtures, failure cases, and negative checks.
- [x] Run focused verification, type-check, lint, build, and full Trellis baseline.
- [x] Capture the endpoint-migration prevention rule and update current Trellis status/evidence.
- [ ] Commit, push `main`, ensure VPS queues are idle, and deploy exactly once.
- [ ] Run one controlled VPS source-link task with Feishu publishing disabled.
