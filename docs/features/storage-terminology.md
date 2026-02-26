# Storage Terminology

Use these canonical terms consistently across feature specs.

## Canonical Models

- Record type (`type`)
  - `local`: browser-local file flow.
  - `google-drive`: Drive-backed file flow.
- Sync error (`syncError`)
  - `null`: last sync succeeded (or no sync has been attempted yet for local records).
  - non-null string: last sync attempt failed; value is the error message.

## Canonical Stores

- Records Store (IndexedDB)
  - Managed by `src/repositories/record.repository.ts`.
  - Storage key: `keeweb-lite.records`.
  - Access is serialized with lock name `record.repository`.
  - Stores an array of `FileRecord` entries (`local` and `google-drive`).
  - Local record shape:
    - `id`
    - `type = local`
    - `kdbx` (`name`, `encryptedBytes`)
    - optional `key` (`name`, `hash`)
    - optional `lastOpenedAt`
  - Google Drive record shape:
    - `id`
    - `type = google-drive`
    - `source` (`id`)
    - `kdbx` (`name`, `encryptedBytes`)
    - optional `key` (`name`, `hash`)
    - optional `lastOpenedAt`
  - If the persisted records array fails validation on read (via `getRecords` with `safeParse`), the entire store is cleared and an empty array is returned.
- Encrypted Offline Cache (IndexedDB)
  - Implemented by `record.kdbx.encryptedBytes` in Records Store.
  - Stores encrypted KDBX bytes only (no decrypted values, no plaintext unlock credentials).
- Runtime App State (non-persistent)
  - In-memory state for:
    - unlocked database model/session
    - selected/open record context
    - entered password and raw key bytes during unlock lifecycle
    - save queue/transient UI state
    - session sync trigger version (`session.version: number`)
    - sync error string (`syncError: string | null`)
  - Must be cleared on lock/logout/close-file flows.

## External Persistence Targets

- Local import source
  - `.kdbx` selected via local file input and read in browser.
- Local export target
  - Downloaded `.kdbx` generated from current encrypted state (`Download`).
- Google Drive source
  - Remote Drive file bytes and revisions.
