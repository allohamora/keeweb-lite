# 04 - Google Drive KDBX Sync Flow

Goal: add full Google Drive KDBX sync behavior in workspace after Drive open flow is available.

## Why This Screen Exists

Drive render/sync adds conflict states, remote metadata, and retry behavior that should be implemented after unlock is working.

## Source Docs

- [Google Drive KDBX](../features/google-drive-kdbx.md)
- [Immediate Autosave](../features/immediate-autosave.md)
- [Storage Terminology](../features/storage-terminology.md)
- [Interface](../features/interface.md)

## Checklist

1. [ ] Add Drive-mode top-bar UI: sync status circle, `Sync` button, sync metadata text, and error summary display.
2. [ ] Implement canonical sync status rendering (`idle`, `pending`, `syncing`, `conflict`, `error`) with text and color.
3. [ ] Extend save pipeline for Drive-backed files so edits trigger sync attempts after local mutation.
4. [ ] Implement Drive `save` path with revision tracking (`driveRevisionId`) and persisted sync metadata (`lastSuccessfulSyncAt`, `lastSyncErrorSummary`).
5. [ ] Preserve previous successful sync timestamp when new sync attempts fail.
6. [ ] Implement conflict-aware sync flow with revision checks, remote load, merge (`db.merge(remoteDb)`), and merged save-back when needed.
7. [ ] Limit sync load/merge retry loops to 3 attempts per cycle.
8. [ ] Add inline recovery actions for failed/conflict states (`Retry sync`, `Resolve conflict`).
9. [ ] Ensure `Download` export remains independent from remote sync state.
10. [ ] Implement best-effort token revoke and local token cleanup on Drive logout.
11. [ ] Add integration tests for sync success, sync failure, conflict flow, retry behavior, and top-bar status transitions.
