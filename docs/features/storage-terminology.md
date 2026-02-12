# Storage Terminology

Use these canonical terms consistently across feature specs.

## Canonical Models

- Sync status (`syncStatus`)
  - `idle`: no local changes and no in-flight sync.
  - `pending`: local changes exist and are not yet synced.
  - `syncing`: sync currently in flight.
  - `conflict`: sync requires explicit conflict resolution.
  - `error`: latest sync attempt failed.
- Sync errors
  - `activeSyncError` (Runtime Memory): full error object/details for the current app session.
  - `lastSyncErrorDetails` (KDBX metadata): persisted sync error object (`code`, `message`, `timestamp`) used for reopen UI context.
- File identity (`fileIdentity`)
  - Repository key tuple: `fingerprint` + `fileName` + `fileSize`.
  - The same tuple is used in `src/repositories/key.repository.ts` and `src/repositories/kdbx.repository.ts` for matching per-file records.

## Canonical Stores

- KDBX Record Store (IndexedDB)
  - Managed by `src/repositories/kdbx.repository.ts`.
  - Stores per-file KDBX record data keyed by `fileIdentity`, including:
    - `metadata` (`id`, `name`, `sourceType`, `sourceLocator`, `sourceOptions`, `syncStatus`, `driveRevisionId`, `lastSuccessfulSyncAt`, `lastSyncErrorDetails`, `lastOpenedAt`, `challengeResponseState`)
    - optional `encryptedBytes` (encrypted KDBX bytes only)
- Remembered Key Metadata Store (IndexedDB)
  - Remembered key-file metadata (`fileName`, `fileHash`) keyed by strict `fileIdentity` binding.
  - `fileHash` is stored in KeeWeb-compatible base64 hash representation.
  - Managed by `src/repositories/key.repository.ts`.
- Encrypted Offline Cache (IndexedDB)
  - Implemented by `encryptedBytes` in `src/repositories/kdbx.repository.ts` (no decrypted values, no plaintext unlock credentials).
- OAuth Token Store (localStorage)
  - Persistent OAuth runtime token data for Drive integration, stored in browser `localStorage` key `keeweb-lite.oauth.google-drive`.
  - Token envelope fields include `refreshToken`, `accessToken`, `expiresAt`, and provider/scope metadata.
  - At-rest protection expectation: no app-level encryption; relies on browser/OS storage protections.
  - Retention semantics: keep until explicit `logout`, refresh-token invalidation, or user/browser storage clear.
- Runtime Memory (non-persistent)
  - Unlocked database model, transient UI/edit state, entered password, raw key bytes during unlock flow, save queue state, and full active sync error details (`activeSyncError`).

## External Persistence Targets

- Local import source
  - `.kdbx` selected via local file input and read in browser.
- Local export target
  - Downloaded `.kdbx` generated from current encrypted state (`Download`).
- Google Drive source
  - Remote Drive file bytes and revisions.
