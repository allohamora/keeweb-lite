# Interface

## Purpose

Define KeeWeb-like workspace navigation with an open/unlock view.

## Scope

- Root/open view (startup, unlock, reopen).
- Workspace page (KeeWeb-like render/edit layout).
- Password generator access in open and workspace contexts.

## Functional Requirements

- App starts on the root/open view.
- Lite has no settings page; behavior is controlled by fixed defaults in feature specs.
- Root/open view shows a source strategy selector above the password input:
  - `Local`
  - `Google Drive`
- Root/open view includes:
  - password input and enter/open action
  - optional key file control
  - quick access list for recent files
  - password generator action
  - inline unlock message area
- Selecting a quick access item pre-fills file context and focuses unlock.
- Successful unlock closes the root/open view and shows workspace.
- If files are already open, root/open view can be toggled without closing workspace files.
- Workspace page contains:
  - top workspace status bar
  - left menu pane
  - entry list pane
  - entry details pane
  - password generator action for entry editing
  - footer with file/save/sync state
- Top workspace status bar contains:
  - status circle 1: save state
  - status circle 2: sync/source state
  - `Download latest` button
  - `Sync now` button (Drive-backed files only)
  - sync metadata text (last successful sync time + result + last error when present)
- Workspace render/edit layout follows KeeWeb-like menu/list/details behavior.
- Import/panel workflows temporarily replace list/details content.

## UI Requirements

- Keyboard support on root/open view:
  - `Enter` opens selected file
  - `Up` and `Down` move quick access selection
- `Esc` closes root/open view and returns to entries only when files are already open.
- Save and sync state must be visible without developer tools.
- Two status circles must be visible at top of opened DB view.
- `Download latest` must be visible at top of opened DB view.
- `Sync now` must be visible for Drive-backed files at top of opened DB view.
- Sync metadata must be visible at top of opened DB view.
- Drive-backed sync state follows KeeWeb file model semantics (`syncing`, `syncError`, `modified`) for status-circle rendering.
- Source selector labels must use canonical names: `Local` and `Google Drive`.

## Data and Storage

- Quick access list is populated from recent-file metadata in Internal App Storage (localStorage).
- Entered password and raw key bytes remain in Runtime Memory (non-persistent) only.

## Failure Handling

- Unlock errors keep user on root/open view with actionable feedback.
- Missing/revoked quick access targets can be removed or reselected.

## Security and Privacy

- Never log plaintext secrets.
- Do not persist plaintext database unlock credentials.

## Acceptance Criteria

- Root/open view is sufficient for both first open and quick reopen.
- Workspace page reliably renders KeeWeb-like menu/list/details edit structure.
- Opened DB view shows two status circles, download button, and sync metadata at top.
- Navigation between root/open view and workspace is clear and predictable.
