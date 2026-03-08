# Google Drive KDBX

## Purpose

Define target Google Drive integration behavior based on KeeWeb storage-adapter patterns.

## Scope

- OAuth auth flow.
- Drive file listing/open/save.
- Sync and revision handling.
- Sync status UI.

## Functional Requirements

- Open flow:
  1. user starts Drive open
  2. app performs GIS implicit token flow (`google.accounts.oauth2.initTokenClient` + `requestAccessToken`, `prompt: 'select_account'`)
  3. app opens official Google Drive Picker pre-authorized with the OAuth token
  4. user selects `.kdbx` file from the Picker
  5. user optionally selects key file from local file input (loaded into memory)
  6. user enters password
  7. app downloads bytes and unlocks DB
- Drive file selection implementation:
  - uses the official Google Drive Picker API (`gapi` + `google.picker.PickerBuilder`)
  - with `drive.file` scope, picker only shows app-visible files (for example files created by app or explicitly granted to app context)
- Save/sync flow:
  - save pipeline writes to IndexedDB only (fast, no Drive calls during save)
  - sync runs as a background job after unlock and after each save
  - sync strategy: download remote bytes, load with local credentials, merge remote into local (`db.merge(remoteDb)`), upload merged result back to Drive, then update IndexedDB with merged bytes
  - sync throws on failure; errors are shown in the sync status indicator
- Clicking the "Sync error" status element retries sync immediately.
- `Download` action exports current encrypted `.kdbx` bytes without changing remote sync state.
- Repository functions:
  - `getFile(fileId)` — download file bytes
  - `updateFile(fileId, data)` — upload updated file bytes
  - `auth.clearAccessToken()` — clear the cached access token

## UI Requirements

- Show a three-state sync status element for Drive-backed records (always visible, never for local):
  - orange dot + "Syncing": sync is in progress
  - green dot + "Synced": last sync succeeded
  - red dot + "Sync error": last sync failed; clicking retries sync and shows error toast
- At top of opened DB view show:
  - sync status element (Drive-backed records only)
  - `Download` button

## Data and Storage

- Persist Drive-backed file records in IndexedDB via `src/repositories/record.repository.ts` with `type = google-drive`:
  - `id`
  - `source` (`id`)
  - `kdbx` (`name`, `encryptedBytes`)
  - optional `key` for remember-key behavior; stored `key` contains Base64-encoded key-file bytes (cryptographic key material required for KDBX decryption), must be treated as secret, and is used to decrypt KDBX files; we store Base64 bytes because unlock requires original key bytes, and storing only a SHA-256 hash would not work for decryption
  - optional `lastOpenedAt`
- Keep active unlocked DB/session and transient sync error state in runtime app state (in-memory, non-persistent).

## Failure Handling

- Expired or invalid auth token triggers a new token request popup.
- Permission/network errors cause sync to throw; sync status turns red "Sync error".
- Sync failures do not overwrite the encrypted cache; the locally-stored bytes remain intact.
- Download/export failures surface an explicit error toast.

## Security and Privacy

- Use scope `https://www.googleapis.com/auth/drive.file`.
- `drive.file` limits picker/open/update to app-visible files; arbitrary pre-existing KDBX files across all folders are not guaranteed to be visible.
- Do not log OAuth tokens or plaintext secrets.
- Persist only minimum metadata required for reopen/sync.
- `auth.clearAccessToken()` clears the in-memory token cache; token revocation is best effort.

## Acceptance Criteria

- User can open and sync a Drive-backed `.kdbx`.
- Background sync fires on unlock and after each save.
- Auth and network failures are visible via "Sync error" status element and recoverable by clicking it.
