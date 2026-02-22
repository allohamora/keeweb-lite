# Password Generator

## Purpose

Define KeeWeb-like password generator behavior for lite workflows.

## Scope

- Generator access from workspace entry editing flow.
- Password generation, apply, and copy flows.
- Integration with entry edit flow and existing save/history pipeline.

## Functional Requirements

- Generator is available from workspace entry editing flow.
- Generator supports core options:
  - length
  - uppercase letters
  - lowercase letters
  - numbers
  - symbols
- `Generate` creates a new candidate password without mutating entry data until user applies it.
- `Apply` writes generated password to selected entry password field in form state only.
- Applied password is persisted only when user explicitly saves the entry form.
- Save after apply creates native KDBX history revision through normal edit path.
- Lite keeps generator behavior in-app with fixed defaults (no settings page dependency).
- Password generation uses cryptographic randomness.

## UI Requirements

- Generator opens as a focused panel/modal and can be dismissed with `Esc`.
- Generated password field supports reveal/hide.
- `Generate` and `Apply` actions are clearly separated.

## Data and Storage

- Generator state can stay in runtime app state (in-memory, non-persistent).
- No generated plaintext password is persisted by default.

## Failure Handling

- Apply failure keeps current entry password unchanged and surfaces error.

## Security and Privacy

- Never log generated plaintext passwords.
- Do not persist generated plaintext passwords in localStorage or IndexedDB.

## Acceptance Criteria

- User can generate passwords from workspace entry edit context.
- Apply updates password field without persisting until user clicks save.
- Saving after apply persists changes through normal entry-save pipeline.
- Saved applied passwords are recoverable through native KDBX history.
