# Immediate Autosave

## Purpose

Define a single save pipeline that persists every edit immediately.

## Scope

- Entry/group edits.
- Local, in-memory, and Drive-backed sources.

## Functional Requirements

- Autosave-on-change is a fixed lite default (not user-configurable).
- Any data mutation triggers save immediately.
- Save pipeline is serialized (one write in flight).
- If edits happen during save, queue another save run.
- Never drop pending edits.
- Source-specific persistence:
  - local file-input source: update encrypted cache and latest downloadable export state
  - in-memory/fallback: update encrypted cache/export state
  - Drive-backed: sync via Drive adapter and update Drive sync metadata (`lastSyncAt`/status/error)

## UI Requirements

- Show save state continuously:
  - `saving`
  - `saved`
  - `error`
- Save status must reflect real persistence result, not optimistic completion.

## Data and Storage

- Queue/save state is maintained in Runtime Memory (non-persistent).
- Persisted targets depend on source adapter and configuration:
  - local file-input source: Encrypted Offline Cache (IndexedDB) plus on-demand browser download export
  - in-memory/fallback: Encrypted Offline Cache (IndexedDB)
  - Drive-backed metadata: Internal App Storage (localStorage), including `lastSyncAt`, `lastSyncStatus`, and `lastSyncError`
  - Drive OAuth runtime token data: browser `localStorage` key `keeweb-lite.oauth.google-drive` (cleared on `logout` or invalid refresh token)

## Failure Handling

- Save errors keep unsaved/error indicators visible.
- Retry path must exist (auto-retry and/or explicit user action).
- Failed save must never be marked as successful.
- Failed Drive sync retries must preserve previous successful `lastSyncAt` value.

## Security and Privacy

- Do not log plaintext credentials or decrypted secret fields.

## Acceptance Criteria

- Every edit results in a persistence attempt.
- Rapid edit bursts do not corrupt data or lose updates.
- Failure states are explicit and recoverable.
