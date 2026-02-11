# Session Lock

## Purpose

Define automatic workspace lock behavior and unlock re-entry flow.

## Scope

- Idle timeout lock.
- Event-triggered lock.
- Unsaved-data handling during lock.

## Functional Requirements

- Default idle auto-lock timeout is `15` minutes.
- Auto-lock can be disabled with timeout `0`.
- Lock triggers:
  - inactivity timeout
  - minimize (if enabled)
  - OS lock/sleep (if enabled)
  - copy event (if enabled)
  - auto-type event (if enabled)
- On lock:
  - if no unsaved changes: close files and return to root/open page
  - if unsaved changes and autosave on: save then lock
  - if unsaved changes and autosave off: prompt save/discard/cancel
- On root/open page idle event, clear typed password input.

## UI Requirements

- Settings expose:
  - inactivity timeout
  - lock-on-minimize
  - lock-on-copy
  - lock-on-auto-type
  - lock-on-OS-lock/sleep

## Data and Storage

- Lock clears active unlocked workspace state.
- Re-entry requires unlock from root/open flow.

## Failure Handling

- Save errors during lock flow are visible and block silent data loss.
- User can explicitly decide save/discard/cancel when autosave is off.

## Security and Privacy

- Locked state must not expose decrypted entry content.

## Acceptance Criteria

- Lock triggers fire according to settings.
- Unsaved changes are handled safely.
- User returns to root/open page and must unlock again.
