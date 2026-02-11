# Immediate Autosave

## Purpose

Define a single save pipeline that persists every edit immediately.

## Scope

- Entry/group edits.
- Local, in-memory, and Drive-backed sources.

## Functional Requirements

- Any data mutation triggers save immediately.
- Save pipeline is serialized (one write in flight).
- If edits happen during save, queue another save run.
- Never drop pending edits.
- Source-specific persistence:
  - local writable: overwrite source file
  - in-memory/fallback: update encrypted cache/export state
  - Drive-backed: sync via Drive adapter

## UI Requirements

- Show save state continuously:
  - `saving`
  - `saved`
  - `error`
- Save status must reflect real persistence result, not optimistic completion.

## Data and Storage

- Queue/save state is maintained in Runtime Memory (non-persistent).
- Persisted targets depend on source adapter and configuration:
  - local writable: source file via File System Access API
  - in-memory/fallback: Encrypted Offline Cache (IndexedDB)
  - Drive-backed metadata: Internal App Storage (IndexedDB)
  - Drive OAuth runtime token data: browser `localStorage` key `keeweb-lite.oauth.google-drive` (cleared on `logout` or invalid refresh token)

## Failure Handling

- Save errors keep unsaved/error indicators visible.
- Retry path must exist (auto-retry and/or explicit user action).
- Failed save must never be marked as successful.

## Security and Privacy

- Do not log plaintext credentials or decrypted secret fields.

## Acceptance Criteria

- Every edit results in a persistence attempt.
- Rapid edit bursts do not corrupt data or lose updates.
- Failure states are explicit and recoverable.
