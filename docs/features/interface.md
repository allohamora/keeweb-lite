# Interface

## Purpose

Define KeeWeb-like workspace navigation with an Unlock screen.

## Scope

- Unlock screen (startup, unlock, reopen).
- Detailed startup screen spec: [`docs/screens/unlock-screen.md`](../screens/unlock-screen.md).
- Workspace page (KeeWeb-like render/edit layout).
- Password generator access in workspace entry-edit context.

## Functional Requirements

- App starts on the Unlock screen.
- Lite has no settings page; behavior is controlled by fixed defaults in feature specs.
- Unlock screen shows a source strategy selector above the password input:
  - `Local`
  - `Google Drive`
- Unlock screen includes:
  - password input and enter/open action
  - optional key file control
  - inline unlock message area
- Selecting source/file context pre-fills unlock context and focuses unlock.
- Successful unlock closes the Unlock screen and shows workspace.
- Successful unlock hydrates runtime app state with unlocked session data (in-memory store, non-persistent).
- If files are already open, the Unlock screen can be toggled without closing workspace files.
- Workspace page contains:
  - top workspace status bar
  - left menu pane
  - entry list pane
  - entry details pane
  - password generator action for entry editing
  - footer with file/session state
- Top workspace status bar contains:
  - sync status dot (Drive-backed files only; green = synced, red = error)
  - `Download` button
  - `Sync` button (Drive-backed files only, shown when last sync failed)
- Workspace render/edit layout follows KeeWeb-like menu/list/details behavior.
- Import/panel workflows temporarily replace list/details content.
- Mobile breakpoint for layout switching is `<=768px`.
- Mobile workspace behavior:
  - menu pane is hidden by default and opened from list header menu button
  - list pane is default mobile pane
  - selecting an entry opens details pane
  - details pane provides back action to list pane
- Unlock mobile behavior:
  - top-anchored unlock layout
  - stacked action row controls
  - viewport-safe modal and file-picker scrolling

## UI Requirements

- Keyboard support on Unlock screen:
  - `Enter` submits unlock for the selected source/file context
- `Esc` closes the Unlock screen and returns to entries only when files are already open.
- Sync state must be visible without developer tools for Drive-backed files.
- `Download` must be visible at top of opened DB view.
- `Sync` must be visible for Drive-backed files when last sync failed.
- Drive-backed sync state uses `syncError: string | null` (`null` = synced, non-null string = error message).
- Source selector labels must use canonical names: `Local` and `Google Drive`.
- Mobile menu and mobile details back actions must be keyboard accessible.

## Data and Storage

- Entered password and raw key bytes remain in runtime memory (inside runtime app state, non-persistent) only.
- Unlocked session data is stored in runtime app state (in-memory, non-persistent) and cleared on lock/logout/close-file.

## Failure Handling

- Unlock errors keep user on the Unlock screen with actionable feedback.
- Missing/revoked source targets can be reselected.

## Security and Privacy

- Never log plaintext secrets.
- Do not persist plaintext database unlock credentials.

## Acceptance Criteria

- Unlock screen is sufficient for both first open and reopen.
- Workspace page reliably renders KeeWeb-like menu/list/details edit structure.
- Opened DB view shows sync status dot (Drive-backed only) and download button at top.
- Navigation between Unlock screen and workspace is clear and predictable.
- At `<=768px`, workspace follows menu/list/details single-pane mobile flow.
- At `>768px`, workspace keeps desktop three-pane layout.
