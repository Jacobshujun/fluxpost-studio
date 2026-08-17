# Design

## Duration And Audio

Probe the first audio stream with ffprobe. Compute the normal target from image count, then cap it at the source audio duration. Pass this value explicitly through timeline, filter graph, FFmpeg input, output, and validation functions. Remove all audio looping.

## Beat Timeline

Decode only the target window to mono 16 kHz PCM. Build a 20 ms RMS envelope, smooth it, subtract a local median baseline, and normalize positive novelty using robust percentiles. Extract locally prominent peaks with a refractory interval. Select all required cuts as one ordered plan using candidate strength plus deviation from each ideal slot, while enforcing start/end guards and 0.65 second spacing. Use frame-aligned uniform cuts only when reliable candidates cannot fill a safe plan.

## Visual Plan

Assign every cut a deterministic effect from a weighted smooth pool. Avoid immediate effect repetition and opposite directional transitions. Stronger onsets receive shorter fades. Compose each image over its blurred background, then apply a stable 2%-5% zoom/pan expression before xfade. Each xfade starts half its duration before the selected beat so the visual midpoint lands on the beat.

## Compatibility And Rollback

Keep the current temporary filter/output files and atomic output replacement. Upgrade the encoder comment tag to invalidate old results. No application data migration is involved.
