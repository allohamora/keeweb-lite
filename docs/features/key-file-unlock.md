# Key File Unlock

## Purpose

Define key-file-assisted unlock behavior consistent with KeeWeb patterns.

## Scope

- Optional local key file with local and cloud-backed DBs.
- Remember-key-file behavior.

## Functional Requirements

- Unlock supports:
  - password only
  - password + key file
- Key file is selected locally.
- Remember-key-file is enabled by default.
- Remembered key-file information is saved in Internal App Storage (IndexedDB) for quick reopen (KeeWeb-like behavior).
- User should not need to re-select key file on every reopen when remembered data is available.

## UI Requirements

- Root/open screen shows key-file add/remove control.
- Selected key file name/path indicator is visible.
- Wrong key-file/password errors are explicit.

## Data and Storage

- Persist remembered key-file reference data in Internal App Storage (IndexedDB).
- Do not persist raw plaintext key-file bytes.

## Failure Handling

- Invalid key material returns unlock error without changing current file state.
- Missing remembered path prompts key-file re-selection.

## Security and Privacy

- Never log key-file content.
- Keep raw key bytes in memory only for unlock lifecycle.
- Clear/zero raw key buffers after unlock usage.
- Treat zeroization as best-effort in browser/JS runtimes: keep key material in `Uint8Array`/`ArrayBuffer`, avoid unnecessary copies/string conversions, and overwrite buffers immediately after unlock attempts (success or failure).
- Zeroization cannot be fully guaranteed in browser/JS environments due to GC/runtime copies; treat this as risk reduction, not an absolute guarantee.
- Persisted remembered-key data must be non-plaintext representation only.

## Acceptance Criteria

- Both unlock variants work for supported databases.
- Remember-key behavior matches fixed defaults.
- No plaintext key material is persisted.
