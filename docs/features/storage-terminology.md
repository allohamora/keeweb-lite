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
  - `lastSyncErrorSummary` (Internal App Storage): sanitized persisted summary (`code` + short message + timestamp) used for reopen UI context.
- File identity (`fileIdentity`)
  - Google Drive files: Drive file `id`.
  - Local files: content fingerprint + local context metadata (for example: hash of encrypted bytes + file name + file size) used only for matching persisted file metadata and remembered key metadata.

## Canonical Stores

- Internal App Storage (localStorage)
  - App-managed persisted file-info state only (`sourceType`, `sourceLocator`, `sourceOptions`, `syncStatus`, `driveRevisionId`, `lastSuccessfulSyncAt`, `lastSyncErrorSummary`, `lastOpenedAt`, `challengeResponseState`), managed by a dedicated KDBX metadata service (for example `src/services/kdbx-metadata.service.ts`).
- Remembered Key Metadata Store (IndexedDB)
  - Remembered key-file metadata (`keyFileName`, `keyFileHash`) keyed by strict `fileIdentity` binding.
  - `keyFileHash` is stored in KeeWeb-compatible base64 hash representation.
  - Managed by `/repositories/key.repository.ts`.
- Encrypted Offline Cache (IndexedDB)
  - Encrypted KDBX bytes only (no decrypted values, no plaintext unlock credentials).
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
