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
  4. app downloads bytes and unlocks DB
- Save/sync flow:
  - after edits, sync to same Drive file
  - compare local known revision with remote revision
  - detect and surface revision conflicts
- Manual `Sync now` action triggers immediate sync.
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
  - `syncing`
  - `synced`
  - `sync error`
  - `idle/not synced`
- At top of opened DB view show:
  - status circle 1: save state
  - status circle 2: Drive sync state
  - `Sync now` button
  - sync metadata (last sync time + result + last error when present)
- Show colored sync status circles and actionable retry on failure.

## Data and Storage

- Persist minimal file metadata for quick reopen:
  - file id
  - file name
  - revision id
  - minimal adapter options
- Sync metadata fields:
  - `lastSyncAt`
  - `lastSyncStatus`
  - `lastSyncError`
- Token policy uses persistent runtime-data storage (KeeWeb default).
- OAuth requests include offline refresh capability (KeeWeb default).

## Failure Handling

- Expired auth triggers reconnect flow.
- Permission/network errors keep unsynced state visible.
- Revision conflicts are explicit and require conflict resolution flow.

## Security and Privacy

- Use least-privilege scope `drive.file`.
- Do not log OAuth tokens or plaintext secrets.
- Persist only minimum metadata required for reopen/sync.

## Acceptance Criteria

- User can open and sync a Drive-backed `.kdbx`.
- Manual and automatic sync both work.
- Auth, network, and conflict failures are recoverable and visible.
