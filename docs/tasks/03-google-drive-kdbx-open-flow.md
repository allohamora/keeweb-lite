# 03 - Google Drive KDBX Open Flow

Goal: add the Google Drive KDBX open flow after Local KDBX open/workspace is complete.

## Why This Screen Exists

Drive unlock adds auth and remote file selection complexity. Keeping it separate after local baseline reduces rollout risk.

## Source Docs

- [Interface](../features/interface.md)
- [Google Drive KDBX](../features/google-drive-kdbx.md)
- [Key File Unlock](../features/key-file-unlock.md)
- [Storage Terminology](../features/storage-terminology.md)

## Checklist

1. [ ] Add `Google Drive` option to Unlock source selector and route it to Drive-specific open flow.
2. [ ] Implement OAuth code flow with PKCE and least-privilege scope (`drive.file`).
3. [ ] Persist OAuth runtime token envelope in localStorage key `keeweb-lite.oauth.google-drive`.
4. [ ] Implement Drive adapter methods required for unlock/open paths (`list`, `stat`, `load`, `logout` minimum for open flow).
5. [ ] Build Drive picker/list flow supporting root, shared with me, and shared drives.
6. [ ] Implement Drive file unlock with password-only and password-plus-key-file options.
7. [ ] Persist Drive file metadata records with source locator/options and Drive identity binding.
8. [ ] Support Drive reopen with remembered key metadata scoped by Drive `fileId`.
9. [ ] Add integration tests for Drive source selection, auth, file pick, unlock, and local/Drive source switching.
