# Unlock Screen

## Purpose

Define the startup and re-entry unlock screen for keeweb-lite, using a KeeWeb-like open-screen model with quick actions, recent records, and credential-based unlock for local and Google Drive records.

## Scope

- Unlock is the startup screen shown when the app opens and before workspace is unlocked.
- Unlock is also used for re-entry after lock/logout/close-file flows.
- Unlock supports:
  - loading and rendering recent records from `record.repository`
  - quick unlock actions inspired by KeeWeb open flow (`Open`, `Import`, `Create`, and additional source actions)
  - creating a brand-new, empty local record (database name, master password, optional generated key file)
  - selecting an existing recent record
  - entering password and optional key file
  - submitting unlock for the selected record context
  - storing successful unlock result in runtime app state (in-memory store)
- Unlock must support both record types:
  - `local`
  - `google-drive`
- Unlock preselects the latest accessed record by `lastOpenedAt`.

## Layout Regions

1. Inline status/message area
   - Shows unlock/load/import feedback.
   - Supports dismissing transient messages.
2. Quick actions area
   - Primary actions for opening existing records, importing records, and creating a new local record.
   - `Create` is a menu with `Local` and `Google Drive` options (mirrors the `Import` menu shape).
   - Secondary source actions for lite-supported providers.
3. Source context selector
   - Values: `Local`, `Google Drive`.
   - Controls import/open context.
4. Unlock credentials area
   - Password input.
   - Optional key file control.
   - Unlock submit action.
5. Recent records panel
   - Displays recent records and selection state.
6. Optional drop area
   - Supports drag-and-drop local `.kdbx` open flow.

## Mobile Layout (`<=768px`)

- Unlock layout is top-anchored and scrollable on mobile instead of vertically centered.
- Header actions and form action rows wrap/stack to keep controls reachable with on-screen keyboard.
- Unlock and remove actions remain full-width touch targets in mobile layout.
- Import-record dialogs use viewport-aware max-height with internal scrolling to prevent clipped controls.
- Google Picker remains actionable when opened above the Google Drive import dialog.

## State Model

View states:

- `loading-records`
  - Initial state.
  - Calls `getRecords`.
- `no-records`
  - Rendered when `getRecords` resolves to `[]`.
  - Shows empty-state guidance and import/open actions.
- `ready`
  - Rendered when at least one record exists or a valid open context is selected.
  - Recent records, unlock controls, and quick actions are available.
- `drag-over`
  - Temporary state while valid local file drag interaction is active.

Transient operation flags (not top-level view states):

- `isImportingRecord`
  - `true` while `importLocalRecord`/`importGoogleDriveRecord` is in flight.
- `isCreatingRecord`
  - `true` while `createLocalRecord`/`createGoogleDriveRecord` is in flight.
- `isUnlocking`
  - `true` while unlock request is in flight.
- `inlineMessage`
  - Holds actionable load/import/create/unlock/drop errors while keeping current view state.

View-state transitions:

1. `loading-records` -> `no-records` when no records are found.
2. `loading-records` -> `ready` when records are found.
3. `no-records` -> `ready` after successful import/create/open context setup.
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
- `createLocalRecord` (`src/services/record.service.ts`) builds a brand-new empty `local` record (calls `createRecord` internally) from a database name, master password, and optional generated key file.
- `createGoogleDriveRecord` (`src/services/record.service.ts`) builds a brand-new empty `google-drive` record (uploads it to Drive via `createFile`, then calls `createRecord` internally) from a database name, master password, and optional generated key file; `source.id` is taken from the Drive API response, not caller-supplied.

Fields used by Unlock list and selection:

- Required:
  - `id`
  - `type`
  - `kdbx.name`
  - `lastOpenedAt` (optional in schema, used for default ordering when present)
- Google Drive specific on selected record:
  - `source.id`

Default selection contract:

1. Sort records by `lastOpenedAt` descending when timestamp is present.
2. Records without `lastOpenedAt` keep repository return order relative to each other.
3. First record in resolved order is preselected.

Unlock-success persistence contract:

- After successful unlock, update selected record using `updateRecord` with refreshed `lastOpenedAt` timestamp.

Unlock-success runtime state contract:

- After credentials are validated and DB is unlocked, store unlocked session state in app runtime store:
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
   - User chooses open/import action and source context.
   - Unlock updates active open/import context without leaving screen.
3. Import record
   - User picks source (`Local` or `Google Drive`).
   - User triggers `Import`.
   - Unlock sets `isImportingRecord = true`, calls `importLocalRecord`/`importGoogleDriveRecord`, refreshes records, selects imported record, then clears `isImportingRecord`.
4. Create record
   - User opens the `Create` menu and selects `Local` or `Google Drive`.
   - User enters a database name, master password, and confirms the password; optionally enables a generated key file.
   - Unlock sets `isCreatingRecord = true`, calls `createLocalRecord`/`createGoogleDriveRecord`.
   - If a key file was requested, the generated key file bytes are downloaded automatically once creation succeeds.
   - Refreshes records, selects the newly created record, then clears `isCreatingRecord`.
5. Select record
   - User selects a record in recent list.
   - Unlock form binds to selected record context.
6. Unlock
   - User enters password and optional key file.
   - Press `Enter` or click unlock action.
   - Unlock sets `isUnlocking = true`.
   - On success: writes unlocked session to runtime store, transitions to workspace, and persists `lastOpenedAt` through `updateRecord`.
   - On failure: sets `inlineMessage`, clears `isUnlocking`, and stays on Unlock.
7. Drag-and-drop local open
   - User drags local `.kdbx` onto drop area.
   - Unlock validates local-file context and proceeds with standard credential unlock flow.

## Validation Rules

- Unlock submit is blocked when:
  - no open/selected record context exists
  - password is empty
- Persisted record follows repository schema:
  - `local` record must not include Google Drive-only fields.
  - `google-drive` record must include valid `source` with `id`.
- Key file is optional; when provided, it is treated as unlock credential input only.
- `createLocalRecord`/`createGoogleDriveRecord` submit is blocked when:
  - database name is empty
  - master password is empty
  - confirm password does not match master password
  - for `local` only: a `local` record already exists with the resulting name (a `.kdbx` suffix is appended automatically if not typed); `google-drive` create has no equivalent duplicate-name check, since Drive itself permits multiple files with the same name and the uniqueness key (`source.id`) doesn't exist until after the file is created
- Source selector labels are fixed:
  - `Local`
  - `Google Drive`
- Drag-and-drop open accepts supported local `.kdbx` file input only.

## Accessibility Requirements

- Keyboard-only flow must support:
  - tab navigation across quick actions, selector, recent records, and unlock controls
  - `Enter` to submit unlock
- Focus behavior:
  - focus moves to password input when selection changes or when a record is imported and selected
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
- Import failure:
  - keep existing list/selection state unchanged
  - show inline actionable message
- Create failure:
  - keep existing list/selection state unchanged
  - show inline actionable message (for example, duplicate name)
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
2. Empty repository shows empty state and unlock is unavailable until open/import context exists.
3. Mixed `local` and `google-drive` records render and can be selected.
4. Latest `lastOpenedAt` record is preselected on startup when available.
5. Quick action area supports open/import flow selection without leaving Unlock.
6. Importing a `local` record adds it and makes it selected immediately.
7. Importing a `google-drive` record with valid `source.id` adds it and makes it selected immediately.
8. Creating a `local` record adds it and makes it selected immediately; when a key file is requested, it downloads automatically on success.
9. Creating a `google-drive` record adds it, makes it selected immediately, uploads a new file to Drive root, and is automatically sync-eligible thereafter; when a key file is requested, it downloads automatically on success.
10. Pressing `Enter` triggers unlock for the current selected/open context.
11. Unlock failure keeps Unlock visible and surfaces actionable error text.
12. Unlock success transitions to workspace and updates selected record `lastOpenedAt`.
13. Unlock success writes unlocked DB/session into runtime app state (in-memory, non-persistent).
14. Optional key-file path is supported for both record types.
15. Accessibility requirements pass for keyboard flow, focus order, and `aria-live` status updates.
16. At viewport width `<=768px`, unlock controls remain visible and usable while virtual keyboard is open.
17. At viewport width `<=768px`, import local/drive dialogs remain scrollable without clipped footers, and the Google Picker remains actionable when opened from the Drive dialog.

## Out of Scope

- Detailed post-unlock workspace behavior (covered by `workspace-screen.md`).
- Non-lite provider behaviors outside `local` and `google-drive`.
- Introducing additional persistence repositories beyond `record.repository`.
