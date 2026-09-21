# Runtime synchronization verification

- Requested and exactly matched 726 distinct source numbers in 15 bounded batches.
- Synchronized all 726 numbers to 724 distinct local team-visible entries.
- Created 708 entries, merged tags for 10 existing matches, and reused 8 matches.
- Two over-limit bodies were truncated only after explicit user authorization,
  using the application's existing `truncateFinishedBody` implementation.
- Final committed-state verification matched every expected title, body, vehicle
  tag and visibility against the local PostgreSQL records. No unresolved exceptions.
- Private source payloads, mutation receipts and the complete report remain under
  ignored runtime data. No tokens or user content are copied into Trellis.
- This was a data-only operation. No application code/configuration, remote records,
  listener or deployment changed; development baseline was not applicable.
