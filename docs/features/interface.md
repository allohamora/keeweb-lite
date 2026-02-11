# Interface

## Purpose

Define the two primary UI states and user navigation model.

## Scope

- Root/open page (startup and unlock).
- Workspace page (KeeWeb-like render/edit layout).
- Password generator access in open and workspace contexts.

## Functional Requirements

- App starts on the root/open page.
- Lite has no settings page; behavior is controlled by fixed defaults in feature specs.
- Root/open page shows a source strategy selector above the password input:
  - `Local`
  - `Google Drive`
- Root/open page includes:
  - password input and enter/open action
  - optional key file control
  - quick access list for recent files
  - password generator action
  - inline unlock message area
- Selecting a quick access item pre-fills file context and focuses unlock.
- Successful unlock switches to workspace page.
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
  - `Sync now` button
  - sync metadata text (last sync time + result)
- Workspace render/edit layout follows KeeWeb-like menu/list/details behavior.
- Import/panel workflows temporarily replace list/details content.

## UI Requirements

- Keyboard support on root/open page:
  - `Enter` opens selected file
  - `Up` and `Down` move quick access selection
- `Esc` returns from open view to entries when files are already open.
- Save and sync state must be visible without developer tools.
- Two status circles must be visible at top of opened DB view.
- `Sync now` and sync metadata must be visible at top of opened DB view.
- Source selector labels must use canonical names: `Local` and `Google Drive`.

## Data and Storage

- Quick access list is populated from recent-file metadata in Internal App Storage (localStorage).
- Entered password and raw key bytes remain in Runtime Memory (non-persistent) only.

## Failure Handling

- Unlock errors keep user on root/open page with actionable feedback.
- Missing/revoked quick access targets can be removed or reselected.

## Security and Privacy

- Never log plaintext secrets.
- Do not persist plaintext credentials.

## Acceptance Criteria

- Root/open page is sufficient for both first open and quick reopen.
- Workspace page reliably renders KeeWeb-like menu/list/details edit structure.
- Opened DB view shows two status circles, sync button, and sync metadata at top.
- Navigation between root/open and workspace pages is clear and predictable.
