# Advanced configuration synchronization

## Request

Permanently fix the reproduced defect where saving a new image provider address updates the configuration page but background tasks retain the previous address.

## Requirements

- After a successful advanced-config save, already loaded API and background consumers in the application process use the updated configuration for subsequent reads/requests, without requiring a restart.
- Primary and backup addresses, credentials, model/protocol selections, proxy settings and other appConfig fields stay synchronized.
- Clearing a value preserves existing fallback/tombstone behavior. Invalid or failed saves must not alter live configuration.
- Preserve admin authorization, secret masking and persistent environment-file behavior.
- Update the sole local port-3001 candidate after verification and commit, preserving its LAN binding. Do not create real image jobs or publish content to validate this fix.

## Acceptance

- Regression checks independently load multiple config modules before saving, then prove both consumers observe changed values, cleared values and repeated saves. The new regression fails against the old implementation.
- Previously captured appConfig references observe updates, and modules loaded after saving observe current settings.
- Production build artifacts reproduce shared configuration across API and worker bundles using isolated data, without provider calls.
- Full offline baseline passes, and the activated candidate's runtime/state/build identity agrees with the committed fix.

## Scope

Configuration synchronization and its regression coverage. Existing requests already sent are not cancelled or resubmitted; separate external processes and externally edited environment files are outside the in-process save contract.
