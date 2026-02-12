# Screen 07: Session Lock

Goal: enforce lock behavior for inactivity and visibility events with safe handling of pending changes.

## Why This Screen Exists

Lock behavior is a security boundary. It must protect decrypted state without silently losing unsaved work.

## Source Docs

- [Session Lock](../features/session-lock.md)
- [Immediate Autosave](../features/immediate-autosave.md)
- [Interface](../features/interface.md)

## Checklist

1. [ ] Implement fixed 15-minute idle timeout lock trigger (no configurable alternatives in lite). Done when inactivity always returns app to lock path.
2. [ ] Implement visibility-triggered lock behavior for browser mapping of `lockOnMinimize = true` (`visibilitychange` and `pagehide` path). Done when background/minimize transitions trigger lock behavior.
3. [ ] Keep lite defaults fixed for `lockOnOsLock = false`, `lockOnCopy = false`, `lockOnAutoType = false`. Done when these flags are represented as fixed booleans, not settings UI.
4. [ ] On lock with clean state, clear unlocked model from runtime memory and return to Unlock screen. Done when decrypted workspace content is no longer accessible.
5. [ ] On lock with pending changes, enforce save-first handling before completing lock transition. Done when lock path does not drop unsaved edits.
6. [ ] If lock-time save fails, keep explicit error state visible and require user choice to retry/discard. Done when failures are never silent.
7. [ ] Clear typed password input on Unlock-screen idle event. Done when stale typed credentials are not left in the form.
8. [ ] Add tests for idle lock, visibility lock, save-failure during lock, and post-lock re-entry requirements. Done when locked state requires unlock and preserves data-safety semantics.
