# Session Lock

## Purpose

Define automatic workspace lock behavior and unlock re-entry flow.

## Scope

- Idle timeout lock.
- Event-triggered lock.
- Unsaved-data handling during lock.

## Functional Requirements

- Idle auto-lock timeout is `15` minutes.
- Lock triggers:
  - inactivity timeout
  - minimize (`on`, KeeWeb default)
  - OS lock/sleep (`off`, KeeWeb default)
  - copy event (`off`, KeeWeb default)
  - auto-type event (`off`, KeeWeb default)
- On lock:
  - if no unsaved changes: close files and return to root/open page
  - if unsaved changes: save-first policy (KeeWeb default)
- On root/open page idle event, clear typed password input.

## Data and Storage

- Lock clears active unlocked workspace state from Runtime Memory (non-persistent).
- Re-entry requires unlock from root/open flow.

## Failure Handling

- Save errors during lock flow are visible and block silent data loss.
- User can explicitly decide save/discard/cancel when autosave is off.

## Security and Privacy

- Locked state must not expose decrypted entry content.

## Acceptance Criteria

- Lock triggers fire according to fixed defaults.
- Unsaved changes are handled safely.
- User returns to root/open page and must unlock again.
