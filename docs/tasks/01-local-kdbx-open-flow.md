# 01 - Local KDBX Open Flow

Goal: complete the Local KDBX open flow (including key file and recent files) before adding Google Drive open flow.

## Why This Screen Exists

Unlock is the primary entry experience. If this is not stable for local mode first, all later render and save work is harder to validate.

## Source Docs

- [Interface](../features/interface.md)
- [Local KDBX](../features/local-kdbx.md)
- [Key File Unlock](../features/key-file-unlock.md)

## Checklist

1. [ ] Build Unlock screen with local file context, password input, key-file control, open action, and inline message area.
2. [ ] Implement local-file selection flow and selected filename display before unlock.
3. [ ] Implement key-file add/remove and selected key-file name display.
4. [ ] Implement local unlock submit paths for password-only and password-plus-key-file.
5. [ ] Keep unlock failures on screen with explicit feedback for wrong password/key-file.
6. [ ] Implement recent-files list for local files with keyboard controls (`Up`, `Down`, `Enter`) and prefill behavior.
7. [ ] Implement remembered key-file metadata (`keyFileName`, `keyFileHash`) scoped to exact local `fileIdentity`.
8. [ ] Reconstruct transient key material from remembered hash for local reopen/reload and clear raw key buffers after unlock attempts (best effort).
9. [ ] Add per-file clear action for remembered key metadata and helper text explaining sensitivity.
10. [ ] Add integration tests for local unlock, recent-file reopen, remembered-key flow, and failure states.
