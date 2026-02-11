# Storage Terminology

Use these canonical terms consistently across feature specs.

## Canonical Stores

- Internal App Storage (IndexedDB)
  - App-managed persisted state (non-secret), including recent files, remembered key-file references, Drive file/revision context, and sync status fields.
- Encrypted Offline Cache (IndexedDB)
  - Encrypted KDBX bytes only (no decrypted values, no plaintext credentials).
- Runtime Data Store (localStorage)
  - Persistent OAuth runtime token data for Drive integration (KeeWeb-like behavior), stored in browser `localStorage` only.
  - Key: `keeweb-lite.oauth.google-drive`.
  - Value: JSON token envelope for Drive auth (`refreshToken`, `accessToken`, `expiresAt`, scope/provider metadata).
  - At-rest protection expectation: no app-level encryption; relies on browser/OS storage protections.
  - Retention semantics: keep until explicit `logout`, refresh-token invalidation, or user/browser storage clear.
- Runtime Memory (non-persistent)
  - Unlocked database model, transient UI/edit state, entered password, and raw key bytes during unlock flow.

## External Persistence Targets

- Local writable source
  - Original `.kdbx` file through File System Access API.
- Google Drive source
  - Remote Drive file bytes and revisions.
