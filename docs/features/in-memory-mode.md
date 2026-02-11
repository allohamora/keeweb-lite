# In-Memory Mode

## Purpose

Define behavior for databases without a writable external target.

## Scope

- Databases opened from non-writable sources.
- Export/download behavior.
- Offline encrypted cache behavior.

## Functional Requirements

- Keep unlocked database model in Runtime Memory (non-persistent) while session is active.
- Apply edits immediately to in-memory model.
- Persist encrypted KDBX bytes to Encrypted Offline Cache (IndexedDB) by default (KeeWeb default).
- Never call Drive sync unless source adapter is `gdrive`.
- Provide export/download action for current encrypted state.

## UI Requirements

- Show clear source mode (`in-memory` vs synced source).
- Show save state (`saving`, `saved`, `error`).
- Show explicit hint when data is cached locally only.

## Data and Storage

- Runtime Memory (non-persistent): unlocked model and transient editing state.
- Encrypted Offline Cache (IndexedDB): encrypted KDBX bytes only.
- Internal App Storage (IndexedDB): recent-file metadata for quick access.

## Failure Handling

- Cache write failures surface error state and retain unsaved status.
- Export action remains available for recovery.

## Security and Privacy

- Do not store plaintext credentials or decrypted values.
- Store encrypted DB bytes only in Encrypted Offline Cache (IndexedDB).

## Acceptance Criteria

- In-memory edits apply immediately.
- No unintended cloud sync occurs in this mode.
- User can always export current encrypted DB state.
