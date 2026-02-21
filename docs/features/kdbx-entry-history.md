# KDBX Entry History

## Purpose

Use native KDBX history as the only entry-history mechanism.

## Scope

- Native entry revision history in KDBX.
- History viewing and restoration in UI.

## Functional Requirements

- Entry edits create native KDBX history revisions.
- UI shows available historical versions for selected entry.
- User can view revision number and last modification date for each historical version.
- User can apply a historical version to the edit form and then save to restore it.
- Restored version follows normal save/sync pipeline.

## UI Requirements

- History section is available in the entry edit form within entry details.
- Each history revision shows its revision number and last modification date.
- Applying a revision loads its field values into the edit form; the user must explicitly save to persist the restore.

## Data and Storage

- History is stored inside encrypted `.kdbx` data only.
- No parallel custom snapshot system is introduced.

## Failure Handling

- Restore/save failure keeps current state consistent and reports error.
- Failed restore does not silently corrupt entry state.

## Security and Privacy

- History remains encrypted as part of KDBX file content.

## Acceptance Criteria

- Editing produces visible native history revisions.
- History section in the edit form shows revision number and last modification date for each revision.
- Applying a revision populates the edit form with its field values.
- Restored state persists after the user explicitly saves.
