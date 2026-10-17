# Add WebDAV and modular database providers

## Problem Statement

Users cannot keep a KeePass database synchronized with their own WebDAV server. Local databases live in one browser's cache and require manual downloads, while Google Drive is the only remote provider. Users need a configurable remote source that works with their own compatible servers, preserves edits across outages and concurrent clients, and remembers connection credentials without storing a directly usable password in browser storage.

Provider behavior is also coupled to Google Drive throughout setup, synchronization, and presentation. Adding another provider would extend that coupling unless the application establishes shared contracts and reusable database workflows.

## Solution

Add a generic WebDAV database provider and migrate Local and Google Drive onto the same modular provider architecture. Connect directly from the browser to a full HTTPS WebDAV file URL using HTTP Basic authentication with a username and password or app password.

Each WebDAV database owns its connection and remembers its connection secrets in a separate encrypted browser record, unlocked with the same master password and optional key file as the database. Keep an encrypted local cache, synchronize changes automatically, and preserve competing entry edits as visible conflict copies. Google Drive adopts the same conflict policy and synchronization triggers while retaining its existing OAuth flow and explicitly weaker unconditional-upload guarantee.

Support compatible WebDAV deployments with the authentication, browser access, and conditional requests needed for safe operations. Do not promise compatibility based solely on a server advertising WebDAV.

## User Stories

1. As a KeeWeb user, I want to open a database from a compatible WebDAV server, so that I can use storage I control.
2. As a KeeWeb user, I want to enter a full WebDAV file URL, so that I can connect directly to my database without a file picker.
3. As a self-hosting user, I want the server and account to be configurable, so that the application works with my deployment.
4. As a KeeWeb user, I want several WebDAV databases in one browser, so that I can manage separate personal and work databases.
5. As a KeeWeb user, I want each database to own its connection, so that changing one connection does not silently change another database's credentials.
6. As a WebDAV user, I want to authenticate with a username and password or app password over HTTPS, so that I can use my server's supported Basic authentication.
7. As a WebDAV user, I want a clear failure when authentication is unsupported, so that I can identify what my deployment needs.
8. As a KeeWeb user, I want initial import to finish only after a successful database unlock, so that my connection secrets can be stored encrypted.
9. As a KeeWeb user, I want failed or abandoned setup to avoid persisting plaintext connection secrets, so that incomplete setup does not leave a usable credential behind.
10. As a KeeWeb user, I want password-only and password-plus-key-file databases to work, so that I can retain my existing unlock method.
11. As a KeeWeb user, I want incorrect database credentials to fail without replacing my saved state, so that I can retry safely.
12. As a KeeWeb user, I want to create an empty database at a destination WebDAV file URL, so that I can start using server storage directly.
13. As a KeeWeb user, I want creation to refuse an existing remote file, so that a mistaken destination cannot overwrite another database.
14. As a KeeWeb user, I want the existing optional generated key-file creation flow to remain available, so that a new database can use an additional unlock factor.
15. As a KeeWeb user, I want an exportable encrypted database when creation upload fails or its result is uncertain, so that I can recover what I created.
16. As a KeeWeb user, I want my WebDAV secret encrypted with my database's unlock credentials, so that remembering the connection does not store a directly usable password.
17. As a KeeWeb user, I want the credential record to use independent encryption parameters with comparable password-derivation protection, so that it does not weaken my database password.
18. As a KeeWeb user, I want saved credentials to survive page reloads and browser restarts, so that I do not repeatedly enter my WebDAV password.
19. As a KeeWeb user, I want unlocking my cached database to unlock its saved connection, so that I can resume synchronization without a second password prompt.
20. As a KeeWeb user, I want saved connection secrets kept outside the main database file, so that uploads and downloaded databases do not carry my server credentials.
21. As a KeeWeb user, I want to configure a connection once on each device, so that its saved credentials remain local to that device.
22. As a KeeWeb user, I want locking to release decrypted connection secrets and pause synchronization, so that my locked database does not retain an active authenticated workflow.
23. As a KeeWeb user, I want the encrypted connection record retained when I lock, so that unlocking restores access without reentering my server password.
24. As a KeeWeb user, I want remote refresh to wait until database unlock after a reload, so that the saved secret stays protected while locked.
25. As a KeeWeb user, I want to replace expired or revoked connection credentials, so that synchronization can resume without losing my database cache.
26. As a KeeWeb user, I want authentication failures to preserve the encrypted credential record until I replace or forget it, so that transient failures do not silently erase configuration.
27. As a KeeWeb user, I want cached databases to remain usable without valid server credentials, so that a login problem does not prevent access to my local copy.
28. As a KeeWeb user, I want each edit saved to an encrypted browser cache, so that a temporary network failure does not discard it.
29. As a KeeWeb user, I want Saved locally and Synced to server to be distinct states, so that I know whether another device can see my changes.
30. As a KeeWeb user, I want to open and edit a cached database while the server is unreachable, so that I can keep working in an already loaded application.
31. As a KeeWeb user, I want pending changes to survive a reload, so that reopening does not replace offline edits with an older remote file.
32. As a KeeWeb user, I want synchronization to resume when connectivity returns and the database is unlocked, so that cached edits reach the server automatically.
33. As a KeeWeb user, I want incoming changes checked when opening and unlocking the database, so that I catch up with other clients.
34. As a KeeWeb user, I want incoming changes checked when I return to the unlocked tab, so that I see edits made elsewhere while I was away.
35. As a KeeWeb user, I want local saves to trigger synchronization, so that edits reach the server without a separate upload action.
36. As a KeeWeb user, I want event-triggered synchronization without interval polling, so that the application avoids unnecessary background requests.
37. As a KeeWeb user, I want visible synchronization failures and a manual retry action, so that I can recover when automatic synchronization cannot finish.
38. As a KeeWeb user, I want independent changes to different entries merged automatically, so that several clients can edit one database.
39. As a KeeWeb user, I want incompatible concurrent edits to one entry preserved as two visible entries, so that neither variant is silently discarded.
40. As a KeeWeb user, I want the server variant retained in the original entry and my competing local variant labelled as a conflict copy, so that I can distinguish and review both.
41. As a KeeWeb user, I want synchronization to continue after conflict copies are created, so that one conflict does not block other changes.
42. As a KeeWeb user, I want an edit competing with deletion preserved as a new conflict copy while the original stays deleted, so that deletion and recovery are both respected.
43. As a KeeWeb user, I want identical changes and repeated retries to avoid extra conflict copies, so that synchronization does not fill my database with duplicates.
44. As a KeeWeb user, I want concurrency detected from a known common version rather than timestamps alone, so that clock differences do not hide competing edits.
45. As a KeeWeb user, I want a stale WebDAV upload rejected by the server, so that another client's newer write is not overwritten between download and upload.
46. As a KeeWeb user, I want a rejected stale upload to fetch and reconcile the newer revision, so that synchronization can finish without discarding my edits.
47. As a KeeWeb user, I want changes retained when synchronization exhausts its retries, so that I can retry later or export them.
48. As a KeeWeb user, I want newer local saves protected from older in-flight synchronization results, so that completing a request cannot roll my database back.
49. As a KeeWeb user, I want incoming synchronization to preserve unsaved form input, so that editing is not interrupted by a background refresh.
50. As a KeeWeb user, I want entry history to remain consistent through cloning, saving, and merging, so that recovery remains trustworthy.
51. As a KeeWeb user, I want to download the latest encrypted database, so that I have a recovery copy independent of browser storage.
52. As a KeeWeb user, I want a missing or moved remote file to pause synchronization and preserve my cache, so that the application does not recreate a file someone intentionally removed.
53. As a KeeWeb user, I want to update a moved database's URL, so that I can reconnect my cached database to its new location.
54. As a KeeWeb user, I want a remote master-password or key-file change to stop writes and preserve an exportable local copy, so that I can recover manually.
55. As a KeeWeb user, I want an unrelated replacement database detected before merging or uploading, so that one file cannot be corrupted by another database's changes.
56. As a KeeWeb user, I want authentication, permission, locking, capacity, missing-file, and network failures handled appropriately, so that recovery matches the actual problem.
57. As a KeeWeb user, I want Forget database to erase all locally remembered state for the selected database, so that its cache and saved connection are removed together.
58. As a KeeWeb user, I want a warning before forgetting unsynchronized changes, so that I can export or synchronize them first.
59. As a KeeWeb user, I want forgotten data to stay removed after pending requests finish, so that background work cannot restore it.
60. As a KeeWeb user, I want forgetting a database to preserve its remote file and other databases, so that local cleanup has a clear scope.
61. As a Google Drive user, I want the same visible conflict-copy policy as WebDAV, so that concurrent edits behave consistently across remote providers.
62. As a Google Drive user, I want the same opening, tab-return, save, and reconnect synchronization triggers, so that I do not need provider-specific synchronization habits.
63. As an existing Local or Google Drive user, I want my stored records and setup flows preserved during migration, so that adding WebDAV does not disrupt existing use.
64. As a KeeWeb user, I want unsupported or invalid provider records reported individually without clearing unrelated records, so that one compatibility problem does not erase my other databases.
65. As a maintainer, I want Local, Google Drive, and WebDAV to use shared provider contracts, so that adding a provider does not spread special cases through the application.
66. As a maintainer, I want shared database services to own encryption, caching, merging, and scheduling, so that provider implementations do not duplicate those workflows.
67. As a maintainer, I want providers to own authentication, storage operations, validation, and setup UI, so that vendor details remain isolated.
68. As a maintainer, I want explicit capabilities for local, remote, create, and conditional-write operations, so that unsupported operations are represented honestly.
69. As a maintainer, I want to add a provider through a module and a central registry entry, so that common screens and services remain reusable.
70. As a self-hosting administrator, I want documented HTTPS, browser-access, authentication, and conditional-request requirements, so that I can configure and verify a compatible deployment.

## Implementation Decisions

- Follow the agreed architecture decisions: connect to WebDAV directly from the browser; preserve competing edits as visible conflict copies; encrypt database-scoped connection secrets locally; and use shared provider contracts with a static registry.
- Migrate Local and Google Drive onto the shared architecture in the same change as WebDAV. Preserve existing record identities, setup and authentication flows, and supported operations. Google Drive intentionally gains the shared conflict-copy policy and synchronization triggers.
- Separate provider definitions, per-database bindings, and unlocked provider sessions. Definitions supply identity, labels, typed source schemas, versions, capabilities, setup actions, and a session factory. Bindings hold one database's validated source configuration. Sessions hold temporary authentication state, transport operations, and cancellation resources.
- Shared services own KDBX creation, unlock, encryption, serialization, encrypted caching, common-version and pending-change state, history handling, merging, conflict policy, scheduling, and complete local forgetting. Provider modules operate on encrypted database bytes and own their protocol, authentication, source validation, setup UI, and remote revision interpretation.
- Register compiled provider modules and their setup UI in one central registry. Generic menus, labels, availability, and workflows use registered capabilities instead of provider-ID branches. Keep core contracts independent of React components. New capabilities may extend shared contracts; vendor-specific field names should remain within provider modules.
- Represent conditional replacement, unconditional replacement, remote creation, remote reading, and local-only behavior explicitly. Local does not implement fake remote operations. A provider must not claim conditional-write protection when its transport is unconditional. Read-only capabilities can be represented without adding a new read-only product flow in this change.
- Keep Google Drive OAuth provider-specific. WebDAV initially supports HTTP Basic over HTTPS with username and password or app password. Server-specific credential permissions, expiry, and revocation remain server responsibilities. Design the authentication boundary to accept additional methods later without promising them now.
- Each WebDAV database owns one connection. Accept a canonical full WebDAV file URL and its connection details; do not infer vendor URL conventions or accept an ordinary browser or sharing link as if it were a file endpoint. Require an existing destination collection for creation rather than adding directory management.
- Store WebDAV secrets in a separate encrypted browser record, using the same master password and optional key file as the main database with independent encryption parameters and comparable KDF protection. Reuse the KDBX library for the local credential container instead of introducing a custom encryption format. Do not include the credential record in main-database uploads or downloads.
- During initial import, temporarily use the entered WebDAV credentials to fetch encrypted bytes, require successful database unlock, and only then complete saved setup with encrypted credentials. Abandoned or failed setup must not persist plaintext connection secrets. Each device needs its own initial connection setup.
- On reopening, unlock the cached database and credential record before authenticated remote refresh. Persist encrypted credentials across locks, reloads, and browser restarts. Clear decrypted session references and cancel or invalidate work on lock; retain encrypted records. Browser memory cleanup is best effort, not a guarantee of physical zeroization.
- Keep encrypted credentials after authentication failures until explicit replacement or forgetting. Permit cached database access without valid server credentials, and provide a replacement-credential flow after database unlock. Preserve the existing record-scoped remembered key-material behavior and include that material in complete local forgetting.
- Save local edits before attempting synchronization. Persist pending-change markers and an encrypted common-version snapshot so reloads cannot discard offline edits. Present local persistence and successful remote synchronization as distinct states.
- Database entry forms save only on the explicit Save action. Persist encrypted bytes and pending state before requesting remote synchronization.
- Use the same event-based synchronization policy for Google Drive and WebDAV: after unlock and completed saves, when returning to a visible unlocked tab, on an online event when network failure or pending work makes it relevant, and on manual retry. Pause while locked or awaiting authentication. Do not poll on an interval. Authentication, missing-file, unrelated-database, and unsupported-write failures wait for their recovery action rather than retrying on every focus event.
- Keep Google Drive schemas and cached records recognized even when public identifiers are missing. Hide only its unavailable setup actions; a cached record remains locally unlockable and exportable.
- Detect entry divergence against a known common version rather than relying on modification timestamps. Merge independent entry changes automatically. For incompatible edits to the same entry, retain the remote variant in the original entry and preserve the competing local variant as a labelled conflict copy with a new identity. Keep synchronization running and avoid creating another copy for the same conflict on repeated attempts.
- When deletion conflicts with editing, retain the original deletion and preserve the edited variant as a new conflict copy. Preserve the KDBX library's history-edit state through cloning and persistence so history merges remain correct.
- Protect newer local saves and unsaved form input from stale in-flight synchronization results. Use session and persistence lifecycle controls so locking, forgetting, or switching context invalidates outdated completions.
- For an older remote record without a verified common snapshot, retain its encrypted cache as bootstrap recovery evidence. If its bytes match the remote file, establish that pair as common. If they differ, verify identity and reconcile conservatively without inventing a base: keep the remote original and preserve local-only or changed variants as conflict copies where deletion cannot be established. This first upgraded sync can create extra copies, but it cannot silently infer deletion from an unavailable history.
- Keep an immutable copy of the original encrypted WebDAV creation attempt separately from later local saves. If create completion is uncertain, retain the local database and generated key file. Read the destination before retrying; only a confirmed valid result clears creation recovery.
- Setup forms own abortable work. Closing or abandoning an import/replacement prevents a later credential commit. If WebDAV creation was already persisted locally, retain its explicit local-recovery result rather than losing the generated key or claiming rollback of a request that may have reached the server.
- For WebDAV automatic synchronization, require complete downloaded bytes and a strong ETag from the same GET response. Preserve the exact validator and issue replacement PUT requests with If-Match. Create files with PUT and If-None-Match: *. Never replace these conditions with a separate existence check or silently fall back to an unconditional upload.
- If a successful write does not provide a usable validator for the actual stored bytes, download and reconcile a fresh byte-and-validator pair. Do not attach an unrelated later HEAD or metadata response to earlier bytes. Reconcile stale-write failures against the newest remote state with bounded retries; retain local changes when reconciliation cannot finish.
- Keep provider write guarantees explicit. Google Drive's current upload remains unconditional; shared conflict handling cannot prevent every race between its download and upload or control how another client writes the remote file.
- Map observable protocol failures into common authentication, permission, missing-resource, precondition, locked-resource, capacity, network, and unsupported-capability outcomes. A failed precondition is not the same as every resource-state conflict. Browser-blocked responses can appear as network errors and must not be falsely reported as a confirmed authentication failure.
- Preserve an exportable encrypted database when creation or synchronization fails, including uncertain upload completion. Do not claim remote success without confirmation or overwrite a file while recovering from uncertain creation.
- If a file moves or disappears, stop automatic writes, preserve the local database, and offer updating its URL or downloading it. Do not automatically recreate it. If remote database credentials change or an unrelated database replaces it, stop synchronization and preserve an exportable local copy; manual recovery and separate reimport are sufficient.
- Forget database removes the selected database's record, connection, encrypted credentials, cache, remembered key material, common-version and recovery snapshots, synchronization metadata, and active runtime references. Warn before discarding pending changes. Cancel and invalidate work so late completions cannot restore forgotten data. Leave other databases and the remote file intact; server credential revocation remains a separate account action.
- Introduce explicit versioned persistence migration and typed provider-data validation. Preserve unsupported or invalid records for individual reporting and recovery instead of clearing the whole store. Keep demo sessions in memory and outside persisted provider records.
- Keep the application statically hosted. Enforce supported authentication, canonical HTTPS endpoints, required request headers, exposed ETags, conditional writes, and safe redirect behavior in the client. Do not forward credentials to an unexpected server. Refuse unsafe automatic synchronization when required capabilities are missing. Testing against a specific live deployment is outside this implementation's acceptance requirements.

## Testing Decisions

- Do not add E2E tests or an automated browser suite. Use the existing Vitest component and service test environment.
- Use one primary integration seam at the existing App component, rendered in the component test environment with React Testing Library. Keep actual database services, provider adapters, KDBX operations, and IndexedDB emulation in the workflow; control external servers with MSW and existing browser-API fixtures. These are in-process component integration tests, without a running application server or automated browser. Avoid adding a production API solely to make tests convenient.
- Good tests assert externally visible behavior: what a user can open, edit, export, lock, retry, or forget; what persists across a remount; and which complete encrypted files the simulated server receives. Do not assert private helper calls, internal component structure, or the exact number of abstractions.
- Prefer this single application boundary for feature and provider-contract scenarios. Reuse the existing session-service integration-style tests, record-service import/create tests, workspace mutation and history tests, and repository persistence scenarios as prior art and fixtures rather than duplicating every scenario at several layers.
- Reuse real KDBX fixtures, the existing native Argon2 bridge, IndexedDB emulation, and MSW HTTP handlers. Inspect saved database contents by unlocking exported or remotely received KDBX bytes. Check that connection secrets are absent from exported databases and directly readable stored state, and that the separate credential record requires the correct database unlock factors.
- Exercise import and create, wrong passwords and key files, setup interrupted before unlock, encrypted credential persistence across remounts, lock and unlock, credential replacement, cached use with invalid credentials, and complete forgetting.
- Exercise real encrypted snapshots representing another client's independent edits, incompatible same-entry edits, equal timestamps, deletion versus editing, and repeated reconciliation. Assert retained data and conflict-copy visibility rather than timestamp-only decisions or private merge helpers.
- Model stale ETags, conditional creation races, failed preconditions, missing or weak validators, server failures, permissions, locks, capacity, and uncertain upload completion through MSW responses. Assert that WebDAV uses the required conditions and that a provider without conditional support is never treated as protected.
- Exercise pending edits across reloads, save during synchronization, unsaved form input during refresh, reconnect and tab-return events, bounded retries, and lock or forget while requests are delayed. Assert no local rollback, no forgotten-record resurrection, and no newly scheduled authenticated work while locked.
- Run the same applicable user-facing conflict and scheduling scenarios for Google Drive and WebDAV. Retain regression coverage for Local imports, creation, cache and download behavior, existing Google authentication and picker flows, record migration, and in-memory demo sessions.
- Keep live deployment checks optional. Component tests and MSW do not establish real browser CORS enforcement or compatibility with a specific deployment; record that limitation without requiring live-server access to complete implementation.
- Run relevant type, lint, formatting, test, and build checks during implementation. No feature code or test execution is part of producing this specification.

## Out of Scope

- A backend proxy, server-stored WebDAV credentials, or changing the static deployment model.
- Compatibility with every server labelled WebDAV regardless of authentication, CORS, validators, or conditional-write support.
- WebDAV authentication methods beyond HTTP Basic with a password or app password in the first version.
- WebDAV file browsing, a picker, directory creation, remote file-management tools, or automatic interpretation of browser and sharing links.
- Server-side locks, quota discovery, or version-history management as required integration features.
- Runtime installation of external provider plugins or implementing additional providers beyond Local, Google Drive, and WebDAV.
- Shared WebDAV connections across databases, portable connection backups, or embedding connection secrets in uploaded or exported databases.
- Full offline application startup or adding an application service worker.
- Interval polling or background synchronization while the database is locked.
- Automatic recreation of missing remote files, remote deletion through Forget database, or automatic server-side credential revocation.
- Automatic recovery across changed remote master passwords or key files, or merging an unrelated replacement database.
- Giving Google Drive conditional-upload guarantees its current transport does not provide, or guaranteeing preservation of writes that another application overwrites without cooperation.
- A new read-only remote-storage product flow, automatic field-level combination of incompatible same-entry edits, or a blocking conflict-resolution wizard.
- E2E tests and automated browser test infrastructure.

## Further Notes

- This specification consolidates the agreed WebDAV plan, domain glossary, modular provider architecture, and four architecture decisions. Use Database provider, WebDAV source, WebDAV connection, Conflict copy, and Forget database consistently.
- No live WebDAV or application deployment is required for implementation acceptance. Compatibility with a particular deployment remains unverified until someone chooses to check it; do not claim that any deployment has been verified based only on component and service tests.
- The approved tracker is local Markdown. It contains implementation tickets and a closed scope-change record for deployment verification. Tickets must remain local and uncommitted; `.scratch/` is excluded through this clone's `.git/info/exclude`. GitHub Issues remains disabled.
- The testing-seam check resulted in an explicit requirement not to add E2E tests. Use existing component and service tests; live deployment verification is optional. The feature design itself has already been agreed; no further design interview is requested.
