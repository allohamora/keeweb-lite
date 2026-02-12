# Immediate Autosave

## Purpose

Define a single save pipeline that persists every edit immediately.

## Scope

- Entry/group edits.
- Local file-input source and Drive-backed sources.

## Functional Requirements

- Autosave-on-change is a fixed lite default (not user-configurable).
- KeeWeb-parity trigger semantics for lite defaults:
  - `autoSave = true`
  - `autoSaveInterval = -1` (sync/save on each dirty change event)
- Any data mutation triggers save immediately.
- Save pipeline is serialized (one write in flight).
- Save serialization uses browser Web Locks API (`navigator.locks`) with a single save lock name (`keeweb-save`).
- If edits happen during save, queue another save run through the same Web Locks queue.
- Never drop pending edits; queued save requests execute in lock-queue order.
- Save runs may coalesce rapid dirty events into one write of the latest encrypted state before releasing the lock.
- Source-specific persistence:
  - local file-input source: update encrypted cache and latest downloadable export state
  - `local-cache` fallback mode: update encrypted cache/export state
  - Drive-backed: sync via Drive adapter, use 2-way merge on remote changes/rev conflicts, and update sync fields (`driveRevisionId`, `lastSuccessfulSyncAt`, `syncStatus`, `activeSyncError`, `lastSyncErrorDetails`)

## UI Requirements

- Show save state continuously:
  - `saving`
  - `saved`
  - `error`
- Save status must reflect real persistence result, not optimistic completion.
- Save UI semantics:
  - `saving` while save lock is held or save requests are queued
  - `saved` when queue is drained and latest write succeeded
  - `error` when latest queued write fails

## Data and Storage

- Queue/save state is maintained in Runtime Memory (non-persistent).
- Save queue state includes lock/queue indicators used for status rendering.
- Persisted targets depend on source adapter and configuration:
  - local file-input source: Encrypted Offline Cache (IndexedDB) plus on-demand browser download export
  - `local-cache` mode/fallback: Encrypted Offline Cache (IndexedDB)
  - Drive-backed metadata: IndexedDB KDBX metadata via `src/repositories/kdbx.repository.ts`, including `driveRevisionId`, `lastSuccessfulSyncAt`, `syncStatus`, and `lastSyncErrorDetails`; runtime model holds `activeSyncError`
  - Drive OAuth runtime token data: OAuth Token Store (IndexedDB key `keeweb-lite.oauth.google-drive` in `src/repositories/google-drive.repository.ts`, cleared on `logout` or invalid refresh-token path)

## Failure Handling

- Save errors keep unsaved/error indicators visible.
- Retry path must exist (auto-retry and/or explicit user action).
- Failed save must never be marked as successful.
- Failed Drive sync retries must preserve previous successful `lastSuccessfulSyncAt` value.

## Security and Privacy

- Do not log plaintext unlock credentials or decrypted secret fields.

## Acceptance Criteria

- Every edit results in a persistence attempt.
- Rapid edit bursts do not corrupt data or lose updates.
- Failure states are explicit and recoverable.
