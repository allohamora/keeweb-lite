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
  3. user browses My Drive root and subfolders via folder browser
  4. user selects `.kdbx` file from the folder browser
  5. user optionally selects key file from local file input (loaded into memory)
  6. user enters password
  7. app downloads bytes and unlocks DB
- Save/sync flow:
  - after edits, sync to same Drive file
  - sync error state is derived from a single `syncError: string | null` value (`null` = synced, non-null = error message)
  - sync strategy: download remote bytes, load with local credentials, merge remote into local (`db.merge(remoteDb)`), upload merged result back to Drive
  - single sync attempt per save cycle (no retry loop)
- Manual `Sync` action triggers immediate sync; available only when `syncError !== null`.
- `Download` action exports current encrypted `.kdbx` bytes without changing remote sync state.
- Repository functions:
  - `getFolderItems(folderId, extension)` — list folders and matching files in a Drive folder
  - `getFile(fileId)` — download file bytes
  - `updateFile(fileId, data)` — upload updated file bytes
  - `auth.clearAccessToken()` — clear the cached access token
- Listing supports:
  - My Drive root (`id: 'root'`) with recursive subfolder navigation

## UI Requirements

- Show sync state via a colored dot for Drive-backed records:
  - green dot: last sync succeeded (`syncError === null`)
  - red dot: last sync failed (`syncError !== null`)
- Clicking the dot shows a toast with the sync result.
- At top of opened DB view show:
  - sync status dot (Drive-backed records only)
  - `Download` button
  - `Sync` button (shown only when `syncError !== null` for Drive-backed records)

## Data and Storage

- Persist Drive-backed file records in IndexedDB via `src/repositories/record.repository.ts` with `type = google-drive`:
  - `id`
  - `source` (`id`)
  - `kdbx` (`name`, `encryptedBytes`)
  - optional `key` (`name`, `hash`) for remember-key behavior
  - optional `lastOpenedAt`
- Keep active unlocked DB/session and transient sync error state in runtime app state (in-memory, non-persistent).

## Failure Handling

- Expired or invalid auth token triggers a new token request popup.
- Permission/network errors set `syncError` with the error message; sync dot turns red.
- Sync failures do not overwrite the encrypted cache; the locally-stored bytes remain intact.
- Download/export failures surface an explicit error toast.

## Security and Privacy

- Use scope `https://www.googleapis.com/auth/drive` (full Drive access).
  - Note: `drive.file` scope (least-privilege) is incompatible with listing pre-existing KDBX files in arbitrary Drive folders because it only exposes files created or explicitly opened through the app.
- Do not log OAuth tokens or plaintext secrets.
- Persist only minimum metadata required for reopen/sync.
- `auth.clearAccessToken()` clears the in-memory token cache; token revocation is best effort.

## Acceptance Criteria

- User can open and sync a Drive-backed `.kdbx`.
- Manual and automatic sync both work.
- Auth and network failures are visible via sync dot and recoverable via Sync button.
