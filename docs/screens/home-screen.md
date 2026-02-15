# Home Screen

## Purpose

Define the startup unlock screen for keeweb-lite, including recent record selection, record creation, and unlock submission for local and Google Drive records.

## Scope

- Home is the startup screen shown when the app opens and before workspace is unlocked.
- Home supports:
  - loading and rendering recent records from `record.repository`
  - creating a new record entry through `createRecord`
  - selecting an existing record
  - entering password and optional key file
  - submitting unlock for the selected record
  - storing successful unlock result in runtime app state (Zustand-style in-memory store)
- Home must support both record types:
  - `local`
  - `google-drive`
- Home preselects the latest accessed record by `lastOpenedAt`.

## Layout Regions

1. Source selector
   - Values: `Local`, `Google Drive`
   - Controls create flow context and default selection filtering behavior (if UI provides filtering).
2. Recent records panel
   - Displays records from `getRecords`.
   - Shows, at minimum, `kdbx.name`, type label, and `lastOpenedAt` when available.
3. Record actions
   - `Add record` action creates a repository record for the selected source.
4. Unlock form
   - Password input.
   - Optional key file control.
   - Open/unlock submit action.
5. Inline status/error area
   - Displays loading, create, and unlock feedback.
   - Includes actionable error messaging.

## State Model

View states:

- `loading-records`
  - Initial state.
  - Calls `getRecords`.
- `no-records`
  - Rendered when `getRecords` resolves to `[]`.
  - Shows empty message (`No records found`) and `Add record` action.
  - Unlock controls are hidden or disabled.
- `ready`
  - Rendered when at least one record exists.
  - Records list is visible and password input is visible.
  - Default selected record is latest by `lastOpenedAt`.

Transient operation flags (not top-level view states):

- `isCreatingRecord`
  - `true` while `createRecord` is in flight.
- `isUnlocking`
  - `true` while unlock request is in flight.
- `inlineErrorMessage`
  - Holds actionable create/unlock/load errors while keeping current view state.

View-state transitions:

1. `loading-records` -> `no-records` when no records are found.
2. `loading-records` -> `ready` when at least one record is found.
3. `no-records` -> `ready` after successful create + refresh.
4. `ready` -> workspace transition after successful unlock.
5. Any state may keep current view and set `inlineErrorMessage` on failure.

## Data Bindings to `record.repository`

Repository source of truth:

- `src/repositories/record.repository.ts`
- Type: `FileRecord`
- Methods used by Home:
  - `getRecords`
  - `createRecord`
  - `updateRecord`

Fields used by Home list and selection:

- Required:
  - `id`
  - `type`
  - `kdbx.name`
  - `lastOpenedAt` (optional in schema, required for default ordering when present)
- Google Drive specific on selected record:
  - `source.id`
  - optional `sync.status`
  - optional `oauth`

Create action contract:

```ts
// Local
createRecord({
  id,
  type: 'local',
  kdbx,
  lastOpenedAt, // optional
});

// Google Drive
createRecord({
  id,
  type: 'google-drive',
  source,
  kdbx,
  sync, // optional
  oauth, // optional
  lastOpenedAt, // optional
});
```

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
   - Home enters `loading-records`.
   - Calls `getRecords`.
   - Resolves to `no-records` or `ready`.
   - In `ready`, preselect record by latest `lastOpenedAt`.
2. Create record
   - User picks source (`Local` or `Google Drive`).
   - User triggers `Add record`.
   - Home sets `isCreatingRecord = true`, calls `createRecord`, refreshes records, selects created record, then clears `isCreatingRecord`.
3. Select record
   - User selects a record in recent list.
   - Unlock form binds to selected record context.
4. Unlock
   - User enters password and optional key file.
   - Press `Enter` or click open/unlock action.
   - Home sets `isUnlocking = true`.
   - On success: write unlocked session to runtime store, transition to workspace, and persist `lastOpenedAt` through `updateRecord`.
   - On failure: set `inlineErrorMessage`, clear `isUnlocking`, and stay on Home.

## Validation Rules

- Unlock submit is blocked when:
  - no record is selected
  - password is empty
- `createRecord` payload validation follows repository schema:
  - `local` record must not include Google Drive-only fields.
  - `google-drive` record must include valid `source` with `id`.
- Key file is optional; when provided, it is treated as unlock credential input only.
- Source selector labels are fixed:
  - `Local`
  - `Google Drive`

## Accessibility Requirements

- Keyboard-only flow must support:
  - tab navigation across selector, recents, actions, and unlock form
  - `Enter` to submit unlock
- Focus behavior:
  - focus moves to password input when selection changes or when a record is created and selected
  - focus remains within actionable controls on errors
- Inline status/error area uses `aria-live="polite"`.
- Selection state for recent records is programmatically exposed (for example, `aria-selected`).

## Security and Privacy

- Never log plaintext password, key-file content, or decrypted values.
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
  - remain on Home
  - show explicit error and retry path
- `updateRecord` failure after successful unlock:
  - workspace transition is not blocked
  - show non-blocking status feedback for metadata update failure

## Acceptance Criteria

1. Empty repository shows empty state and disabled unlock until a record is created.
2. Mixed `local` and `google-drive` records render and can be selected.
3. Latest `lastOpenedAt` record is preselected on startup.
4. Creating a `local` record adds it and makes it selected immediately.
5. Creating a `google-drive` record with valid `source.id` adds it and makes it selected immediately.
6. Pressing `Enter` triggers unlock for the currently selected record.
7. Unlock failure keeps Home visible and surfaces actionable error text.
8. Unlock success transitions to workspace and updates selected record `lastOpenedAt`.
9. Unlock success writes unlocked DB/session into runtime app state (Zustand-style, non-persistent).
10. Optional key-file path is supported for both record types.
11. Accessibility requirements pass for keyboard flow, focus order, and `aria-live` status updates.

## Out of Scope

- Creating a brand-new empty vault file.
- Workspace layout/details behavior after unlock (covered by feature-level interface docs).
- Introducing additional persistence repositories beyond `record.repository`.
