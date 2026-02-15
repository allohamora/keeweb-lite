# Google Drive KDBX

## Purpose

Define target Google Drive integration behavior based on KeeWeb storage-adapter patterns.

## Status

- Current project integration is broken.
- This spec defines the intended implementation target.

## Scope

- OAuth auth flow.
- Drive file listing/open/save.
- Sync and revision conflict handling.
- Last sync metadata and sync status UI.

## Functional Requirements

- Open flow:
  1. user starts Drive open
  2. app performs OAuth code flow with PKCE
  3. user selects file from Drive browser/list
  4. user optionally selects key file from local file input (loaded into memory)
  5. user enters password
  6. app downloads bytes and unlocks DB
- Save/sync flow:
  - after edits, sync to same Drive file
  - sync UI/render state is derived from single `sync.status` state value (not from ad-hoc boolean combinations)
  - sync strategy follows KeeWeb 2-way merge behavior
  - compare local known revision with remote revision
  - detect and surface revision conflicts
  - on remote-newer or save `revConflict`, load remote and merge into local model (`db.merge(remoteDb)`)
  - if local file has no local changes, remote load updates local model directly (no merge)
  - after successful merge with local changes, save merged result back to Drive
  - limit load/merge retry loops per sync cycle to `3` attempts (KeeWeb parity)
- Manual `Sync` action triggers immediate sync.
- `Download` action exports current encrypted `.kdbx` bytes without changing remote sync state.
- Adapter API surface:
  - `list`
  - `stat`
  - `load`
  - `save`
  - `remove`
  - `logout`
- Listing supports:
  - root
  - shared with me
  - shared drives

## UI Requirements

- Show sync state:
  - `syncing` (`sync.status = syncing`)
  - `error` (`sync.status = error`)
  - `changes not synced` (`sync.status = pending`)
  - `synced` (`sync.status = idle`)
  - `conflict` (`sync.status = conflict`)
- At top of opened DB view show:
  - status circle 1: Save status
  - status circle 2: Sync status
  - `Download` button
  - `Sync` button
  - sync metadata (last successful sync time + result + last error when present)
- Sync metadata should include absolute timestamp from `sync.lastSuccessfulAt` and a relative display (for example, `2 minutes ago`).
- Show colored sync status circles and actionable retry on failure.

## Data and Storage

- Persist Drive-backed file records in IndexedDB via `src/repositories/record.repository.ts` with `type = google-drive`:
  - `id`
  - `source` (`id`, optional `locator`, optional `options`)
  - `kdbx` (`name`, `encryptedBytes`)
  - optional `key` (`name`, `hash`) for remember-key behavior
  - optional `sync` (`status`, optional `revisionId`, optional `lastSuccessfulAt`, optional `lastError`)
  - optional `oauth` (`refreshToken`, `accessToken`, `expiresAt`, optional `scope`)
  - optional `lastOpenedAt`
- Keep active unlocked DB/session and transient sync attempt state in runtime app state (Zustand-style, non-persistent).
- Persist OAuth runtime token envelope only as part of Drive record `oauth` field in `record.repository`; malformed persisted records are deleted on read (safe-parse fallback in repository).
- OAuth requests include offline refresh capability (KeeWeb default).

## Failure Handling

- Expired auth triggers reconnect flow.
- Permission/network errors keep unsynced state visible.
- Revision conflicts are explicit and require conflict resolution flow.
- Sync failures should provide inline actions (`Retry sync`, and `Resolve conflict` when applicable).
- If remote key changed and merge/open fails with invalid key, prompt for remote key update flow before continuing sync.
- Download/export failures are explicit and retryable.
- Failed sync attempts must not overwrite previous successful `sync.lastSuccessfulAt`; they set `sync.status = error`, update runtime `activeSyncError`, and persist sanitized `sync.lastError`.

## Security and Privacy

- Use least-privilege scope `drive.file`.
- Do not log OAuth tokens or plaintext secrets.
- Persist only minimum metadata required for reopen/sync.
- `logout` must clear Drive auth/session metadata from persisted records; optional token revocation is best effort.

## Acceptance Criteria

- User can open and sync a Drive-backed `.kdbx`.
- Manual and automatic sync both work.
- Auth, network, and conflict failures are recoverable and visible.
