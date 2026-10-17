# Unlock Screen

## Purpose

Define the startup and re-entry unlock screen for keeweb-lite, using a KeeWeb-like open-screen model with recent records and provider-specific import, create, and unlock actions.

## Scope

- Unlock is the startup screen shown when the app opens and before workspace is unlocked.
- Unlock is also used for re-entry after lock/logout/close-file flows.
- Unlock supports:
  - loading and rendering recent records from `record.repository`
  - quick unlock actions inspired by KeeWeb open flow (`Open`, `Import`, `Create`, and additional source actions)
  - creating a brand-new Local, Google Drive, or WebDAV database with a master password and optional generated key file
  - selecting an existing recent record
  - entering password and optional key file
  - submitting unlock for the selected record context
  - storing successful unlock result in runtime app state (in-memory store)
- Import and create forms own a cancellable setup operation. Closing a form aborts pending work. If WebDAV creation was already saved locally, the recovery record and generated key remain available.
- Unlock must support persisted record types:
  - `local`
  - `google-drive`
  - `webdav`
- Unlock preselects the latest accessed record by `lastOpenedAt`.
- Unlock also offers a `Demo` quick action that starts an in-memory-only, non-persisted `demo` session (see `docs/features/demo-mode.md`).

## Layout Regions

1. Inline status/message area
   - Shows unlock/load/import feedback.
   - Supports dismissing transient messages.
2. Quick actions area
   - Primary actions for opening existing records and importing or creating a database with an available provider.
   - `Create` and `Import` menus show the available registered providers: Local, WebDAV, and Google Drive when both public Google identifiers are configured.
   - Missing Google configuration hides Drive setup actions but does not make cached Drive records invalid.
   - `Demo` is a single button (no menu, no form) that immediately starts a demo session.
   - Provider setup actions are lazy-loaded with a visible loading state and a retryable load failure.
3. Source context selector
   - Provider choices: `Local`, `Google Drive`, and `WebDAV`.
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
- WebDAV forms accept a full HTTPS file URL and that database's connection credentials.

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
  - `true` while the selected provider import workflow is in flight.
- `isCreatingRecord`
  - `true` while the selected provider creation workflow is in flight.
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
- Type: `PersistedFileRecord` (or the in-memory-only `demo` session)
- Methods used by Unlock:
  - `readRecordStore`
  - `getRecordIssues`
  - `getRecords`
  - `createRecord`
  - `mutateRecord`
  - `forgetDatabase`
- `createLocalRecord` (`src/services/record.service.ts`) builds a new `local` record from a database name, master password, and optional generated key file.
- `createGoogleDriveRecord` builds a new Drive record. Its `source.id` comes from the Drive API response.
- `importWebDavRecord` downloads and unlocks the selected database before saving its connection in a separate encrypted credential record.
- `createDatabaseRecord` may return `created` or `saved-locally`. A locally saved remote creation includes its generated key file and can be recovered without claiming remote success.

Fields used by Unlock list and selection:

- Required:
  - `id`
  - `type`
  - `kdbx.name`
  - `lastOpenedAt` (optional in schema, used for default ordering when present)
- Google Drive-specific selected record data:
  - `source.id`
- WebDAV-specific selected record data:
  - `source.url`
  - a reference to the separate encrypted credential record

Default selection contract:

1. Sort records by `lastOpenedAt` descending when timestamp is present.
2. Records without `lastOpenedAt` keep repository return order relative to each other.
3. First record in resolved order is preselected.

Unlock-success persistence contract:

- After successful unlock, update `lastOpenedAt` on the latest persisted record while preserving its current database bytes and connection.

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
   - User selects a provider menu action.
   - User triggers `Import`.
   - Unlock runs the selected provider's import workflow, refreshes records, selects the imported record, then clears `isImportingRecord`.
   - For WebDAV, the record is committed only after the downloaded database unlocks successfully; closing the form cancels pending setup.
4. Create record
   - User opens `Create` and selects an available provider.
   - User enters a database name, master password, and confirms the password; optionally enables a generated key file.
   - Unlock sets `isCreatingRecord = true` and starts the provider creation workflow.
   - If a key file was requested, it downloads once the database is saved, including a remote creation saved locally after an uncertain result.
   - Refreshes records, selects the newly created record, then clears `isCreatingRecord`.
5. Select record
   - User selects a record in recent list.
   - Unlock form binds to selected record context.
6. Unlock
   - User enters password and optional key file.
   - Press `Enter` or click unlock action.
   - Unlock sets `isUnlocking = true`.
   - On success: writes unlocked session to runtime store, transitions to workspace, and persists `lastOpenedAt` on the current record.
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
- Google Drive setup is available only when both public identifiers are configured. Cached Drive records remain recognized and can be unlocked or downloaded while remote actions are unavailable.
- WebDAV setup requires HTTPS and a full file URL. Basic-auth usernames cannot contain a colon.
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
  - keep existing list/selection state unchanged when no local record was committed
  - if a remote creation result is uncertain after local persistence, retain the record, expose its generated key file, and report that remote confirmation is pending
- Unlock failure:
  - remain on Unlock
  - show explicit error and retry path
- Invalid or unsupported dropped file:
  - remain on current unlock context
  - show actionable validation message
- Metadata update failure after successful unlock:
  - workspace transition is not blocked
  - show non-blocking status feedback for metadata update failure
- Invalid or unsupported saved records:
  - report the affected record individually while keeping other valid records available
- Forget database:
  - warn when changes are pending, remove local database and encrypted connection state after confirmation, and leave the remote file untouched

## Acceptance Criteria

1. Startup and re-entry both land on Unlock before workspace is available.
2. Empty repository shows empty state and unlock is unavailable until open/import context exists.
3. Mixed Local, Google Drive, and WebDAV records render and can be selected.
4. Latest `lastOpenedAt` record is preselected on startup when available.
5. Quick action area supports open/import flow selection without leaving Unlock.
6. Importing a `local` record adds it and makes it selected immediately.
7. Importing a `google-drive` record with valid `source.id` adds it and makes it selected immediately.
8. Importing a WebDAV database persists its encrypted connection only after a successful unlock.
9. Creating a Local record adds it and selects it. Creating a remote record retains an explicit local recovery outcome when server confirmation fails.
10. A generated key file downloads after local persistence, including when remote creation is uncertain.
11. Pressing `Enter` triggers unlock for the current selected/open context.
12. Unlock failure keeps Unlock visible and surfaces actionable error text.
13. Unlock success transitions to workspace and updates selected record `lastOpenedAt` without replacing newer bytes.
14. Unlock success writes unlocked DB/session into runtime app state (in-memory, non-persistent).
15. Optional key-file unlock works for Local, Google Drive, and WebDAV.
16. Accessibility requirements pass for keyboard flow, focus order, and `aria-live` status updates.
17. At viewport width `<=768px`, unlock controls remain visible and usable while virtual keyboard is open.
18. At viewport width `<=768px`, provider dialogs remain scrollable without clipped footers, and the Google Picker remains actionable when opened from the Drive dialog.

## Out of Scope

- Detailed post-unlock workspace behavior (covered by `workspace-screen.md`).
- Non-lite provider behaviors outside Local, Google Drive, and WebDAV.
- Introducing additional persistence repositories beyond `record.repository`.
