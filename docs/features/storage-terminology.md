# Storage Terminology

Use these canonical terms consistently across feature specs.

## Canonical Stores

- Internal App Storage (localStorage)
  - App-managed persisted state, including recent files and file-info fields (`storage`, `path`, `opts`, `modified`, `editState`, `rev`, `syncDate`, `openDate`, `chalResp`) plus remembered key-file metadata (`keyFileName`, `keyFileHash`, file-bound by record identity).
- Encrypted Offline Cache (IndexedDB)
  - Encrypted KDBX bytes only (no decrypted values, no plaintext unlock credentials).
- Runtime Data Store (localStorage)
  - Persistent OAuth runtime token data for Drive integration, stored in browser `localStorage` key `keeweb-lite.oauth.google-drive`.
  - Token envelope fields include `refreshToken`, `accessToken`, `expiresAt`, and provider/scope metadata.
  - At-rest protection expectation: no app-level encryption; relies on browser/OS storage protections.
  - Retention semantics: keep until explicit `logout`, refresh-token invalidation, or user/browser storage clear.
- Runtime Memory (non-persistent)
  - Unlocked database model, transient UI/edit state, entered password, and raw key bytes during unlock flow.

## External Persistence Targets

- Local import source
  - `.kdbx` selected via local file input and read in browser.
- Local export target
  - Downloaded `.kdbx` generated from current encrypted state (`Download latest`).
- Google Drive source
  - Remote Drive file bytes and revisions.
