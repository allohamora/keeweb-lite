# Local KDBX

## Purpose

Define local `.kdbx` open and save behavior in a browser-first deployment.

## Scope

- Local file selection.
- Unlock with password and optional key file.
- Browser-local save/export behavior.

## Functional Requirements

- Local open flow:
  1. user selects `.kdbx` from local file input
  2. user optionally selects key file from local file input (loaded into memory)
  3. user enters password
  4. app opens DB and renders workspace
- Save behavior for local files:
  - after each edit, keep latest encrypted state in Encrypted Offline Cache (IndexedDB)
  - do not write back to originally selected local file path
- Provide `Download` action to export current encrypted `.kdbx` bytes.
- On selecting a different local record/file context, previously selected key-file state is cleared unless remembered key metadata exists for the selected record.

## UI Requirements

- Display selected local file name before unlock.
- Show save state (`saving`, `saved`, `error`).
- Show local source mode as `local-cache` (download/export-based).
- Show `Download` action when local file is open.
- If data is cached locally and not yet downloaded, show a clear inline hint (`Stored locally until downloaded`).
- Provide password generator action in open flow and workspace entry editing flow.

## Data and Storage

- Store local records in IndexedDB via `src/repositories/record.repository.ts`:
  - `type = local`
  - `kdbx` (`name`, `encryptedBytes`)
  - optional `key` metadata (`name`, `hash`) for remember-key behavior
  - optional `lastOpenedAt`
- Encrypted Offline Cache is represented by `record.kdbx.encryptedBytes` in `record.repository` records.
- Keep unlocked model and active file session in runtime app state (Zustand-style, non-persistent) while file is open.

## Failure Handling

- Wrong password/key file shows explicit unlock failure.
- Save failure keeps unsaved/error status visible and recoverable.
- If source is unavailable, allow reopen from encrypted cache when possible.
- Download/export failure surfaces actionable retry feedback.

## Security and Privacy

- Do not log sensitive file or credential material.
- Do not persist plaintext database unlock credentials.

## Acceptance Criteria

- Local `.kdbx` opens with correct credentials.
- Every edit updates local encrypted cached state.
- User can download current latest encrypted `.kdbx` from local mode.
- Save failures are visible and recoverable.
