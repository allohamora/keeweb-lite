# 00 - Storage Terminology Foundation

Goal: build shared app foundations so local workflows are stable first and Google Drive can be added cleanly after.

## Why This Screen Exists

If state models and storage contracts are inconsistent early, unlock/render logic becomes hard to extend and sync behavior becomes fragile.

## Source Docs

- [Storage Terminology](../features/storage-terminology.md)
- [Immediate Autosave](../features/immediate-autosave.md)
- [In-Memory Mode](../features/in-memory-mode.md)
- [Local KDBX](../features/local-kdbx.md)
- [Google Drive KDBX](../features/google-drive-kdbx.md)

## Checklist

1. [ ] Create shared domain types for `syncStatus`, `fileIdentity`, and sync error summaries.
2. [ ] Define typed persisted file-record schema with local fields first and optional Drive fields for later extension.
3. [ ] Implement/extend `src/repositories/kdbx.repository.ts` (IndexedDB) with safe parse/fallback behavior for metadata records.
4. [ ] Implement Encrypted Offline Cache adapter (IndexedDB) that stores encrypted KDBX bytes only.
5. [ ] Implement runtime-memory state container for unlocked model, transient password/key buffers, save queue state, and runtime-only sync errors.
6. [ ] Add shared status mapping helpers for UI labels/colors and `aria-live` status text.
7. [ ] Add schema/storage tests for roundtrip behavior, malformed persisted-record fallback, and identity matching.
