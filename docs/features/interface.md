# Interface

## Purpose

Define the two primary UI states and user navigation model.

## Scope

- Root/open page (startup and unlock).
- Workspace page (menu, list, details, footer).

## Functional Requirements

- App starts on the root/open page.
- Root/open page shows a source strategy selector above the password input:
  - `Local`
  - `Google`
- Root/open page includes:
  - password input and enter/open action
  - optional key file control
  - quick access list for recent files
  - inline unlock message area
- Selecting a quick access item pre-fills file context and focuses unlock.
- Successful unlock switches to workspace page.
- Workspace page contains:
  - left menu pane
  - entry list pane
  - entry details pane
  - footer with file/save/sync state
- Settings/import/panel workflows temporarily replace list/details content.

## UI Requirements

- Keyboard support on root/open page:
  - `Enter` opens selected file
  - `Up` and `Down` move quick access selection
- `Esc` returns from open view to entries when files are already open.
- Save and sync state must be visible without developer tools.

## Data and Storage

- Quick access list is populated from persisted recent-file metadata.
- Entered password and raw key bytes remain session-memory only.

## Failure Handling

- Unlock errors keep user on root/open page with actionable feedback.
- Missing/revoked quick access targets can be removed or reselected.

## Security and Privacy

- Never log plaintext secrets.
- Do not persist plaintext credentials.

## Acceptance Criteria

- Root/open page is sufficient for both first open and quick reopen.
- Workspace page reliably renders menu/list/details/footer structure.
- Navigation between root/open and workspace pages is clear and predictable.
