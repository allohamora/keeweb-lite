# Storage Terminology

Use these canonical terms consistently across feature specs.

## Canonical Models

- Record type (`type`)
  - `local`: browser-local file flow.
  - `google-drive`: Drive-backed file flow.
  - `webdav`: database bound to one WebDAV URL and one separately encrypted credential record.
  - `demo`: in-memory-only demo session (see `docs/features/demo-mode.md`). Never persisted; excluded from the Records Store schema so it can never be written to IndexedDB.
- Synchronization status (runtime UI)
  - `Syncing`: a remote pass is running.
  - `Saved locally`: encrypted local bytes are pending remote confirmation.
  - `Synced`: no remote work is pending.
  - `Sync error`: the last remote pass failed. Pending data remains saved locally.

## Canonical Stores

- Records Store (IndexedDB)
  - Managed by `src/repositories/record.repository.ts`.
  - Storage key: `keeweb-lite.records`.
  - Access is serialized with lock name `record.repository`.
  - Stores a version 1 envelope with valid `records`, preserved `invalidRecords`, and forgotten-record tombstones.
  - Reads the legacy array format and adds `sourceVersion: 1` on the next validated write without changing record identities or encrypted database bytes.
  - Preserves unknown or invalid rows for individual reporting. An unsupported store version remains untouched and blocks writes.
  - Local record shape:
    - `id`
    - `type = local`
    - `sourceVersion`
    - `kdbx` (`name`, `encryptedBytes`)
    - optional `key` (`name`, `hash`)
    - optional `lastOpenedAt`
  - Google Drive record shape:
    - `id`
    - `type = google-drive`
    - `sourceVersion`
    - `source` (`id`)
    - `kdbx` (`name`, `encryptedBytes`)
    - optional `key` (`name`, `hash`)
    - optional `lastOpenedAt`
    - optional synchronization state (`generation`, `pending`, and a verified common snapshot)
  - WebDAV record shape:
    - `id`
    - `type = webdav`
    - `sourceVersion`
    - `source` (`url`, `credentialRecordId`)
    - `kdbx` (`name`, `encryptedBytes`)
    - optional remembered key material and `lastOpenedAt`
    - synchronization state, including `generation`, `pending`, common snapshot, and temporary bootstrap or creation recovery bytes
  - Invalid or unsupported records are reported individually and retained for recovery; valid records remain available.
- Credential Records (IndexedDB)
  - Store encrypted WebDAV credential containers separately from main database records.
  - Unlock them with the database's password and optional key file. Plaintext server credentials exist only in the active provider session.
- Encrypted Offline Cache (IndexedDB)
  - Implemented by `record.kdbx.encryptedBytes` in Records Store.
  - Stores encrypted KDBX bytes only (no decrypted values, no plaintext unlock credentials).
- Runtime App State (non-persistent)
  - In-memory state for:
    - unlocked database model/session
    - selected/open record context
    - entered password and raw key bytes during unlock lifecycle
    - session lifecycle ID and cancellation signal
    - explicit-save and entry-mutation state
    - active provider session and transient sync error
  - Must be cleared on lock/logout/close-file flows.

## External Persistence Targets

- Local import source
  - `.kdbx` selected via local file input and read in browser.
- Local export target
  - Downloaded `.kdbx` generated from current encrypted state (`Download`).
- Google Drive source
  - Remote Drive file bytes and revisions.
- WebDAV source
  - Encrypted KDBX file at one canonical HTTPS WebDAV URL. Updates require the strong ETag paired with the downloaded bytes; creation uses `If-None-Match: *`.
