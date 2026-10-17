# Google Drive KDBX

## Purpose

Define Google Drive behavior in the shared database provider architecture.

## Scope

- OAuth auth flow.
- Drive file listing/open/save.
- Create new empty database directly on Drive.
- Sync and revision handling.
- Sync status UI.

## Configuration

Google Drive setup actions are available only when both `PUBLIC_GOOGLE_CLIENT_ID` and `PUBLIC_GOOGLE_APP_ID` are configured. The provider remains registered when either value is missing, so cached Google Drive records stay recognized, can be unlocked, and can be downloaded. Their remote session is unavailable until configuration is restored; Local and WebDAV remain available.

## Functional Requirements

- Create flow:
  1. user opens the `Create` menu and selects `Google Drive`
  2. user enters a database name, master password, confirms the password, and optionally enables a generated key file
  3. app builds an empty KDBX database locally (`kdbx.Kdbx.create`) and performs the GIS implicit token flow if no cached token is available
  4. app uploads the new file to Drive root via a `multipart/related` create request, receiving a new Drive file `id`
  5. app persists a `google-drive` file record locally with `source.id` set to the returned Drive file id
  6. if a key file was requested, it downloads after creation or local recovery is saved
  - no destination-folder picker is offered; the file is always created in Drive root ("My Drive"), matching both upstream KeeWeb's Drive storage adapter and Google's own "Save to Drive" button behavior (https://developers.google.com/drive/api/guides/savetodrive) — users can move the file into any folder from Drive's own UI afterward
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
  - The explicit Save action writes encrypted bytes and pending state to IndexedDB before synchronization starts.
  - Sync runs after unlock, a completed save, returning to the visible tab, restored connectivity when work is pending or a network error occurred, and manual retry. It does not poll on an interval.
  - A verified common snapshot drives conflict detection. Independent edits merge; incompatible edits preserve both variants as a conflict copy.
  - Drive writes remain unconditional; the shared conflict policy does not add server-side conditional-write protection.
  - A failed remote sync keeps the encrypted local save and pending marker. The status shows the error and also indicates "Saved locally" when data is pending.
- Clicking a recoverable sync status retries synchronization. Authentication or connection recovery follows the provider's available recovery flow.
- `Download` action exports current encrypted `.kdbx` bytes without changing remote sync state.
- Repository functions:
  - `getFile(fileId)` — download file bytes
  - `createFile(fileName, data)` — create a new file on Drive root (multipart upload), returns `{ id, name, modifiedTime }`
  - `updateFile(fileId, data)` — upload updated file bytes
  - `auth.clearAccessToken()` — clear the cached access token

## UI Requirements

- Show sync status for Drive-backed records (never for local):
  - orange dot + "Syncing": a remote pass is in progress
  - orange dot + "Saved locally": local data is pending remote confirmation
  - green dot + "Synced": no remote work is pending
  - red dot + "Sync error": the last remote pass failed; pending local data remains marked "Saved locally"
- At top of opened DB view show:
  - sync status element (Drive-backed records only)
  - `Download` button

## Data and Storage

- Persist Drive-backed records in IndexedDB via `src/repositories/record.repository.ts` with `type = google-drive`:
  - `id`
  - `source` (`id`)
  - `kdbx` (`name`, `encryptedBytes`)
  - optional `key` for remember-key behavior; stored `key` contains Base64-encoded key-file bytes (cryptographic key material required for KDBX decryption), must be treated as secret, and is used to decrypt KDBX files; we store Base64 bytes because unlock requires original key bytes, and storing only a SHA-256 hash would not work for decryption
  - optional `lastOpenedAt`
  - optional `sourceVersion` and synchronization state (`generation`, `pending`, and a verified common snapshot)
- Keep the unlocked database, provider session, lifecycle, and transient sync error in runtime app state (in-memory, non-persistent).

## Failure Handling

- When no cached access token is available or its local expiry has passed, the repository requests OAuth authorization. A Google Drive 401 is reported as an authentication error.
- Permission, unsupported-operation, and network errors are normalized by the provider adapter and shown as "Sync error".
- When configuration is absent, cached records remain locally usable and exportable, but remote actions cannot run.
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
- User can create a brand-new empty Drive-backed `.kdbx` from the Unlock screen, and it is automatically sync-eligible thereafter.
- Sync is requested on unlock, completed save, visible-tab return, relevant online events, and manual retry, without interval polling.
- Failed sync leaves local encrypted bytes and pending state intact; the status distinguishes local save from remote confirmation.
