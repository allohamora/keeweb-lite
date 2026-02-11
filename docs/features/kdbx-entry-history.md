# KDBX Entry History

## Purpose

Use native KDBX history as the only entry-history mechanism.

## Scope

- Native entry revision history in KDBX.
- History viewing and restoration in UI.

## Functional Requirements

- Entry edits create native KDBX history revisions.
- UI shows available historical versions for selected entry.
- User can inspect historical version data.
- User can restore a selected historical version.
- Restored version follows normal save/sync pipeline.

## UI Requirements

- History section is available in entry details.
- Restore action is explicit and confirms selected version target.

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
- User can inspect and restore prior versions.
- Restored state persists after save/sync.
