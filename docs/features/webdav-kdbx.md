# WebDAV KDBX

Implementation and local checks are complete: all 453 tests and the project check, lint, stylelint, format, and build commands passed. Compatibility with a live deployment has not been tested.

See the [implementation specification](../specs/webdav-provider.md) for the complete user stories and testing decisions.

## Source and connection

- Support WebDAV as a source for encrypted `.kdbx` databases, using standard protocol operations rather than a particular service's APIs or URL conventions.
- Keep the remote file on the WebDAV server and automatically synchronize database edits back to it.
- Make the server and account configurable so other users can connect to their own compatible deployments and accounts.
- Use the owner's WebDAV endpoint as the initial integration target. Compatibility depends on protocol, authentication, and browser-access requirements rather than the server's product name.
- Allow one-time server or reverse-proxy configuration for browser access or authentication.
- Connect directly from the browser over WebDAV and preserve KeeWeb Lite's static deployment.
- Select database files through a simple form accepting the full WebDAV file URL and that database's connection details.
- Support multiple WebDAV databases, each owning one connection to a configurable server and account. Connections are not shared between databases.

## Provider architecture

- Move Local and Google Drive onto shared provider contracts alongside WebDAV in the same change, preserving existing data and setup flows.
- Shared services own KDBX creation and unlocking, encryption, browser caching, merging, conflict handling, and synchronization scheduling.
- Provider modules own their authentication flow, source validation, setup UI, storage protocol operations, and interpretation of remote revisions.
- Describe capabilities explicitly. Local does not implement fake remote operations; remote providers advertise supported reads, writes, creation, and conditional-write guarantees. An unconditional writer must not masquerade as a conditional one.
- Register compiled provider modules in one central registry containing their identity, labels, schemas, supported actions, setup UI, and adapters. Shared screens and workflows use this registry rather than branching on provider IDs.
- Adding a provider should require a module and registry entry, not provider-specific changes throughout shared services and screens. Runtime installation of external plugins is outside this design.
- Preserve typed provider data and introduce explicit persistence migration. An unsupported or invalid provider record must not cause unrelated database records to be discarded.
- Google Drive and WebDAV share the conflict-copy policy and synchronization triggers. Their write guarantees remain capability-specific: Google Drive's current transport uploads unconditionally, while WebDAV requires conditional writes.
- See [Database provider architecture](../architecture/database-providers.md) for module boundaries, operations, and extension steps.

## Authentication and credential storage

- Initially support HTTP Basic authentication over HTTPS with a username and password or app password. Keep authentication extensible for additional methods, without assuming every server issues app tokens.
- Server configuration determines credential permissions, expiry, and revocation; no universal account-wide or per-file scope is assumed.
- Persist connection details and encrypted WebDAV secrets in browser storage. Protect each saved secret with its database's unlock credentials, including the key file when required. Keep the encrypted secret across locks, reloads, and browser restarts until the user explicitly forgets the stored state or replaces it.
- Keep saved secrets in a separate encrypted browser record. Database uploads and downloads do not contain them; each device requires initial connection setup.
- Use the same unlock credentials with independent encryption parameters, rather than reusing the main file's raw encryption key. Reusing kdbxweb for a small local KDBX credential container avoids a custom encryption format. Its KDF protection must be comparable to the main database, with independent salts.
- Do not automatically erase saved encrypted credentials after an authentication failure; server expiry or revocation can still make them unusable.
- Cached databases remain usable without valid WebDAV credentials; remote synchronization waits for authentication.
- On reopening, unlock the cached database and its credential record before contacting the WebDAV server. Page-load refresh waits for this unlock.
- Locking clears the decrypted database and connection secrets from active runtime state and pauses synchronization. Retain their encrypted browser records and catch up after unlocking.

## Import and create

- Complete first import only after successfully unlocking the database: use the entered WebDAV credentials to download the file, unlock it with the database password and optional key file, then save the encrypted credentials and source. Incomplete setup keeps connection secrets only in memory.
- Offer WebDAV under Create, using a destination WebDAV file URL. Creation must refuse to overwrite an existing file.
- Protect creation with a server-enforced condition, not only a separate existence check. Keep failures visible and preserve an exportable encrypted database if upload success cannot be confirmed.
- Persist the original encrypted creation-attempt bytes separately from later local edits. On retry, read the destination before deciding whether to confirm, reconcile, or retry conditional creation.
- Download the generated key file whenever local recovery has been saved, including uncertain remote creation.
- Closing a setup form cancels its pending work. A WebDAV create already saved locally returns a recovery outcome instead of discarding its record or key file.

## Synchronization and conflicts

- Support the same database being edited from other browsers, devices, and KeePass applications.
- Save edits to the encrypted browser cache first and distinguish Saved locally from Synced to server.
- Persist pending changes and an encrypted common-version snapshot so a reload cannot overwrite local edits with a fresh download. Detect concurrent divergence against this common version, not timestamps alone.
- For WebDAV and other conditional writers, pair downloaded bytes with their revision validator and condition uploads on that validator. Fetch and merge again if another writer wins the race; retain local changes if retries fail. Never silently fall back to unconditional writes. Google Drive retains its explicitly declared unconditional writer.
- Preserve newer local saves and unsaved form input when synchronization completes. Preserve KDBX history-edit state across cloning and persistence so history merges remain correct.
- For both Google Drive and WebDAV, check incoming changes on page load after unlock and when returning to the unlocked tab. Local saves and restored connectivity also trigger synchronization. Do not poll on an interval. Provide visible errors and manual retry.
- An older record without a verified common snapshot keeps its encrypted cache as recovery evidence. If remote bytes differ, bootstrap by verifying database identity and reconciling both copies without inventing a common base; this can create extra conflict copies because old deletions cannot be inferred safely.
- Automatically merge independent entry changes. For conflicting edits to the same entry, keep the remote version in the original entry and preserve the competing local version as a visibly labelled conflict copy.
- Synchronize both entries and continue automatically; the user can review and clean up conflict copies later.
- If entry deletion conflicts with an edit, respect deletion of the original entry and preserve the edited version as a new conflict copy.
- Give conflict copies their own identities. Identical changes and repeated synchronization must not produce additional copies of the same conflict.
- Conditional uploads protect KeeWeb's writes; they cannot enforce how another application overwrites remote files.

## Offline use and recovery

- Keep an encrypted browser cache so previously cached databases can be opened and edited while the WebDAV server is unreachable.
- Automatically synchronize cached changes when connectivity returns and the database is unlocked.
- Offline support covers an already loaded app and previously cached databases. Full offline application startup is outside this change.
- If the remote file is moved or deleted, preserve the encrypted cache, pause synchronization, and offer updating the URL or downloading the cached database. Do not automatically recreate a missing remote file.
- If the remote database credentials change or the file is replaced with an unrelated database, stop synchronization and preserve an exportable local copy. Manual recovery and separate reimport are sufficient for this version.

## Forget database

- Forget removes all browser state for the selected database: its record, connection details, encrypted credentials, cached database, remembered key material, common-version or recovery snapshots, and synchronization metadata.
- Warn before discarding unsynchronized changes.
- Cancel or invalidate pending work so a late completion cannot restore forgotten data or continue synchronization.
- Leave the remote WebDAV file and other databases intact. Credential revocation remains a server account action.

## Architecture decisions

- [Connect to WebDAV from the browser](../adr/0001-connect-to-webdav-from-browser.md).
- [Preserve concurrent entry edits as conflict copies](../adr/0002-preserve-concurrent-entry-edits-as-conflict-copies.md).
- [Encrypt WebDAV credentials in the browser](../adr/0003-encrypt-webdav-credentials-in-browser.md).
- [Use shared provider contracts and a static registry](../adr/0004-use-shared-provider-contracts-and-a-static-registry.md).

## Deployment compatibility (optional follow-up)

Compatibility with a particular WebDAV deployment is not established by component tests. Testing a live deployment is optional and is not required to complete implementation. If a deployment is checked later, use these compatibility criteria; a server being labelled WebDAV does not by itself establish compatibility with this browser client.

- Establish how the deployed server returns a revision validator paired with downloaded file bytes.
- Require a strong ETag from the same GET response as the downloaded file and use its exact value with PUT If-Match. Use PUT If-None-Match: * for creation. If a successful write does not provide a usable validator for the stored bytes, fetch bytes and their validator together again.
- Verify conditional updates reject a stale validator and conditional creation refuses an existing file. Separate metadata checks followed by unconditional uploads do not provide these guarantees.
- Verify browser access from the deployed KeeWeb Lite origin, including allowed methods and request headers, exposed response validators, error responses, and redirect behavior.
- Verify hosting headers permit connections to the configured WebDAV server. No restrictive content security policy was found in checked-in app configuration, but an external proxy may add one.
- Use canonical HTTPS WebDAV endpoints and never forward account credentials to an unexpected server.
- Do not require directory browsing or server-side locks for this version. Fail clearly when the authentication, browser access, or conditional-write capabilities required for an operation are unavailable.

## Implementation validation

- Use the existing Vitest component and service test setup. Do not add E2E tests or an automated browser suite. Live browser CORS checks are optional deployment follow-up.
- Check import, create, encrypted credential persistence, key-file unlock, credential replacement, lock, and complete local forgetting.
- Check concurrent edits, deletion versus editing, stale upload rejection, repeated conflicts, reloads with pending changes, and local saves during synchronization.
- Check offline edits and recovery from network, authentication, missing-file, and unrelated-file failures.
- Preserve existing Local and Google Drive records, setup and authentication flows, and supported operations. Verify Google Drive's intentional adoption of the shared conflict-copy policy and synchronization triggers.
- Run relevant project checks after implementation. No live server, deployment URL, or server credentials are required for implementation completion.

## Protocol references

- [RFC 4918: WebDAV](https://www.rfc-editor.org/rfc/rfc4918.html): file operations, validators, and WebDAV response semantics.
- [RFC 9110: HTTP semantics](https://www.rfc-editor.org/rfc/rfc9110.html): conditional requests and upload validators.
- [RFC 7617: Basic authentication](https://www.rfc-editor.org/rfc/rfc7617.html): username and password credentials and transport protection.
- [Browser cross-origin access](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS): preflight requests and exposed response headers.
- [kdbxweb database API](https://github.com/keeweb/kdbxweb/blob/2.1.1/lib/format/kdbx.ts): creation and loading with existing unlock credentials.
- [kdbxweb encryption header](https://github.com/keeweb/kdbxweb/blob/2.1.1/lib/format/kdbx-header.ts): encryption parameters and KDF protection.
