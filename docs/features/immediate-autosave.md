# Immediate Autosave

## Purpose

Define a single save pipeline that persists every edit immediately.

## Scope

- Entry/group edits.
- Local, in-memory, and Drive-backed sources.

## Functional Requirements

- Any data mutation triggers save immediately.
- Save pipeline is serialized (one write in flight).
- If edits happen during save, queue another save run.
- Never drop pending edits.
- Source-specific persistence:
  - local writable: overwrite source file
  - in-memory/fallback: update encrypted cache/export state
  - Drive-backed: sync via Drive adapter

## UI Requirements

- Show save state continuously:
  - `saving`
  - `saved`
  - `error`
- Save status must reflect real persistence result, not optimistic completion.

## Data and Storage

- Queue/save state is maintained in app runtime state.
- Persisted targets depend on source adapter and configuration.

## Failure Handling

- Save errors keep unsaved/error indicators visible.
- Retry path must exist (auto retry and/or explicit user action).
- Failed save must never be marked as successful.

## Security and Privacy

- Do not log plaintext credentials or decrypted secret fields.

## Acceptance Criteria

- Every edit results in a persistence attempt.
- Rapid edit bursts do not corrupt data or lose updates.
- Failure states are explicit and recoverable.
