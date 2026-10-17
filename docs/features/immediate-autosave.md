# Save and synchronization

## Purpose

Describe how an explicit workspace Save persists encrypted database bytes and starts remote synchronization.

## Scope

- Local, Google Drive, and WebDAV records.
- Entry edits, history changes, entry creation, removal, and restore.
- The in-memory-only demo session, which does not persist edits.

## Functional Requirements

- Typing in an entry form changes only the in-memory draft. It does not save the database.
- The user chooses `Save` to apply an entry draft. Unsaved drafts remain protected by the navigation guard and can be explicitly discarded.
- A save serializes the updated KDBX database and persists it before requesting remote synchronization.
- Local records update their encrypted bytes and local generation.
- Remote records atomically compare the captured generation, store encrypted bytes, increment the generation, preserve the verified common snapshot, and mark pending changes.
- A remote save is complete when the local encrypted write succeeds. It does not wait for server confirmation.
- Remote synchronization starts after unlock and a completed save. It can also be requested when returning to a visible tab, when connectivity returns with pending work or a network error, and by manual retry. It does not poll on an interval.
- At most one sync pass runs per session, with at most one requested follow-up pass. A new local save cannot be replaced by an older in-flight result.

## Status

- `Syncing`: a remote pass is running.
- `Saved locally`: the encrypted bytes are persisted and remote confirmation is pending.
- `Synced`: remote synchronization has no pending work.
- `Sync error`: the latest remote pass failed. If data is pending, the UI also shows `Saved locally`.
- Local records have no remote synchronization status. Demo records are not saved to IndexedDB.

## Failure Handling

- A local persistence error keeps the entry form available for correction or retry; it is not shown as a successful save.
- A remote synchronization error keeps the last saved encrypted bytes, common snapshot, and pending marker.
- Recoverable network failures can retry on an online or visibility event, or by explicit action. Authentication, missing-resource, and unsupported-operation failures wait for their recovery action.
- Locking, forgetting, or replacing a connection invalidates outstanding work. A completed remote request cannot authorize a stale local commit.

## Security and Privacy

- Persist encrypted KDBX bytes and synchronization metadata only.
- Keep entered passwords, key-file bytes, decrypted fields, and active provider credentials in runtime memory.

## Acceptance Criteria

- Database changes persist only after the user chooses `Save`.
- Remote saves update the local encrypted cache before network synchronization starts.
- A remote failure leaves saved local bytes and pending status available for later recovery.
- Sync event bursts do not start duplicate concurrent passes, and synchronization does not run on a timer.
