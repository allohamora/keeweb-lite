# Username Suggestions

## Purpose

Speed up entering usernames by suggesting values already used in other entries in the same database, inspired by upstream KeeWeb's username autocomplete.

## Scope

- The Username field in the entry edit form.

## Functional Requirements

- Suggestions are collected from the `UserName` field of all entries in the database, excluding entries in the recycle bin.
- Suggested values are trimmed but not otherwise normalized — case is preserved, and case-distinct duplicates (e.g. `Alice` and `alice`) are both kept as separate suggestions.
- Blank/whitespace-only usernames are excluded from suggestions.
- The Username field always accepts arbitrary free text; suggestions are a convenience only and never constrain or validate the saved value.

## UI Requirements

- The suggestions dropdown opens when the Username field is clicked, showing all known usernames.
- As the user types, the list filters to usernames containing the typed text (case-insensitive).
- Clicking a suggestion fills the field with that value.
- The existing copy-to-clipboard action for the Username field is preserved.

## Data and Storage

- `getAllUsernames(database)` (`src/services/workspace.service.ts`) derives the suggestion list: flattens all non-recycle-bin groups' entries, reads each entry's `UserName` field via `getFieldText`, trims it, and deduplicates with `Set` (first-encountered casing wins).
- No new persisted state — suggestions are derived from the already-open database on each render of the entry edit form.

## Failure Handling

- If no other entries have a username set, or nothing matches what's typed, the dropdown does not appear; the field remains fully usable as plain free text.

## Acceptance Criteria

- Clicking the Username field shows a dropdown of usernames used elsewhere in the database.
- Typing filters the dropdown case-insensitively.
- Selecting a suggestion fills the field with that username.
- Entering a username not in the list is accepted and saved normally.
- Usernames belonging only to recycle-bin entries are not suggested.
