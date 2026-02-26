# Session Lock

## Purpose

Define automatic workspace lock behavior and unlock re-entry flow.

## Scope

- Idle timeout lock.

## Functional Requirements

- Idle auto-lock timeout is `15` minutes.
- Lite supports only this fixed timeout (no alternate timeout options).
- Lock triggers on inactivity: no `mousemove`, `keydown`, `mousedown`, `touchstart`, or `scroll` event for 15 minutes.
- On lock: close files and return to Unlock screen.

## Data and Storage

- Lock clears active unlocked workspace state from runtime app state (in-memory, non-persistent).
- Re-entry requires unlock from Unlock screen flow.

## Security and Privacy

- Locked state must not expose decrypted entry content.

## Acceptance Criteria

- Lock triggers after 15 minutes of inactivity.
- User returns to Unlock screen and must unlock again.
