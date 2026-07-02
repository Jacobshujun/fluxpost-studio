# Hook Guidelines

## Local Hook Usage

This project primarily uses React hooks directly inside page modules instead of a large custom hook layer.

Common patterns:

- `useState` for form fields, selected ids, busy state, and messages.
- `useEffect` for initial loads, follow-up fetches, and job polling.
- `useMemo` for derived filtered lists, counters, and display summaries.
- `useCallback` when a function is passed across effects or reused in polling/load flows.

Reference files:
- `src/app/review/page.tsx`
- `src/app/distribution-check/page.tsx`
- `src/app/page.tsx`

## Data Loading

- Fetch from local API routes with `fetch("/api/...")`.
- Parse JSON once and surface server-provided `error` text when available.
- Keep route-specific load functions near the state they update.
- If polling a job endpoint, clear timers on effect cleanup and stop polling when a terminal state is reached.

## Custom Hooks

Add a custom hook only when:

- The behavior is reused across routes.
- It has a stable boundary that can be described without importing page-specific state.
- It reduces effect complexity rather than hiding important workflow steps.

If a hook is route-only, keep it in the route file until reuse appears.

## Async Effects

- Define an inner async function inside `useEffect`; do not make the effect callback itself `async`.
- Use local cancellation flags or cleanup functions when a response may arrive after unmount or after dependencies changed.
- Do not introduce broad polling as a fallback for uncertain behavior. Poll only for durable job state that the backend explicitly exposes.

## Avoid

- Do not put provider calls, database calls, or Feishu CLI work in hooks.
- Do not duplicate owner/access filtering in the browser; the API and `src/lib` domain layer enforce ownership.
- Do not swallow fetch failures. Show a message or preserve an error state users can see.
