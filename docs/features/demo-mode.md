# Demo Mode

## Purpose

Let a visitor explore the app with realistic data and no setup: no password, no
storage account, no file to bring. Define what makes a demo session different
from a normal `local`/`google-drive` session.

## Scope

- Starting a demo session from the Unlock screen.
- Data source and attribution.
- Persistence, download, and sync restrictions specific to `demo` records.

## Data Source and Attribution

- The bundled dataset is the real demo database from the KeeWeb project
  (`app/resources/Demo.kdbx` in `keeweb/keeweb`, MIT licensed), shipped
  unmodified as `src/assets/demo.kdbx` and decrypted at runtime with the
  fixed password `demo` (see `src/services/demo.service.ts`). Credit: KeeWeb
  (https://github.com/keeweb/keeweb).
- The asset is imported with Vite's `?url` suffix
  (`import demoKdbxUrl from '@/assets/demo.kdbx?url'`) rather than served
  from `public/`, so the build emits it as a content-hashed file under
  `/_astro/` and it picks up the existing `Cache-Control: public,
max-age=31536000, immutable` rule in `nginx.conf` for free — `public/`
  assets instead fall under the catch-all `no-cache, no-store,
must-revalidate` rule.
- The fixed password is an implementation detail, never surfaced in any UI —
  there is nothing for a user to enter or remember.

## Functional Requirements

- `Demo` is a single-click quick action on the Unlock screen (`src/components/unlock/unlock.page.tsx`); no form, no confirmation.
- Starting a demo session builds a fresh `kdbx.Kdbx` from the bundled asset on every click — never a shared, mutable, in-process template.
- A demo session uses a `FileRecord` with `type: 'demo'`. This shape is intentionally excluded from the Records Store's Zod schema (`src/repositories/record.repository.ts`) so it can never pass `createRecord`/`updateRecord` validation and can never be written to IndexedDB.
- Editing entries in a demo session works normally in the UI, but `saveDatabase` (`src/services/workspace.service.ts`) skips the repository write for `type: 'demo'` records — edits only ever live in the in-memory `kdbx.Kdbx` object for the current session.
- Demo sessions never trigger Google Drive sync (`src/hooks/use-sync.hook.ts` only syncs `type: 'google-drive'`).
- `Download` is not offered for a demo session (`src/components/workspace/workspace-controls.component.tsx`): there is no user-set password to hand back, so exporting the file would be misleading.
- `Lock` is the only way to leave a demo session, and it behaves like any other lock (`setSession(null)`) — except, because nothing was ever persisted, it permanently discards the demo data. There is no way to resume a locked demo session; clicking `Demo` again always starts over from the pristine seed data.

## Data and Storage

- Runtime app state only: the demo `kdbx.Kdbx` model lives in the same in-memory session slot as any other unlocked database, per `docs/features/storage-terminology.md`.
- Records Store (IndexedDB): demo records never appear here.
- Encrypted Offline Cache (IndexedDB): unused for demo sessions.

## Security and Privacy

- The demo password is fixed and public (it matches upstream KeeWeb's own demo password); this is fine specifically because Download is disabled and nothing is ever persisted, so there's no encrypted artifact anywhere that this password could be used to open.

## Acceptance Criteria

- Clicking `Demo` unlocks a workspace populated with the bundled dataset without any password prompt.
- The workspace shows no `Download` control while in a demo session.
- Locking a demo session returns to the Unlock screen and leaves no trace of the demo record in the Records Store.
- Clicking `Demo` again after locking starts from the same pristine seed data, not from previous edits.
