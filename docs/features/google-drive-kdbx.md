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
- Last-sync metadata and sync status UI.

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
  - sync strategy follows KeeWeb 2-way merge behavior
  - compare local known revision with remote revision
  - detect and surface revision conflicts
  - on remote-newer or save `revConflict`, load remote and merge into local model (`db.merge(remoteDb)`)
  - if local file is not modified, remote load updates local model directly (no merge)
  - after successful merge with local changes, save merged result back to Drive
  - limit load/merge retry loops per sync cycle to `3` attempts (KeeWeb parity)
- Manual `Sync now` action triggers immediate sync.
- `Download latest` action exports current encrypted `.kdbx` bytes without changing remote sync state.
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
  - `syncing` (`file.syncing = true`)
  - `sync error` (`file.syncError` present)
  - `modified/unsynced` (`file.modified = true` with no in-flight sync/error)
  - `synced` (no `syncing`, no `syncError`, no `modified`)
- At top of opened DB view show:
  - status circle 1: save state
  - status circle 2: Drive sync state
  - `Download latest` button
  - `Sync now` button
  - sync metadata (last successful sync time + result + last error when present)
- Show colored sync status circles and actionable retry on failure.

## Data and Storage

- Persist KeeWeb file-info metadata for quick reopen in Internal App Storage (localStorage):
  - `id`, `name`, `storage`, `path`, `opts`
  - `rev` (Drive head revision id)
  - `syncDate` (last successful sync timestamp)
  - `modified`, `editState`, `openDate`, `chalResp`, optional key-file metadata
- Keep in Runtime Memory (non-persistent):
  - `syncing` (in-flight sync flag)
  - `syncError` (active attempt error state)
  - active model sync state and merge/retry flow state
- Persist OAuth runtime token data in browser `localStorage` key `keeweb-lite.oauth.google-drive`.
  - Stored envelope fields include `refreshToken`, `accessToken`, `expiresAt`, and provider/scope metadata.
  - At-rest expectation: no app-level encryption for token envelope; rely on browser/OS storage protections.
  - Retention: persist across reloads until explicit `logout`, token refresh failure/re-authorization path, or user/browser storage clear.
- OAuth requests include offline refresh capability (KeeWeb default).

## Failure Handling

- Expired auth triggers reconnect flow.
- Permission/network errors keep unsynced state visible.
- Revision conflicts are explicit and require conflict resolution flow.
- If remote key changed and merge/open fails with invalid key, prompt for remote key update flow before continuing sync.
- Download/export failures are explicit and retryable.
- Failed sync attempts must not overwrite previous successful `syncDate`; they set `syncError` and keep unsynced state visible.

## Security and Privacy

- Use least-privilege scope `drive.file`.
- Do not log OAuth tokens or plaintext secrets.
- Persist only minimum metadata required for reopen/sync.
- `logout` must revoke token (best effort) and remove `keeweb-lite.oauth.google-drive` from `localStorage` before returning success.

## Acceptance Criteria

- User can open and sync a Drive-backed `.kdbx`.
- Manual and automatic sync both work.
- Auth, network, and conflict failures are recoverable and visible.
