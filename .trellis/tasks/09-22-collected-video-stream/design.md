# Design

Shared quality selection excludes explicit audio metadata and known separate-track URLs before deduplication. Both TikHub normalization and cache candidate ordering use this policy. FFprobe validates a real non-attached video stream with positive dimensions before a cached or newly downloaded video is accepted. Invalid cached media is replaced through the normal download path; freshly validated staging files overwrite stale durable objects.

Read-only incident evidence: latest video workflow failed at media-mask with no valid video stream; probing the collected MP4 showed only AAC audio. The selected source used the Douyin DASH play endpoint. Runtime identifiers and source URLs stay out of task artifacts.
