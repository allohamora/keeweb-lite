# Interface

## Purpose

Define KeeWeb-like workspace navigation with an Unlock screen.

## Scope

- Unlock screen (startup, unlock, reopen).
- Workspace page (KeeWeb-like render/edit layout).
- Password generator access in Unlock screen and workspace contexts.

## Functional Requirements

- App starts on the Unlock screen.
- Lite has no settings page; behavior is controlled by fixed defaults in feature specs.
- Unlock screen shows a source strategy selector above the password input:
  - `Local`
  - `Google Drive`
- Unlock screen includes:
  - password input and enter/open action
  - optional key file control
  - Recent files list
  - password generator action
  - inline unlock message area
- Selecting a Recent files item pre-fills file context and focuses unlock.
- Successful unlock closes the Unlock screen and shows workspace.
- If files are already open, the Unlock screen can be toggled without closing workspace files.
- Workspace page contains:
  - top workspace status bar
  - left menu pane
  - entry list pane
  - entry details pane
  - password generator action for entry editing
  - footer with file/save/sync state
- Top workspace status bar contains:
  - status circle 1: Save status
  - status circle 2: Sync status
  - `Download` button
  - `Sync` button (Drive-backed files only)
  - sync metadata text (last successful sync time + result + last error when present)
- Workspace render/edit layout follows KeeWeb-like menu/list/details behavior.
- Import/panel workflows temporarily replace list/details content.

## UI Requirements

- Keyboard support on Unlock screen:
  - `Enter` opens selected file
  - `Up` and `Down` move Recent files selection
- `Esc` closes the Unlock screen and returns to entries only when files are already open.
- Save and sync state must be visible without developer tools.
- Save and sync indicators must include color + text labels (not color-only).
- Save/sync status text should use `aria-live="polite"` updates for assistive technologies.
- Two status circles must be visible at top of opened DB view.
- `Download` must be visible at top of opened DB view.
- `Sync` must be visible for Drive-backed files at top of opened DB view.
- Sync metadata must be visible at top of opened DB view.
- Drive-backed sync state follows internal file model semantics (`isSyncInProgress`, `lastSyncError`, `hasLocalChanges`) for status-circle rendering.
- Source selector labels must use canonical names: `Local` and `Google Drive`.

## Data and Storage

- Recent files list is populated from recent-file metadata in Internal App Storage (localStorage).
- Entered password and raw key bytes remain in Runtime Memory (non-persistent) only.

## Failure Handling

- Unlock errors keep user on the Unlock screen with actionable feedback.
- Missing/revoked Recent files targets can be removed or reselected.

## Security and Privacy

- Never log plaintext secrets.
- Do not persist plaintext database unlock credentials.

## Acceptance Criteria

- Unlock screen is sufficient for both first open and quick reopen.
- Workspace page reliably renders KeeWeb-like menu/list/details edit structure.
- Opened DB view shows two status circles, download button, and sync metadata at top.
- Navigation between Unlock screen and workspace is clear and predictable.
