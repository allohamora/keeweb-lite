# In-Memory Mode

## Purpose

Define behavior for browser-local and other non-writable source modes.

## Scope

- Databases opened from non-writable sources.
- Export/download behavior.
- Offline encrypted cache behavior.

## Functional Requirements

- Lite defaults to local-cache behavior for local file-input sources.
- This mode defines database persistence behavior; key-file remember defaults are still defined by Key File Unlock (`rememberKeyFiles = data`, hash-based metadata parity).
- Keep unlocked database model in runtime app state (Zustand-style, non-persistent) while session is active.
- Apply edits immediately to the active in-memory model.
- Persist encrypted KDBX bytes to Encrypted Offline Cache (IndexedDB) by default.
- Never call Drive sync unless selected record type is `google-drive`.
- Provide `Download` action for current encrypted state.

## UI Requirements

- Show clear source mode (`local-cache` vs `drive-sync`).
- Show save state (`saving`, `saved`, `error`).
- Show explicit hint when data is cached locally only.

## Data and Storage

- Runtime app state (Zustand-style, non-persistent): unlocked model and transient editing state.
- Encrypted Offline Cache (IndexedDB): encrypted KDBX bytes only, stored as `record.kdbx.encryptedBytes` in `src/repositories/record.repository.ts`.
- IndexedDB records store (`src/repositories/record.repository.ts`): persisted source descriptors and per-record metadata.

## Failure Handling

- Cache write failures surface error state and retain unsaved status.
- Export action remains available for recovery.

## Security and Privacy

- Do not store plaintext unlock credentials or decrypted values.
- Store encrypted DB bytes only in Encrypted Offline Cache (IndexedDB).

## Acceptance Criteria

- `local-cache` mode edits apply immediately.
- No unintended cloud sync occurs in this mode.
- User can always export current encrypted DB state.
