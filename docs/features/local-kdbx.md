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
  2. user provides unlock inputs
  3. app opens DB and renders workspace
- Local selection paths:
  - primary: File System Access API
  - fallback: file input
- Save behavior by mode:
  - writable local source: save back to same file
  - fallback/non-writable source: keep working state and persist encrypted cache bytes in Encrypted Offline Cache (IndexedDB)
- Recent local files appear in quick access list.

## UI Requirements

- Display selected local file name before unlock.
- Show save state (`saving`, `saved`, `error`).
- Show whether file is writable or fallback mode.

## Data and Storage

- Store recent-file metadata in Internal App Storage (IndexedDB).
- Keep remembered key-file reference data in Internal App Storage (IndexedDB).
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
