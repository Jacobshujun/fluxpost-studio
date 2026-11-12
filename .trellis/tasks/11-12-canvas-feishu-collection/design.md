# Design

Use `platform=feishu` with existing `links` and per-task `sourceLink` fields, preserving graph and scheduler shapes. Feishu labels identify numbers. Reset single-test selection when platform or list changes.

The Canvas collection service branches before platform-link dispatch. Feishu calls `importFeishuContentByTaskNumbers` for exactly one identifier, rejects missing/ambiguous results, applies current safety policy and optional tagging, and ingests with the authenticated actor into the configured Canvas project. Return existing five ports using cached media. Existing links retain their current service.

V2 keeps binding `sourceLink` and freezing all five ports. Update source wording to cover links and numbers. Target configuration resolves in the server import service; workflows contain no Base tokens or secrets.

Verification mocks external reads, tagging and persistence. Browser runs on worker-disabled loopback 45678 only. Rollback is the scoped commit with local configuration retained.
