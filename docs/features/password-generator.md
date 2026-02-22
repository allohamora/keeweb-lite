# Password Generator

## Purpose

Define KeeWeb-like password generator behavior for lite workflows.

## Scope

- Generator access from workspace entry editing flow.
- Password generation and apply flow.
- Integration with entry edit flow and existing save/history pipeline.

## Functional Requirements

- Generator is available from workspace entry editing flow.
- Generator supports core options:
  - length
  - uppercase letters
  - lowercase letters
  - numbers
  - symbols
- Generator uses fixed limits:
  - minimum length: `4`
  - maximum length: `64`
  - Length validation is not applied when all character ranges are disabled; in that case a separate "no character ranges enabled" error takes precedence.
- Generator default options are:
  - length: `16`
  - uppercase: enabled
  - lowercase: enabled
  - numbers: enabled
  - symbols: disabled
- On form initialization, options are derived from current entry password:
  - empty or whitespace-only password falls back to defaults
  - non-empty password keeps exact string length and enables ranges detected from characters present
- `Generate` creates a new candidate password without mutating entry data until user applies it.
- `Apply` writes generated password to selected entry password field in form state only.
- Applied password is persisted only when user explicitly saves the entry form.
- Save after apply creates native KDBX history revision through normal edit path.
- Lite keeps generator behavior in-app with fixed defaults (no settings page dependency).
- Generated password includes at least one character from each enabled range.
- Character ranges include all standard characters.
- If all ranges are disabled, generated password value is an empty string; this is a distinct "no character ranges enabled" validation error — length validation is not applied in this case.
- Password generation uses runtime random helpers from `src/lib/random.lib.ts`.
- Random values come from `src/lib/crypto.lib.ts`, which normalizes `kdbx.CryptoEngine.random(4)` bytes to `[0, 1)`.
- Shuffle behavior is score-based: each item gets one random score, then items are sorted by score to produce a new array.

## UI Requirements

- Generator opens as a focused panel/modal and can be dismissed with `Esc`.
- Generated password field supports reveal/hide.
- Generator modal includes:
  - generated password field
  - length input
  - range checkboxes (`Uppercase`, `Lowercase`, `Numbers`, `Symbols`)
- `Generate` and `Apply` actions are clearly separated.

## Data and Storage

- Generator state can stay in runtime app state (in-memory, non-persistent).
- No generated plaintext password is persisted by default.

## Failure Handling

- Length and generated-password validation failures are shown inline in generator form.
- Apply does not mutate entry password when generated-password value is invalid.

## Security and Privacy

- Never log generated plaintext passwords.
- Do not persist generated plaintext passwords in localStorage or IndexedDB.

## Acceptance Criteria

- User can generate passwords from workspace entry edit context.
- Apply updates password field without persisting until user clicks save.
- Saving after apply persists changes through normal entry-save pipeline.
- Saved applied passwords are recoverable through native KDBX history.
- Generator enforces length constraints `4..64` in UI validation and generation service.
