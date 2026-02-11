# Storage Terminology

Use these canonical terms consistently across feature specs.

## Canonical Stores

- Internal App Storage (localStorage)
  - App-managed persisted state, including recent files, Drive file/revision context, sync status fields, and one remembered key-file metadata record (`keyFileName`, non-plaintext `keyFileHash`/equivalent, bound file identity).
- Encrypted Offline Cache (IndexedDB)
  - Encrypted KDBX bytes only (no decrypted values, no plaintext credentials).
- Runtime Data Store (localStorage)
  - Persistent OAuth runtime token data for Drive integration, stored in browser `localStorage` only.
  - Key: `keeweb-lite.oauth.google-drive`.
  - Value: JSON token envelope for Drive auth (`refreshToken`, `accessToken`, `expiresAt`, scope/provider metadata).
  - At-rest protection expectation: no app-level encryption; relies on browser/OS storage protections.
  - Retention semantics: keep until explicit `logout`, refresh-token invalidation, or user/browser storage clear.
- Runtime Memory (non-persistent)
  - Unlocked database model, transient UI/edit state, entered password, and raw key bytes during unlock flow.

## External Persistence Targets

- Local writable source
  - Original `.kdbx` file through File System Access API writable handle (when available/authorized).
- Local non-writable source
  - `.kdbx` selected via file input (no direct write-back; in-memory plus encrypted cache flow).
- Google Drive source
  - Remote Drive file bytes and revisions.
