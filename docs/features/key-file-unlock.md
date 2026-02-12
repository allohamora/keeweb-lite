# Key File Unlock

## Purpose

Define key-file-assisted unlock behavior for the lite profile using KeeWeb-style remember-key `data` mode defaults.

## Scope

- Optional local key file with local and cloud-backed DBs.
- Remember-key-file behavior across reload/reopen.

## Functional Requirements

- Unlock supports:
  - password only
  - password + key file
- Key file is selected from local file input and loaded into Runtime Memory for unlock.
- Unlock sequence:
  1. user selects database source/file
  2. user optionally selects key file (loaded into memory)
  3. user enters password and unlocks
- Default mode is `remember key file for reopen` using KeeWeb-compatible `rememberKeyFiles = data` semantics.
- Lite pins `rememberKeyFiles` to `data` as a fixed default (no settings toggle).
- KeeWeb upstream default is currently `rememberKeyFiles = path`; lite intentionally overrides this to `data` while keeping KeeWeb `data`-mode hash semantics.
- Selected key-file bytes are used for unlock and then cleared from raw runtime buffers (best effort).
- Persisted remember-key data is enabled by default in lite.
- Remembered key storage is file-scoped, not global-single-slot: metadata is stored by `fileIdentity` in a dedicated IndexedDB store.
- Remembered-key `data` mode stores `fileName` and `fileHash` from KeeWeb credentials state, not local key-file paths.
- `fileHash` is stored as KeeWeb base64 hash representation (`bytesToBase64(hash.getBinary())` parity).
- Lite does not use key-file-path remember mode.
- On reopen, if a matching file has remembered `fileHash`, app reconstructs unlock key material using KeeWeb-compatible hash-to-key transform (`createKeyFileWithHash`: base64 hash bytes -> hex string bytes) and uses that transient key data for unlock.
- User should not need to re-select key file on same-session reopen or after reload when remembered key data is available.
- When user switches to a different database file, current key-file selection must be cleared first.
- After file switch, key-file state may be re-populated only if remembered metadata matches that selected file context.

## UI Requirements

- Unlock screen shows key-file add/remove control.
- Selected key file name indicator is visible.
- Show helper hint that key file is remembered in IndexedDB using KeeWeb-style `data` mode, is sensitive credential-derived metadata, and can be cleared.
- Wrong key-file/password errors are explicit.

## Data and Storage

- Persist remembered key-file metadata in IndexedDB via `src/repositories/key.repository.ts`:
  - `fileName`
  - `fileHash` (KeeWeb-compatible base64 hash representation)
  - strict `fileIdentity` binding using repository key tuple:
    - `fingerprint`
    - `fileName`
    - `fileSize`
  - if identity does not match exactly, remembered key metadata must not be applied
- Keep KDBX file metadata/encrypted-byte persistence in separate repository records via `src/repositories/kdbx.repository.ts`; do not couple remembered key metadata to that record.
- Runtime Memory keeps only transient unlock bytes for active operations.
- Do not persist raw plaintext key-file bytes.
- Do not persist key-file local path in lite.

## Failure Handling

- Invalid key material returns unlock error without changing current file state.
- Missing/cleared remembered key data prompts key-file re-selection.
- Key-file metadata mismatch for selected file must not be reused from another file context.
- If hash-derived remembered key material fails unlock, error is explicit and user can re-select key file and overwrite remembered metadata for that file.

## Security and Privacy

- Never log key-file content.
- Keep raw key bytes in memory only for unlock lifecycle.
- Clear/zero raw key buffers after unlock usage.
- Treat zeroization as best-effort in browser/JS runtimes: keep key material in `Uint8Array`/`ArrayBuffer`, avoid unnecessary copies/string conversions, and overwrite buffers immediately after unlock attempts (success or failure).
- Zeroization cannot be fully guaranteed in browser/JS environments due to GC/runtime copies; treat this as risk reduction, not an absolute guarantee.
- Persist only KeeWeb-style remembered hash representation; never persist raw key-file bytes.
- Persisted `fileHash` is credential-derived data; treat it as sensitive metadata and provide explicit per-file clear action.

## Acceptance Criteria

- Both unlock variants work for supported databases.
- Same-session reopen works without re-selecting key file.
- Reload/new-session reopen works with password-only when remembered key data exists.
- Clear-remembered-key action forces key-file re-selection on next unlock.
- Selecting another database file clears previous file key-file selection before unlock.
- Multiple files may each have remembered key metadata, and metadata is applied only to matching file context.
- Lite remember behavior matches KeeWeb `rememberKeyFiles = data` semantics (persisted `fileHash` metadata in base64 representation, no path mode).
- No plaintext key material is persisted.
