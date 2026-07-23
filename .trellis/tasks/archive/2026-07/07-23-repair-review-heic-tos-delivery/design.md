# Design

## Media normalization

Add one server-only HEIC normalizer that accepts bytes or a staged file, decodes through `heic-convert`, validates the resulting JPEG signature, and writes through a temporary sibling before rename. Media cache invokes it before Weibo cleanup and TOS persistence. Keep-mode generation materializes remote media, normalizes unsupported HEIC, and persists the normalized result before returning a final URL.

The final-image invariant is: a generated post may store managed TOS/local browser media or a verified browser-supported remote URL. A failed HEIC conversion is a task failure/needs-review result, never a successful remote fallback.

## Preview delivery

A shared client-safe preview helper recognizes native Volcengine TOS hosts and returns those URLs directly. Local media keeps its cache-bust parameter. Other HTTP(S) media keeps using the proxy. The proxy uses server configuration to redirect any managed TOS URL, covering custom public bases, and refuses `image/heic` upstream bodies.

## Historical repair

An admin-only cursor API scans generated posts in stable id order. Candidates must map an existing final image URL exactly to a source item's image index. Apply mode recaches only candidate source items, then replaces only indices with verified cached results; matching selected keep-task URLs and exact reference URLs are updated at the same time. Generated/model outputs, uncertain mappings, and failed conversions remain unchanged. Each bounded batch is idempotent and records a summary execution log.

No schema migration is required. The config page drives scan/apply batches and reports counts/failures.

## Rollout

Verify offline, deploy one fixed commit through the existing production wrapper, back up affected rows, run scan, then apply bounded batches. Existing TOS URLs remain compatible with rollback; restore backed-up rows only if a mapping defect is observed.
