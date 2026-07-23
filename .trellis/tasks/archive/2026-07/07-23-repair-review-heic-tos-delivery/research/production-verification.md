# Production Verification

- Commit: `2fef2e56fc1b7577cf15358e38238839a1794cae`
- Release: `20260723-062301-2fef2e56fc1b`
- Target: production 38
- Health: application and PostgreSQL healthy; loopback and public config HTTP 200; Nginx active/config valid; Open WebUI unchanged and healthy.
- Backup: root-only `generated_posts` full-table SQL dump, 1,461,859 bytes, SHA-256 `0bc1605dceb397ba432e4185b75529291307825be3c4a9e7df0b847063db7a5d`.
- Repair scan: 9 candidate posts and 37 exact-match external image references.
- Repair apply: 7 posts and 33 images repaired; 4 images across 3 posts remained unchanged with explicit errors (three exceeded the 12 MB download limit; one returned `HEIF image not found`).
- Known post `post-weibo-5323449501221053-1784778608735`: 9 TOS images, 0 Sina image URLs. All nine returned HTTP 200 `image/jpeg`, valid JPEG headers, non-zero dimensions, and direct native Volcengine TOS hosts without `/api/media/proxy`.
- No TikHub, text/image model, Feishu, ComfyUI, transcription, or other paid service was called by deployment, repair, or verification.
