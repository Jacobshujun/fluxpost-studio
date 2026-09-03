# 修复缺失源文本导致的伪造文案与车型串线

## Goal

Prevent crawled items with missing or ambiguous title/body fields from being turned into invented complete posts or unrelated vehicle-specific copy.

## Requirements

- Normalize Weibo and other provider records without treating body text as an implicit title.
- Rewrite only source fields that are present; missing title/body fields remain empty.
- Skip text-provider calls when both source text fields are empty.
- Remove Xpeng/vehicle-specific local title fallbacks and generic car-only image fallback wording.
- Keep incomplete drafts editable but reject them at text-only Feishu publish preflight.

## Acceptance Criteria

- [ ] Weibo body-only records normalize with an empty title.
- [ ] Body-only, title-only, and empty-source generation produce only the permitted fields.
- [ ] Model output cannot populate a field that was absent from the source.
- [ ] No API-key fallback returns fixed demo title/body for an incomplete source.
- [ ] Title repair fallback never invents a vehicle or default Xpeng title.
- [ ] Offline verification, lint, TypeScript, and build pass.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
