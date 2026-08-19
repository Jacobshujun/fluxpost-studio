# Technical Design

## Architecture

`src/lib/canvas/seedance-skill-loader.ts` owns server-only file resolution, bounded UTF-8 reads, SHA-256 hashing, metadata, and process-local cache. It reads the configured path from `appConfig.seedancePromptSkillPath`; an empty path uses the assistant's built-in rule block. A configured path is never exposed as a browser path, only as the source kind and basename-safe metadata.

`createSeedancePromptCandidates()` loads the skill immediately before building the model prompt. The model receives the skill inside a clearly delimited reference section followed by an immutable FluxPost contract. The loader metadata travels with the response so the UI can show the active version.

## Data Flow

```text
POST prompt-assist
  -> normalize request
  -> loadSkill() (stat/hash/cache or builtin)
  -> model prompt = skill reference + fixed contract + request
  -> provider response
  -> parse/audit candidate with fixed code rules
  -> { resolvedMode, skill, candidates }
```

## Boundaries And Trade-offs

- File reads remain server-only and synchronous within the short request preparation path; hashing avoids re-reading unchanged content while retaining automatic refresh.
- Maximum Skill size is bounded to avoid accidentally sending a huge or hostile file to the model. The configured file is trusted as operator input for creative guidance but not as executable code.
- Built-in rules remain a compatibility fallback only when no path is configured. A configured-but-missing file is an error so deployment mistakes are visible.
- The model prompt explicitly states that Skill text cannot override the contract; candidate auditing remains the security authority.

## Compatibility

The response adds a `skill` object without removing existing fields. Existing callers can ignore it. Existing marker conversion and upstream prompt conflict behavior are unchanged.
