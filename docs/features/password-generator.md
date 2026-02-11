# Password Generator

## Purpose

Define KeeWeb-like password generator behavior for lite workflows.

## Scope

- Generator access from Unlock screen and workspace.
- Password generation, apply, and copy flows.
- Integration with immediate autosave and entry history.

## Functional Requirements

- Generator is available from:
  - Unlock screen
  - workspace entry editing flow
- Generator supports core options:
  - length
  - uppercase letters
  - lowercase letters
  - numbers
  - symbols
- `Generate` creates a new candidate password without mutating entry data until user applies it.
- `Apply` writes generated password to selected entry password field.
- Entry password apply follows immediate autosave pipeline.
- Entry password apply creates native KDBX history revision through normal edit path.
- `Copy` action is available for generated value.
- Lite keeps generator behavior in-app with fixed defaults (no settings page dependency).

## UI Requirements

- Generator opens as a focused panel/modal and can be dismissed with `Esc`.
- Generated password field supports reveal/hide and copy.
- `Generate` and `Apply` actions are clearly separated.
- Unlock screen generator can be used without an opened DB.

## Data and Storage

- Generator state can stay in Runtime Memory (non-persistent).
- No generated plaintext password is persisted by default.

## Failure Handling

- Apply failure keeps current entry password unchanged and surfaces error.
- Copy failure surfaces a clear error/toast.

## Security and Privacy

- Never log generated plaintext passwords.
- Do not persist generated plaintext passwords in localStorage or IndexedDB.

## Acceptance Criteria

- User can generate passwords from unlock and workspace contexts.
- Applied passwords persist through immediate autosave.
- Applied passwords are recoverable through native KDBX history.
