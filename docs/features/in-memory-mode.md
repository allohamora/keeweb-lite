# In-Memory Mode

## Purpose

Define behavior for databases without a writable external target.

## Scope

- Databases opened from non-writable sources.
- Export/download behavior.
- Offline encrypted cache behavior.

## Functional Requirements

- Keep unlocked database model in runtime memory while session is active.
- Apply edits immediately to in-memory model.
- Persist encrypted KDBX bytes to offline cache when allowed.
- Never call Drive sync unless source adapter is `gdrive`.
- Provide export/download action for current encrypted state.

## UI Requirements

- Show clear source mode (`in-memory` vs synced source).
- Show save state (`saving`, `saved`, `error`).
- Show explicit hint when data is cached locally only.

## Data and Storage

- Runtime memory: unlocked model and transient editing state.
- Offline cache: encrypted KDBX bytes only.
- Recent-file metadata: persisted separately for quick access.

## Failure Handling

- Cache write failures surface error state and retain unsaved status.
- Export action remains available for recovery.

## Security and Privacy

- Do not store plaintext credentials or decrypted values.
- Store encrypted DB bytes only in offline cache.

## Acceptance Criteria

- In-memory edits apply immediately.
- No unintended cloud sync occurs in this mode.
- User can always export current encrypted DB state.
