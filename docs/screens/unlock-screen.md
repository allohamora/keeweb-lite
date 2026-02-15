# Unlock Screen

## Purpose

Define the startup and re-entry unlock screen for keeweb-lite, using a KeeWeb-like open-screen model with quick actions, recent records, and credential-based unlock for local and Google Drive records.

## Scope

- Unlock is the startup screen shown when the app opens and before workspace is unlocked.
- Unlock is also used for re-entry after lock/logout/close-file flows.
- Unlock supports:
  - loading and rendering recent records from `record.repository`
  - quick unlock actions inspired by KeeWeb open flow (`Open`, `Add record`, and additional source actions)
  - selecting an existing recent record
  - entering password and optional key file
  - submitting unlock for the selected record context
  - storing successful unlock result in runtime app state (Zustand-style in-memory store)
- Unlock must support both record types:
  - `local`
  - `google-drive`
- Unlock preselects the latest accessed record by `lastOpenedAt`.

## Layout Regions

1. Inline status/message area
   - Shows unlock/load/create feedback.
   - Supports dismissing transient messages.
2. Quick actions area
   - Primary actions for opening existing records and creating records.
   - Secondary source actions for lite-supported providers.
3. Source context selector
   - Values: `Local`, `Google Drive`.
   - Controls create/open context.
4. Unlock credentials area
   - Password input.
   - Optional key file control.
   - Unlock submit action.
5. Recent records panel
   - Displays recent records and selection state.
6. Optional drop area
   - Supports drag-and-drop local `.kdbx` open flow.

## State Model

View states:

- `loading-records`
  - Initial state.
  - Calls `getRecords`.
- `no-records`
  - Rendered when `getRecords` resolves to `[]`.
  - Shows empty-state guidance and create/open actions.
- `ready`
  - Rendered when at least one record exists or a valid open context is selected.
  - Recent records, unlock controls, and quick actions are available.
- `drag-over`
  - Temporary state while valid local file drag interaction is active.

Transient operation flags (not top-level view states):

- `isCreatingRecord`
  - `true` while `createRecord` is in flight.
- `isUnlocking`
  - `true` while unlock request is in flight.
- `inlineMessage`
  - Holds actionable load/create/unlock/drop errors while keeping current view state.

View-state transitions:

1. `loading-records` -> `no-records` when no records are found.
2. `loading-records` -> `ready` when records are found.
3. `no-records` -> `ready` after successful create/open context setup.
4. `ready` <-> `drag-over` during drag enter/leave lifecycle.
5. `ready` -> workspace transition after successful unlock.
6. Any state may keep current view and set `inlineMessage` on failure.

## Data Bindings to `record.repository`

Repository source of truth:

- `src/repositories/record.repository.ts`
- Type: `FileRecord`
- Methods used by Unlock:
  - `getRecords`
  - `createRecord`
  - `updateRecord`

Fields used by Unlock list and selection:

- Required:
  - `id`
  - `type`
  - `kdbx.name`
  - `lastOpenedAt` (optional in schema, used for default ordering when present)
- Google Drive specific on selected record:
  - `source.id`
  - optional `sync.status`
  - optional `oauth`

Default selection contract:

1. Sort records by `lastOpenedAt` descending when timestamp is present.
2. Records without `lastOpenedAt` keep repository return order relative to each other.
3. First record in resolved order is preselected.

Unlock-success persistence contract:

- After successful unlock, update selected record using `updateRecord` with refreshed `lastOpenedAt` timestamp.

Unlock-success runtime state contract:

- After credentials are validated and DB is unlocked, store unlocked session state in app runtime store (for example, Zustand):
  - unlocked database model
  - selected record `id`
  - selected record `type`
  - source context needed by workspace actions
- Runtime state store must be memory-only for unlocked data:
  - no persistence middleware for decrypted/unlocked model
  - clear unlocked state on lock/logout/close-file flow

## User Flows

1. Initial load
   - Unlock enters `loading-records`.
   - Calls `getRecords`.
   - Resolves to `no-records` or `ready`.
   - In `ready`, preselects record by latest `lastOpenedAt`.
2. Quick action selection
   - User chooses open/create action and source context.
   - Unlock updates active open/create context without leaving screen.
3. Create record
   - User picks source (`Local` or `Google Drive`).
   - User triggers `Add record`.
   - Unlock sets `isCreatingRecord = true`, calls `createRecord`, refreshes records, selects created record, then clears `isCreatingRecord`.
4. Select record
   - User selects a record in recent list.
   - Unlock form binds to selected record context.
5. Unlock
   - User enters password and optional key file.
   - Press `Enter` or click unlock action.
   - Unlock sets `isUnlocking = true`.
   - On success: writes unlocked session to runtime store, transitions to workspace, and persists `lastOpenedAt` through `updateRecord`.
   - On failure: sets `inlineMessage`, clears `isUnlocking`, and stays on Unlock.
6. Drag-and-drop local open
   - User drags local `.kdbx` onto drop area.
   - Unlock validates local-file context and proceeds with standard credential unlock flow.

## Validation Rules

- Unlock submit is blocked when:
  - no open/selected record context exists
  - password is empty
- `createRecord` payload validation follows repository schema:
  - `local` record must not include Google Drive-only fields.
  - `google-drive` record must include valid `source` with `id`.
- Key file is optional; when provided, it is treated as unlock credential input only.
- Source selector labels are fixed:
  - `Local`
  - `Google Drive`
- Drag-and-drop open accepts supported local `.kdbx` file input only.

## Accessibility Requirements

- Keyboard-only flow must support:
  - tab navigation across quick actions, selector, recent records, and unlock controls
  - `Enter` to submit unlock
- Focus behavior:
  - focus moves to password input when selection changes or when a record is created and selected
  - focus remains within actionable controls on errors
- Inline status/message area uses `aria-live="polite"`.
- Selection state for recent records is programmatically exposed (for example, `aria-selected`).

## Security and Privacy

- Never log plaintext password, key-file content, OAuth tokens, or decrypted values.
- Entered password and raw key bytes remain runtime memory only.
- Do not persist plaintext unlock credentials in IndexedDB/localStorage.

## Failure Handling

- `getRecords` failure:
  - show inline load error
  - keep retry path available
- `createRecord` failure:
  - keep existing list/selection state unchanged
  - show inline actionable message
- Unlock failure:
  - remain on Unlock
  - show explicit error and retry path
- Invalid or unsupported dropped file:
  - remain on current unlock context
  - show actionable validation message
- `updateRecord` failure after successful unlock:
  - workspace transition is not blocked
  - show non-blocking status feedback for metadata update failure

## Acceptance Criteria

1. Startup and re-entry both land on Unlock before workspace is available.
2. Empty repository shows empty state and unlock is unavailable until open/create context exists.
3. Mixed `local` and `google-drive` records render and can be selected.
4. Latest `lastOpenedAt` record is preselected on startup when available.
5. Quick action area supports open/create flow selection without leaving Unlock.
6. Creating a `local` record adds it and makes it selected immediately.
7. Creating a `google-drive` record with valid `source.id` adds it and makes it selected immediately.
8. Pressing `Enter` triggers unlock for the current selected/open context.
9. Unlock failure keeps Unlock visible and surfaces actionable error text.
10. Unlock success transitions to workspace and updates selected record `lastOpenedAt`.
11. Unlock success writes unlocked DB/session into runtime app state (Zustand-style, non-persistent).
12. Optional key-file path is supported for both record types.
13. Accessibility requirements pass for keyboard flow, focus order, and `aria-live` status updates.

## Out of Scope

- Creating a brand-new empty vault file.
- Detailed post-unlock workspace behavior (covered by `workspace-screen.md`).
- Non-lite provider behaviors outside `local` and `google-drive`.
- Introducing additional persistence repositories beyond `record.repository`.
