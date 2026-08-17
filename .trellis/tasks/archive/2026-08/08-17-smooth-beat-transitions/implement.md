# Implementation

1. Add audio duration probing and duration calculation; parameterize all fixed-duration functions and validation.
2. Replace beat detection and selection with robust onset candidates, safe global cut selection, and deterministic fallback.
3. Replace hard/flash/glitch transitions with the smooth deterministic effect planner.
4. Add stable Ken Burns filter expressions to composed images.
5. Bump encoder metadata and improve plan logging with target duration, shot lengths, strengths, and fallback reason.
6. Parse the script, perform focused null/filter checks, rebuild representative folders, and inspect outputs with ffprobe and frame/scene analysis.
7. Run the FluxPost deterministic baseline, update Trellis status/evidence, and archive the task when all checks pass.
