# Bug analysis: omitted rich-text video insert

## 1. Root cause category
Implicit assumption and test coverage gap: the previous strict rich-text parser accepted only text, images and mentions, rejecting valid video inserts before attachment normalization.

## 2. Why the previous fix was incomplete
The original incident was an image article. Its fixture did not exercise video or mixed media even though the importer already supports video sources. The newly added exhaustive rejection exposed this omission.

## 3. Prevention mechanisms
P0 completed: add fixtures for inline video in referenced rich text, mixed paragraphs/images/video, video-only posts, duplicate attachment/inline URLs, attachment quality ranking, cover exclusion and invalid/unknown nodes. Verify the reported public video page and previous image page without downstream network/media writes.

## 4. Systematic expansion
Both inline and attachment video candidates now use existing quality ranking. Normalized media preserves every unique video URL; cache/download still handles one primary video by the existing contract. No generic unknown-node skipping was added. Future rich-text extensions must consider every media type already supported by the downstream importer.

## 5. Knowledge capture
Update the Xiaopeng pitfall with the valid video node contract and mixed-media regression requirement. This application has no generated spec-template tree to synchronize.
