# 02 - Local KDBX Workspace And Save

Goal: render the local workspace and complete local persistence behavior (autosave, cache, download).

## Why This Screen Exists

After local unlock works, users need a complete local editing experience with clear save status and recoverable export.

## Source Docs

- [Interface](../features/interface.md)
- [Local KDBX](../features/local-kdbx.md)
- [In-Memory Mode](../features/in-memory-mode.md)
- [Immediate Autosave](../features/immediate-autosave.md)
- [Storage Terminology](../features/storage-terminology.md)

## Checklist

1. [ ] Build workspace shell regions (top bar, menu pane, entry list, entry details, footer) and support Unlock overlay toggle.
2. [ ] Render local-mode top bar with save status circle, text label, and `Download` button.
3. [ ] Implement local source mode display (`local-cache`) and cached-only hint (`Stored locally until downloaded`).
4. [ ] Wire all local edits into one immediate-save pipeline.
5. [ ] Serialize save operations with Web Locks (`keeweb-save`) and queue follow-up saves while one write is in flight.
6. [ ] Coalesce rapid dirty events into latest-state writes without dropping updates.
7. [ ] Persist encrypted KDBX bytes to IndexedDB after successful saves (no plaintext/decrypted values).
8. [ ] Keep `Download` export available for latest encrypted state at all times.
9. [ ] Keep save/export errors visible and recoverable; failed writes must not appear as successful.
10. [ ] Add integration tests for workspace render, autosave queue behavior, IndexedDB persistence, and download export.
