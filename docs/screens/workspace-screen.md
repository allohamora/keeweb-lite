# Workspace Screen

## Purpose

Define the post-home workspace screen for keeweb-lite, including navigation, entry browsing, entry editing context, and save/sync status visibility after a record is unlocked.

## Scope

- Workspace is the primary screen shown after successful unlock from Unlock.
- Workspace supports:
  - rendering unlocked record context
  - navigating groups and entries
  - selecting entries and showing editable details
  - showing save and sync status continuously
  - exposing source-aware actions (`Download` for all opened records, `Sync` for Drive-backed records)
  - showing sync metadata and actionable sync feedback for Drive-backed records
- Workspace must support both record types:
  - `local`
  - `google-drive`
- Workspace keeps unlocked data in runtime memory only and returns to Unlock when session is locked or closed.

## Layout Regions

1. Top workspace status bar
   - Shows save status circle and label.
   - Shows sync status circle and label.
   - Shows `Download` action.
   - Shows `Sync` action when current record type is `google-drive`.
   - Shows sync metadata (last successful sync and last error context when present).
2. Left menu pane
   - Displays workspace navigation (groups, tags, smart filters, and similar navigation items).
   - Tag items are clickable and filter the entry list to only entries that carry the selected tag.
   - Recycle Bin is shown as a dedicated navigation item and is not included in `All Items`, tag-derived filters, or the standard collections list.
3. Entry list pane
   - Displays entries for the selected navigation context.
   - Supports selection and search/sort controls.
4. Entry details pane
   - Displays selected entry details.
   - Displays selected entry tags when present.
   - Supports editing flow and history access/restore actions.
5. Context panel area
   - Used for temporary workflows that replace or overlay standard list/details content (for example, generator or import-related flows).
6. Footer bar
   - Shows opened-record context and quick actions related to workspace/session behavior.

## State Model

View states:

- `loading-workspace`
  - Initial post-unlock state while workspace context is prepared.
- `ready-no-selection`
  - Workspace is rendered with no active entry selected.
- `ready-with-selection`
  - Workspace is rendered with an active entry selected in list and details.
- `panel-active`
  - A temporary panel workflow is active over standard list/details flow.

Transient operation flags (not top-level view states):

- `saveStatus`
  - `saving` | `saved` | `error`.
- `syncStatus`
  - `idle` | `pending` | `syncing` | `conflict` | `error` for Drive-backed records.
- `inlineStatusMessage`
  - Holds actionable save/sync/panel feedback while keeping current view state.

View-state transitions:

1. `loading-workspace` -> `ready-no-selection` when workspace data is available with no active entry.
2. `loading-workspace` -> `ready-with-selection` when workspace data is available and an entry is preselected.
3. `ready-no-selection` <-> `ready-with-selection` as entry selection changes.
4. `ready-no-selection` or `ready-with-selection` -> `panel-active` when a temporary panel flow is opened.
5. `panel-active` -> previous ready state when panel flow is closed.
6. Any workspace state -> Unlock transition on lock/close-file/logout session flow.

## User Flows

1. Enter workspace after unlock
   - Unlock flow succeeds.
   - Workspace enters `loading-workspace`.
   - Workspace resolves to a ready state and renders navigation, list, details context, and status bar.
2. Navigate and select
   - User selects a group/filter in menu.
   - Entry list updates to selected context.
   - User clicks a tag in menu.
   - Entry list is filtered to show only entries that carry the selected tag.
   - User selects an entry and details panel updates.
3. Edit and save feedback
   - User edits selected entry fields.
   - Save pipeline runs automatically.
   - Save status updates (`saving` -> `saved` or `error`) with actionable feedback on failure.
4. Sync feedback for Drive-backed records
   - On edits or manual sync action, sync status updates by canonical sync state.
   - Metadata and retry/conflict actions are shown when needed.
5. Download current encrypted state
   - User triggers `Download`.
   - Current encrypted record state is exported without changing sync state.
6. Lock/close session
   - User locks or closes active record.
   - Workspace session is cleared from runtime memory.
   - App returns to Unlock.

## Validation Rules

- Workspace actions requiring an opened record are blocked when no unlocked session exists.
- Entry-edit actions are blocked when no entry is selected.
- `Sync` action is available only when current record type is `google-drive`.
- Recycle Bin entries are excluded from `All Items` and tag-derived entry lists unless Recycle Bin itself is explicitly selected.
- Save/sync status must always include text labels alongside color indicators.
- Drive sync state rendering must use canonical sync status semantics:
  - `idle`
  - `pending`
  - `syncing`
  - `conflict`
  - `error`

## Accessibility Requirements

- Keyboard-only flow must support:
  - navigation between status actions, menu, list, details, and footer controls
  - entry selection and return between list/details contexts
  - closing temporary panel flows with `Esc` when applicable
- Focus behavior:
  - focus moves predictably when entry selection changes
  - focus is preserved or restored when temporary panels open/close
  - focus remains on actionable controls after inline errors
- Save/sync status text updates use `aria-live="polite"`.
- Selection state in menu/list is programmatically exposed for assistive technologies.

## Security and Privacy

- Never log plaintext secrets, decrypted entry values, unlock passwords, key-file bytes, or OAuth tokens.
- Unlocked workspace data remains runtime memory only and is cleared on lock/logout/close-file flows.
- Persist only encrypted record bytes and minimum metadata needed for reopen/sync state.

## Failure Handling

- Workspace load failure:
  - show actionable error state
  - keep retry path available
- Save failure:
  - keep unsaved/error status visible
  - keep retry/recovery path available
- Sync failure (Drive-backed):
  - keep sync error/conflict state visible
  - keep retry and conflict-resolution actions available
- Download failure:
  - show explicit error and retry path
- Non-blocking metadata update failures:
  - do not silently hide failure
  - keep workspace usable while surfacing status feedback

## Acceptance Criteria

1. After successful Unlock, app transitions to Workspace and renders status bar, menu, list, details, and footer regions.
2. Workspace supports both `local` and `google-drive` record contexts.
3. Top bar always shows two status indicators with text labels for save/sync visibility.
4. `Download` action is visible for opened records.
5. `Sync` action is visible only for Drive-backed records.
6. Save state changes are visible as `saving`, `saved`, and `error`.
7. Drive sync state changes are visible as canonical statuses (`idle`, `pending`, `syncing`, `conflict`, `error`).
8. Entry selection updates details context without leaving workspace.
9. Temporary panel flows can open and close without breaking main workspace state.
10. Lock/close session returns user to Unlock and clears unlocked runtime session data.
11. Accessibility requirements pass for keyboard flow, focus behavior, and `aria-live` status updates.

## Out of Scope

- Unlock-screen behavior and recent-record creation flows (covered by `unlock-screen.md`).
- Defining provider-specific auth protocol details beyond workspace-visible behavior.
- Introducing server-side rendering, backend APIs, or non-browser persistence layers.
