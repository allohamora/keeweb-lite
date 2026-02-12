# 01 - Local KDBX Open Flow

Goal: complete the Local KDBX open flow (including key file) before adding Google Drive open flow.

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
6. [ ] Implement unlock keyboard flow (`Enter`) and focus behavior for selected source/file context.
7. [ ] Implement remembered key-file metadata (`keyFileName`, `keyFileHash`) scoped to exact local `fileIdentity`.
8. [ ] Reconstruct transient key material from remembered hash for local reopen/reload and require explicit zeroing of all raw key buffers immediately after every unlock attempt (success or failure): overwrite all involved `TypedArray`/`ArrayBuffer` contents, zero-out any exported `CryptoKey` material, and use `FinalizationRegistry` only as an additional cleanup safeguard (not a replacement for immediate overwrite) (best effort).
       Note: Cleanup may still fail or be delayed during GC pauses, under platform/WebCrypto constraints (for example non-exportable key handling limits), or on abrupt termination; mitigate by minimizing sensitive buffer lifetime and scope, isolating secrets in dedicated short-lived buffers, and treating `FinalizationRegistry` callbacks as best-effort backup only.
9. [ ] Add per-file clear action for remembered key metadata and helper text explaining sensitivity.
10. [ ] Add integration tests for local unlock, remembered-key flow, and failure states.
