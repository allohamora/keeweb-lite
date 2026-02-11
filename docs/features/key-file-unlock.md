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
- Default mode is `remember key file for reopen` using KeeWeb-style `data` semantics.
- Selected key-file bytes are used for unlock and then cleared from raw runtime buffers (best effort).
- Persisted remember-key data is enabled by default in lite using non-plaintext representation.
- Remembered key storage is file-scoped, not global-single-slot: metadata is attached to recent-file records.
- Remembered-key `data` mode stores key metadata only (`keyFileName` + non-plaintext `keyFileHash`), never raw key bytes.
- Lite does not use key-file-path remember mode.
- On reopen, if a matching file has remembered `keyFileHash`, app derives unlock key material in memory from that hash representation.
- User should not need to re-select key file on same-session reopen or after reload when remembered key data is available.
- When user switches to a different database file, current key-file selection must be cleared first.
- After file switch, key-file state may be re-populated only if remembered metadata matches that selected file context.

## UI Requirements

- Root/open screen shows key-file add/remove control.
- Selected key file name indicator is visible.
- Show helper hint that key file is remembered in internal app storage as hash metadata and can be cleared.
- Wrong key-file/password errors are explicit.

## Data and Storage

- Persist remembered key-file metadata in Internal App Storage (localStorage) within recent-file records:
  - `keyFileName`
  - `keyFileHash` (or equivalent non-plaintext key representation)
  - file identity binding via the recent-file record context (`fileId`/storage/path matcher)
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
- Persist only non-plaintext remembered-key representation; never persist raw key-file bytes.

## Acceptance Criteria

- Both unlock variants work for supported databases.
- Same-session reopen works without re-selecting key file.
- Reload/new-session reopen works with password-only when remembered key data exists.
- Clear-remembered-key action forces key-file re-selection on next unlock.
- Selecting another database file clears previous file key-file selection before unlock.
- Multiple files may each have remembered key metadata, and metadata is applied only to matching file context.
- Lite remember behavior matches KeeWeb `rememberKeyFiles = data` semantics (hash metadata, no raw bytes, no path mode).
- No plaintext key material is persisted.
