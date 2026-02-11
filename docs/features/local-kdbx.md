# Local KDBX

## Purpose

Define local `.kdbx` open and save behavior in a browser-first deployment.

## Scope

- Local file selection.
- Unlock with password and optional key file.
- Save behavior for writable and fallback modes.

## Functional Requirements

- Local open flow:
  1. user selects `.kdbx`
  2. user provides password and optional key file
  3. app opens DB and renders workspace
- Local selection paths:
  - KeeWeb-like baseline: file input
  - enhanced path when available: File System Access API picker with writable handle
- Save behavior by mode:
  - writable local source (File System Access API handle): save back to same file after each edit
  - fallback/non-writable source (file input): keep working state and persist encrypted cache bytes in Encrypted Offline Cache (IndexedDB)
- Recent local files appear in quick access list.
- On selecting a different `.kdbx`, previously selected key-file state is cleared unless the single remembered key-file record matches the newly selected file.

## UI Requirements

- Display selected local file name before unlock.
- Show save state (`saving`, `saved`, `error`).
- Show whether file is writable or fallback mode.
- Provide password generator action in open flow and workspace entry editing flow.

## Data and Storage

- Store recent-file metadata in Internal App Storage (localStorage).
- Store a single remembered key-file reference record in Internal App Storage (localStorage) by default using non-plaintext representation (`keyFileHash`/equivalent), never raw key-file bytes.
- Cache encrypted KDBX bytes in Encrypted Offline Cache (IndexedDB).
- Keep runtime unlocked model in Runtime Memory (non-persistent) while file is open.

## Failure Handling

- Wrong password/key file shows explicit unlock failure.
- Write permission loss prompts re-authorization.
- Save failure keeps unsaved/error status visible and recoverable.
- If source is unavailable, allow reopen from encrypted cache when possible.

## Security and Privacy

- Do not log sensitive file or credential material.
- Do not persist plaintext credentials.

## Acceptance Criteria

- Local `.kdbx` opens with correct credentials.
- Edits persist according to selected local mode.
- Save failures are visible and recoverable.
