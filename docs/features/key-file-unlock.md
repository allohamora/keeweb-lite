# Key File Unlock

## Purpose

Define key-file-assisted unlock behavior consistent with KeeWeb patterns.

## Scope

- Optional local key file with local and cloud-backed DBs.
- Remember-key-file modes.
- Optional device-owner encrypted unlock secret handling.

## Functional Requirements

- Unlock supports:
  - password only
  - password + key file
- Key file is selected locally.
- Remember modes:
  - `none`: store no key-file reference
  - `data`: store key-file hash metadata
  - `path`: store key-file path metadata when path access exists
- Optional device-owner unlock secret storage:
  - `memory`: encrypted secret in runtime memory only
  - `file`: encrypted secret in persisted file-info metadata (time-limited)

## UI Requirements

- Root/open screen shows key-file add/remove control.
- Selected key file name/path indicator is visible.
- Wrong key-file/password errors are explicit.

## Data and Storage

- Store key-file metadata only (hash/path/name based on mode).
- Do not persist raw key-file bytes.

## Failure Handling

- Invalid key material returns unlock error without changing current file state.
- Missing remembered path prompts key-file re-selection.

## Security and Privacy

- Never log key-file content.
- Keep raw key bytes in memory only for unlock lifecycle.
- Clear/zero raw key buffers after unlock usage.

## Acceptance Criteria

- Both unlock variants work for supported databases.
- Remember mode behavior matches selected mode.
- No plaintext key material is persisted.
