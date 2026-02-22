# Entry Remove and Restore

## Purpose

Allow users to remove entries from their database and restore entries that have been moved to the recycle bin.

## Scope

- Removing an entry from the entry edit form.
- Restoring a trashed entry to the default group from the entry edit form.

## Functional Requirements

- A **Remove** button is always visible in the entry edit form.
  - If the entry is **not** in the recycle bin and the recycle bin is enabled, Remove moves the entry to the recycle bin.
  - If the entry is **already** in the recycle bin, Remove permanently deletes it.
  - If the recycle bin is disabled, Remove permanently deletes the entry.
- A **Restore** button is visible in the entry edit form **only** when the selected entry is in the recycle bin.
  - Restore moves the entry to the database default group.
- Both actions require confirmation via a modal dialog before executing.
- Both actions auto-save the database after execution (immediate autosave).
- Both actions show a success or failure toast notification after execution.

## UI Requirements

- Remove button uses destructive styling.
- Restore button uses default styling (non-destructive).
- Remove and Restore buttons are placed flush-left in the edit form action row; Save is flush-right.
- Remove modal title includes a `(?)` tooltip explaining the conditional behavior (recycle bin vs. permanent delete).
- Restore modal title includes a `(?)` tooltip stating the entry will be moved to the default group.

## Data and Storage

- Remove with recycle bin enabled: `kdbx.remove(entry)` — kdbxweb moves entry to the recycle bin group.
- Remove from recycle bin (permanent): `kdbx.move(entry, null)` — kdbxweb permanently deletes the entry.
- Restore: `kdbx.move(entry, database.getDefaultGroup())` — moves entry to the default group.
- All mutations operate on a cloned database to avoid mutating the in-memory state before a successful save.
- `previousParentGroup` (KDBX 4.1+) is not used for restore because it is unreliable across client versions; restoring to the default group is the safe, consistent choice.

## Failure Handling

- If the operation fails, the original database state is preserved (mutations happen on a clone).
- An error toast with the failure reason is shown.

## Acceptance Criteria

- Remove button is always shown in the edit form.
- Restore button is shown only when the entry is in the recycle bin.
- Confirming Remove on a non-trash entry moves it to the recycle bin when the recycle bin is enabled.
- Confirming Remove on a trash entry permanently deletes it.
- Confirming Restore moves the entry from the recycle bin to the default group.
- Success and failure toasts are shown after each operation.
- The original database is not mutated when an operation fails.

## Future Considerations

If users need to restore an entry to a specific group rather than the default group, consider introducing a dedicated **Move** action:

- A **Move** button opens a modal with a group selector (default group, recycle bin, and all other user-created groups).
- The existing **Remove** button in that modal would only perform permanent deletion (no recycle bin logic).
- This approach replaces the current dual-behavior Remove (move-to-trash vs. permanent delete) with explicit, separate actions: Move (for repositioning) and Remove (for permanent deletion only).
