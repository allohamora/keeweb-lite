# Key File Unlock

## Purpose

Define key-file-assisted unlock behavior for the lite profile with persistent reopen defaults.

## Scope

- Optional local key file with local and cloud-backed DBs.
- Remember-key-file behavior across reload/reopen.

## Functional Requirements

- Unlock supports:
  - password only
  - password + key file
- Key file is selected locally.
- Default mode is `remember key file for reopen`.
- Selected key-file bytes are used for unlock and then cleared from raw runtime buffers (best effort).
- Persisted remember-key data is enabled by default in lite using non-plaintext representation.
- Remembered key storage is single-slot: app keeps only one remembered key-file record at a time.
- User should not need to re-select key file on same-session reopen or after reload when remembered key data is available.
- When user switches to a different database file, current key-file selection must be cleared first.
- After file switch, key-file state may be re-populated only if the single remembered record matches that selected file.
- Remembering a new key file replaces the previous remembered record.

## UI Requirements

- Root/open screen shows key-file add/remove control.
- Selected key file name/path indicator is visible.
- Show helper hint that key file is remembered for reopen and can be cleared.
- Wrong key-file/password errors are explicit.

## Data and Storage

- Persist one remembered key-file reference record in Internal App Storage (localStorage) by default:
  - `keyFileName`
  - `keyFileHash` (or equivalent non-plaintext key representation)
  - bound file identity (`filePath`/`fileId`/equivalent matcher)
- Runtime Memory keeps only transient unlock bytes for active operations.
- Do not persist raw plaintext key-file bytes.

## Failure Handling

- Invalid key material returns unlock error without changing current file state.
- Missing/cleared remembered key data prompts key-file re-selection.
- Key-file metadata mismatch for selected file must not be reused from another file context.

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
- Only one remembered key-file record exists at any time; new remembered key replaces old one.
- No plaintext key material is persisted.
