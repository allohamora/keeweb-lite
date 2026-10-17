# WebDAV provider: branch cleanup plan

## Review baseline and status

- PR: [allohamora/keeweb-lite#78](https://github.com/allohamora/keeweb-lite/pull/78).
- Reviewed head: `e5daeea26d8800b7cead0730711986fe4bf7892a`.
- Base: `9d5c5a58a16c6ad036956b51513c7aee19fd51c1` on `master`.
- Review date: 2026-10-16.
- PR head rechecked 2026-10-17: `a1b4a6b2b6986462ef2d05e60b873c822ac5bd68`; the nine inline review threads are still unresolved.
- Scope inspected: all 39 changed files, all nine unresolved inline threads,
  the implementation spec, and the surrounding unlock, save, form, and library
  behavior used by the feature.
- Existing verification: 31 test files and 415 tests passed using bundled Node
  24.19.0. This is the baseline run from the investigation, not evidence that
  the additional scenarios below already pass.
- Status: implementation was explicitly requested on 2026-10-17. The work is
  being kept as reviewable branch slices. No branch rewrite, PR metadata change,
  push of the remaining work, reviewer reply, or live deployment was performed.

The original [implementation spec](webdav-provider.md) remains the behavior
baseline. The accepted decisions are in [ADR 1](../adr/0001-connect-to-webdav-from-browser.md),
[ADR 2](../adr/0002-preserve-concurrent-entry-edits-as-conflict-copies.md),
[ADR 3](../adr/0003-encrypt-webdav-credentials-in-browser.md), and
[ADR 4](../adr/0004-use-shared-provider-contracts-and-a-static-registry.md).
Source line references below refer to the reviewed head and will move during
implementation. New filenames and interface names are concrete proposed targets.

## Objective and boundaries

Make the branch understandable in terms of five operations: import a database,
create a database, save locally, synchronize a saved database, and forget a
database. Keep protocol details in providers and keep KDBX and persistence
workflows in shared services.

Preserve these guarantees during cleanup:

1. Local persistence finishes before synchronization attempts an upload.
2. A common version is a verified snapshot, never an arbitrary current cache.
3. WebDAV replacement uses the strong ETag paired with the downloaded bytes.
4. WebDAV creation always uses `If-None-Match: *`.
5. Google Drive remains explicitly an unconditional writer.
6. Conflict copies retain competing content, including edits against deletion.
7. Connection credentials stay in a separate local encrypted KDBX container.
8. Lock, connection replacement, and Forget database invalidate obsolete work.
9. Invalid or unknown records cannot erase unrelated databases.
10. Main-database downloads and uploads never contain connection credentials.

Do not introduce a backend, directory browsing, runtime provider plugins,
interval polling, an automated browser suite, or a general workflow framework.
Keep provider-specific setup forms. Do not rename the persisted `key.hash`
field merely to improve its name; it currently contains remembered key-file
bytes, and a cosmetic rename would create unnecessary migration work.

## Review comments: disposition and implementation mapping

| Thread                                                                                                    | What the code currently does                                                                              | Proposed disposition                                                                                                                          | Tasks         |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| [WebDAV library](https://github.com/allohamora/keeweb-lite/pull/78#discussion_r4297066491)                | Makes authenticated GET/PUT requests with browser restrictions and conditional headers.                   | Keep a small transport unless a library proves it preserves the required semantics with less code. Record the comparison.                     | C08           |
| [Optional Google configuration](https://github.com/allohamora/keeweb-lite/pull/78#discussion_r4297079183) | Makes public settings optional and removes Drive from registration when absent.                           | Move configuration optionality to a separate PR. Separate recognition of stored Drive records from availability of Drive actions.             | C01, C02, C12 |
| [Workspace save bookkeeping](https://github.com/allohamora/keeweb-lite/pull/78#discussion_r4297091837)    | Saves encrypted bytes, marks pending changes, increments generation, and retains history-edit state.      | Keep the guarantees; expose a single local-save operation instead of constructing synchronization metadata in workspace code.                 | C04, C05      |
| [Session service complexity](https://github.com/allohamora/keeweb-lite/pull/78#discussion_r4297105122)    | Reconciles caller state, repository state, creation recovery, and the server in one method.               | Synchronize persisted snapshots only; extract creation recovery and explicit legacy bootstrap.                                                | C04, C05, C07 |
| [Conflict-copy policy](https://github.com/allohamora/keeweb-lite/pull/78#discussion_r4297137283)          | Adds a new visible-conflict policy around kdbxweb merging.                                                | Review as a separate prerequisite behavior change, with its own regression cases. Do not describe it as an established existing merge defect. | C01, C06      |
| [Drive AbortSignal](https://github.com/allohamora/keeweb-lite/pull/78#discussion_r4297154577)             | Checks cancellation after OAuth and forwards the signal to fetch.                                         | Retain this small safety change and explain its purpose.                                                                                      | C04, C08      |
| [Provider setup complexity](https://github.com/allohamora/keeweb-lite/pull/78#discussion_r4297186175)     | Requires redundant flags, many optional callbacks, and a null Local session.                              | Use explicit operation variants and typed preparation results. Move modal composition out of core contracts.                                  | C03, C10      |
| [Additional sync triggers](https://github.com/allohamora/keeweb-lite/pull/78#discussion_r4297207309)      | Adds visibility and connectivity events to unlock/save synchronization.                                   | Separate the trigger-policy change. Preserve manual retry and specify which failures automatic events may retry.                              | C01, C09      |
| [Credential-storage model](https://github.com/allohamora/keeweb-lite/pull/78#discussion_r4297219780)      | Encrypts credentials in a separate local KDBX container, then creates an in-memory authenticated session. | Keep this model, fix its KDF and lifecycle gaps, and move orchestration out of the workspace page.                                            | C04, C07, C10 |

The Vercel authorization notice and CodeRabbit review-skipped notice are
operational comments, not code-cleanup requests. Do not authorize deployment or
trigger another review as part of this plan.

## Delivery proposal

Split review scope without temporarily removing the safeguards WebDAV needs:

| Slice                                         | Contents                                                                                                                                                     | Dependency              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| A: provider foundation                        | Typed provider contracts, Local/Drive adapters, storage decoding, record compatibility. Preserve existing sync triggers and conflict behavior in this slice. | None                    |
| B: synchronization safety and conflict copies | Persisted-input synchronization, lifecycle invalidation, common versions, legacy bootstrap, history preservation, conflict policy.                           | A                       |
| C: WebDAV                                     | Transport, encrypted credentials, conditional creation and replacement, recovery, connection UI, forgetting.                                                 | B                       |
| D: visibility and reconnect triggers          | Explicit shared event policy and coalescing, with manual retry.                                                                                              | B; revalidate against C |
| E: optional Google configuration              | Optional public settings, hidden unavailable actions, one configuration info log, cached-record availability.                                                | A                       |

This is a proposed change to the original spec's single-change delivery sequence.
It does not itself approve rewriting the existing branch or creating these PRs.
If the branch stays as one PR, use the same slices as reviewable implementation
steps and present the policy changes separately in its description.

Two decisions remain explicit rather than being hidden inside cleanup:

- Slice D ships with the documented visibility and online triggers; no trigger
  reduction was made while simplifying the hook.
- C05 adopts the conservative legacy bootstrap. An old cache has no reliable
  common version, so exact three-way classification is impossible. The workflow
  preserves data and documents the resulting extra conflict copies.

These are design dispositions for later implementation approval. No further
decision is needed to finish this document.

## Findings to cover before structural refactoring

These findings are established by inspection of the reviewed code. Add the
specified regression scenarios before changing each affected workflow; do not
claim that a failing test already reproduced them.

| ID  | Location at reviewed head                                            | Failure path or gap                                                                                                                            | Required result                                                                                                        |
| --- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| F01 | `record.repository.ts:59–90,266–280`                                 | A valid duplicate preserved in `invalidRecords` can later be promoted after the active row is forgotten; parsing ignores tombstones.           | Forget removes all representations of the ID and later reads never restore it.                                         |
| F02 | `session.service.ts:186–190`                                         | A migrated Drive record with different cached/server bytes has no common version and cannot resume synchronization.                            | An explicit conservative bootstrap or documented recovery path preserves both copies and establishes a valid baseline. |
| F03 | `kdbx.service.ts:30–47`                                              | Credential containers use library-default KDF settings rather than the imported database's protection level.                                   | Comparable KDF costs with independent salts and encryption parameters.                                                 |
| F04 | `record.service.ts:251–317`; `workspace.page.tsx:105–126`            | Connection replacement has no signal or commit-time lifecycle check. The workspace checks its session only after persistent changes.           | Closing, locking, forgetting, or replacing the session invalidates validation and prevents a later credential commit.  |
| F05 | `record.service.ts:383–411`; `create-webdav.modal.tsx:64–81`         | A failed remote creation preserves the database but does not return/download its generated key file.                                           | Both confirmed creation and local recovery expose the generated key file.                                              |
| F06 | `session.service.ts:124–159`                                         | Creation recovery can use later local edits as the alleged common version after an earlier upload succeeded without confirmation.              | Preserve the original attempted bytes as recovery evidence; later edits survive reconciliation.                        |
| F07 | `record.service.ts:383–397`                                          | Post-create readback can observe different bytes, yet creation clears pending state while retaining the original cached bytes.                 | Validate and reconcile before declaring synchronization complete.                                                      |
| F08 | `workspace.page.tsx:164,174`; `workspace-controls.component.tsx:143` | The page supplies label `Demo`, while controls compare it with provider ID `demo`.                                                             | Demo has no database-download action. Labels never control behavior.                                                   |
| F09 | `entry-details.component.tsx`; `entry-edit.form.tsx`                 | Form defaults are initialized once for an entry UUID. Remote refresh can leave clean fields stale; remote deletion can unmount a dirty form.   | Clean fields refresh and dirty drafts survive incoming changes/deletion until explicit resolution.                     |
| F10 | `record.service.ts:303–305`; `session.service.ts`                    | Connection changes do not increment the guarded generation. Old-connection sync can persist its bytes/common version after the source changes. | Connection replacement invalidates old results at both persistence and UI boundaries.                                  |
| F11 | `registry.ts:7–10,33`; `use-sync.hook.ts:105–114`                    | Missing Google configuration disables schema recognition; Drive transport errors do not enter the same network-error recovery path as WebDAV.  | Stored data remains recognized, and common recovery policy receives normalized errors.                                 |
| F12 | `record.repository.ts:326–347`; `session.service.ts:386–389`         | Callback updates skip record validation; unlock replaces a whole possibly stale record merely to update `lastOpenedAt`.                        | Validate every mutation and update unlock metadata on the latest record without replacing newer bytes.                 |

## C01 — Freeze scope and preserve the reviewed baseline

**Depends on:** none.

**Files:** this plan, `docs/specs/webdav-provider.md`, affected feature docs,
`docs/architecture/database-providers.md`, ADR 4 if the trigger policy changes.

1. Check the PR head before starting implementation. If it changed, refresh the
   diff and comments and record which findings were already addressed.
2. Preserve existing user edits. In particular, `AGENTS.md`, several feature
   docs, the glossary, ADRs, and spec files were already modified or untracked.
3. Approve or revise the delivery proposal before moving changes between PRs.
4. Write the final intended trigger and conflict policy into the implementation
   spec. Distinguish a delivery split from a behavior reduction.
5. Keep implementation tickets local under `.scratch/` if tickets are requested;
   this document is a plan, not a set of approved `ready-for-agent` tickets.

**Done when:** each slice has a clear behavior boundary and no implementation
step depends on an unstated scope reduction.

## C02 — Decode storage once and make forgetting complete

**Depends on:** C01. Coordinate the final record types with C03.

**Edit:** `src/repositories/record.repository.ts`,
`src/repositories/credential.repository.ts`, `src/providers/record.schema.ts`,
`src/providers/registry.ts`, and `src/components/unlock/unlock.form.tsx`.

**Proposed operations:**

- `readRecordStore()` returns records and issues from one consistent read.
- `mutateRecord(id, updater)` validates the final row and preserves unknown rows.
- `commitSynchronizedRecord(id, expectedGeneration, result)` updates only the
  captured version and reports `applied`, `superseded`, or `forgotten`.
- `commitConnection(id, expectedGeneration, preparedConnection)` atomically
  changes the credential pointer and encrypted credential bytes.
- `forgetDatabase(id)` removes the row, quarantined representations, credentials,
  and recovery state and records the tombstone in the same persistence operation.

Keep these as a small repository API, not a generic command bus. Use one
IndexedDB transaction for multi-key changes; prepare KDBX encryption before
opening the transaction. Never hold a transaction open across network or KDF work.

Implementation steps:

1. Extract one decoder for absent state, legacy arrays, and the current envelope.
2. Keep unsupported envelopes untouched and refuse writes to them with an
   actionable compatibility error. Do not create an empty replacement store.
3. Parse active rows before considering recoverable invalid rows. A current
   active ID always wins; do not let an older quarantined row replace it.
4. Exclude forgotten IDs from both collections. Forget must also erase raw
   quarantined rows with that ID, so their remembered key material is removed.
5. Collect credential references from all matching rows, including preserved
   rows when their reference can be safely extracted. Leave unrelated keys alone.
6. Validate callback output and prevent changing a row's identity through an
   update. Missing IDs must not return a false successful update.
7. Replace unlock's whole-record update with a metadata update on the latest row.
   If bytes changed during unlock, reload/retry against the latest saved version.
8. Publish lifecycle notifications to local subscribers as well as other tabs.
   A BroadcastChannel does not deliver a message back to its sending object.
   Publish only committed state and close unused channels on disposal; remove the
   arbitrary 100 ms channel-closing timer if no longer necessary.
9. Keep schemas for every compiled provider available even when its authentication
   configuration is missing. Model availability separately.
10. Persist a binding/source version and add migration handling. Preserve IDs,
    remote source IDs, key-file bytes, names, and `lastOpenedAt` exactly where
    their formats have not changed.

**Regression cases:** duplicate active/quarantined IDs followed by forgetting;
unknown provider alongside healthy rows; future store version followed by an
attempted import; invalid updater output; stale unlock metadata update; credential
swap transaction abort; disabled Drive with cached data; same-tab and peer-tab
forget notifications; forgetting one database leaves another intact.

**Done when:** every persistence write uses a validated operation; unknown data
survives; forgotten data cannot be promoted or restored by later operations.

## C03 — Reduce provider contracts and keep setup UI typed

**Depends on:** C01; complete with C02 before migrating synchronization callers.

**Edit:** `src/providers/database-provider.ts`, all three `*.provider.ts` files,
`src/providers/registry.ts`, `src/providers/record.schema.ts`, and provider callers
in `record.service.ts` and `session.service.ts`.

1. Define a shared record envelope and provider-specific bindings. Keep the
   discriminated record union instead of intersecting it with `source?: unknown`
   and repeatedly casting it back to `ProviderRecord`.
2. Use `unknown` only for stored/external inputs before schema validation. Infer
   source and setup types from schemas; preserve those types inside each module.
3. Separate Local from Remote definitions. Remove Local's fake session factory.
4. Express replacement as `none`, `unconditional`, or `conditional`, with the
   matching method required by the variant. Conditional replacement takes a
   required revision; unconditional replacement does not pretend to accept one.
5. Express remote creation independently from replacement. Keep Local database
   creation in the shared KDBX workflow, not in a pretend remote transport.
6. Introduce a typed preparation result containing validated setup, display name,
   and duplicate identity. Replace the repeated input-name/input-identity/result-
   identity callbacks where the same schema is currently parsed several times.
7. Use explicit setup-connection and saved-connection unlock entry points instead
   of interpreting optional `record` and optional `setupInput` combinations.
8. Replace `requiresUnlockOnImport`, `storeCredentials`, and
   `retainLocalRecordBeforeCreate` Boolean combinations with the relevant typed
   setup/credential capability. Name operations after their actual purpose.
9. Move presentation-only `SetupActionDefinition` and modal loading into a UI
   registration type. Keep one central composition point that supplies both the
   core definition lookup and setup choices. Do not require two independent
   provider lists to be updated when adding a module.
10. Use typed lazy modal imports and one completion callback. Remove
    `Promise<unknown>`, runtime `typeof loaded.default` checks, and callback
    selection based on import/create inside the modal loader.
11. Remove the `credential-placeholder` record. Validate a candidate binding
    directly before a real credential ID exists.

**Done when:** Local has no remote methods; conditional operations cannot compile
without their required arguments; source casts are confined to one validated
registry dispatch boundary if heterogeneous dispatch requires it; core contracts
do not depend on React components.

## C04 — Give each unlocked database one lifecycle owner

**Depends on:** C02, C03.

**Proposed new file:** `src/services/session-lifecycle.service.ts`.
Keep this focused on one session's cancellation and validity, not a framework.

**Edit:** `session.service.ts`, `use-sync.hook.ts`, `workspace.page.tsx`, setup
modals, and the credential workflow extracted in C07.

1. Give every unlock a fresh runtime `sessionId`, even when reopening the same
   database ID. Keep one AbortController owned by that unlocked lifecycle.
2. Define persistent `generation` as the counter for mutations that invalidate
   captured content or connection state. Increment on local saves, connection
   changes, and successful replacement of cached content. Updating only
   `lastOpenedAt` does not increment it.
3. Every async completion captures `{ recordId, generation, sessionId }`.
   Repository commits compare generation/tombstone atomically; React updates
   compare the runtime session ID. A record ID check alone is insufficient.
4. Lock and unmount invalidate the runtime lifecycle synchronously, abort
   requests, and dispose the provider session. Forget also commits the persistent
   tombstone. A connection change aborts work on the previous transport before
   installing the new session.
5. Recheck validity after KDF work, after OAuth, before every authenticated
   request, and immediately before persistence. A completed network request does
   not authorize an obsolete local commit.
6. Setup operations use their own cancellable lifetime before a database session
   exists. Closing import/create/replacement invalidates that operation.
7. Handle abort separately from a provider error. Do not surface cancellation as
   a failed authentication or overwrite a newer status with an aborted result.
8. If a PUT may have reached the server before cancellation, retain pending or
   recovery state and re-read on the next valid attempt. Do not claim rollback of
   an HTTP operation already accepted by the server.

**Regression cases:** lock during GET, PUT, OAuth, and credential encryption;
forget during replacement; unlock the same ID again before an old callback
finishes; change URL while old sync waits; delayed response after unmount;
forget in a peer tab; late save completion after idle lock.

**Done when:** no late operation can restore an unlocked session, persist an old
connection's result, recreate forgotten state, or start another authenticated
request from an invalid lifecycle.

## C05 — Synchronize persisted snapshots through explicit stages

**Depends on:** C02–C04. Uses C06 for reconciliation.

**Proposed new file:** `src/services/synchronization.service.ts`.
`session.service.ts` keeps database unlock and demo-session creation.
`workspace.service.ts` keeps entry/group mutations and delegates local save.

The synchronization entry point accepts a record ID, unlocked credentials,
transport session, and lifecycle signal. It reads the encrypted cache itself;
it does not accept an unsaved caller database as a competing source of truth.

1. Move local-save bookkeeping into one operation: capture history-edit state,
   serialize the changed database, atomically update bytes, increment generation,
   set pending, retain the existing common version, return the saved record.
2. After a save completes, request synchronization. Remove
   `callerHasUnpersistedChanges` and its snapshot/base inference from
   `session.service.ts:63–113`. Update tests that currently pass unsaved database
   mutations directly; persist through the actual save workflow instead.
3. Acquire a per-record synchronization lock, then capture the latest saved
   record. Keep short store mutations separately serialized. Different databases
   must not wait behind one slow server.
4. Read one remote byte/revision pair. Unlock it and validate database identity
   before it can become a local cache, merge input, or upload baseline.
5. If creation recovery is pending, delegate to C07's recovery operation.
6. If there is no verified common version, delegate to the legacy bootstrap
   below; do not synthesize a common version from the current local database.
7. For a clean local database, install validated remote bytes without PUT.
8. For pending edits, load local/base/remote databases, restore local history-edit
   state, reconcile with C06, and serialize exactly one upload candidate.
9. Perform the advertised replacement operation. Retry only a genuine failed
   precondition, with a fresh GET each time; keep the total attempt limit at three.
10. When post-write readback differs from the candidate, reconcile that pair
    before clearing pending. Distinguish a confirmed stored candidate from a
    later independently modified remote version.
11. Commit only if the captured generation and lifecycle remain valid. On a
    superseded result, retain newer local bytes and schedule one follow-up pass;
    do not report the database fully synchronized.
12. On failure, retain the last successfully saved local bytes, common snapshot,
    and history-edit state. Avoid mutating the active UI database in place.

### Proposed legacy bootstrap without a known common version

Migration cannot infer whether an older cache contains unsynchronized edits.
Byte inequality also does not prove logical divergence because KDBX saves use
fresh encryption parameters.

1. Preserve the pre-bootstrap encrypted cache as recovery state before any write.
2. If local and remote bytes match, establish that pair as the common version.
3. Otherwise unlock and verify database identity, then use a separate conservative
   two-copy reconciliation mode. Do not pass either side as a fabricated base.
4. Keep the remote original for differing entries and preserve the local variant
   as a labelled conflict copy. Preserve remote-only entries. Preserve local-only
   entries under a new conflict-copy identity when remote deletion cannot be
   excluded. Do not infer deletions from absence without a common version.
5. Retain existing library history/group merge behavior and the recovery snapshot;
   add explicit cases for tombstones, recycle-bin entries, and moved groups.
6. Establish a normal common version only after a confirmed successful bootstrap.
   If remote credentials or identity differ, stop writes and keep the export.

This conservative behavior may create extra copies on the first upgraded sync.
It is a proposed compatibility policy requiring approval with C01, not an
assertion that the original spec already defines this algorithm.

**Done when:** synchronization has one saved input, one verified base, bounded
reconciliation, and one conditional repository commit. Clean refresh makes no
upload; a newer save always remains pending until its own synchronization succeeds.

## C06 — Make conflict-copy policy explicit and preserve KDBX semantics

**Depends on:** C03. Land with C05's common-version handling.

**Edit:** `src/services/conflict-copy.service.ts`,
`src/services/workspace.service.ts:172–180`, and conflict/history fixtures.

1. Replace `serializableValue`'s recursive object walk with an explicit entry
   comparison. Normalize protected/plain field text identically; compare binary
   content/references, tags, expiry, colors, icons, custom data, auto-type,
   override URL, quality settings, and location deliberately.
2. Exclude modification/access timestamps from divergence detection. Equal
   timestamps must not suppress a real content conflict.
3. Replace `EntryResolution`'s nullable variants and Boolean combinations with a
   discriminated result. Keep data required by each result in that variant only.
4. Implement a small decision function and a separate application step:

| Local since base       | Remote since base      | Required result                                     |
| ---------------------- | ---------------------- | --------------------------------------------------- |
| Unchanged              | Changed                | Keep remote change.                                 |
| Changed                | Unchanged              | Keep local change.                                  |
| Same resulting content | Same resulting content | Keep one entry.                                     |
| Differently changed    | Differently changed    | Remote original plus local conflict copy.           |
| Deleted                | Edited                 | Deleted original plus remote edit as conflict copy. |
| Edited                 | Deleted                | Deleted original plus local edit as conflict copy.  |
| Deleted                | Deleted                | Keep original deleted.                              |

5. Treat entries created since the base and UUID collisions explicitly. Keep
   conflict-copy identity separate from source entry identity.
6. Let kdbxweb merge groups, database metadata, binaries, icons, and history;
   apply only the entry-content policy that the product deliberately adds.
7. Audit every property restored after `copyFrom` or `importEntry`. The installed
   implementations do not copy every field compared by this service. Preserve
   custom data and quality settings explicitly, without sharing mutable objects
   between local and remote databases.
8. Match existing conflict copies by original identity and normalized content,
   without relying on the title suffix alone. Verify protected titles and titles
   already ending in the suffix.
9. Preserve history-edit state across clone/save/reload; clear it only after
   confirmed upstream push. Test deleted history records do not reappear.

**Done when:** the decision table passes through real encrypted round trips;
retries and remounts create no duplicate copies; attachment, icon, custom-data,
and history contents remain usable after upload/download.

## C07 — Separate credential storage and creation recovery

**Depends on:** C02–C04; creation reconciliation uses C05/C06.

**Proposed new files:** `src/services/connection-credentials.service.ts` and
`src/services/database-creation.service.ts`.

**Edit:** `record.service.ts`, `kdbx.service.ts`, WebDAV provider/session creation,
credential repository, and WebDAV setup/recovery modals.

### Credential workflow

1. Import downloads bytes with a temporary transport, unlocks the main database,
   constructs the credential container, and atomically persists both records.
   Wrong password/key file and abandoned setup leave no saved connection.
2. Pass the unlocked database's KDF protection into container creation. For KDBX4,
   preserve the supported algorithm and cost parameters with a fresh salt. For
   KDBX3, explicitly map supported AES transform settings rather than silently
   switching to cheaper defaults. Verify the chosen mapping against kdbxweb.
3. Never reuse the main database's salt, master seed, IV, protected-stream key,
   or raw encryption key. KDBX creation must generate independent parameters.
4. Reuse the already unlocked database credentials during saved-connection unlock
   where supported; do not retain another plaintext master-password copy merely
   to reopen the container. Keep a single typed database-unlock factor boundary.
5. Replacement validates endpoint, authentication, decryptability, database
   identity, and duplicate connection identity before preparing a new container.
6. Recheck lifecycle and expected generation, then atomically install the new
   credential record and binding and remove the old credential record. Serialize
   competing import/create/replacement identity checks at commit time.
7. On failure retain the old connection. On lock/forget abort and dispose the
   temporary transport. Never delete the old credentials on a transient 401.

### Creation workflow and result

Use an explicit outcome instead of `LocalRecoveryRecordSavedError` for the
expected case where the database exists locally but remote success is unconfirmed:

```ts
type DatabaseCreationResult = {
  record: PersistedFileRecord;
  generatedKeyFile?: { bytes: Uint8Array; name: string };
} & ({ outcome: 'created' } | { outcome: 'saved-locally'; error: Error });
```

1. Build and save the empty database and optional key file before remote creation.
2. For WebDAV, persist the encrypted recovery database, credential record, and
   immutable original creation-attempt bytes before PUT.
3. Always return the generated key file once local recovery has been persisted,
   including on failed/uncertain upload. UI downloads it in both result variants.
4. Keep creation recovery distinct from ordinary missing-file recovery. An
   imported file returning 404 must never enter automatic create.
5. On confirmed PUT success, validate the returned snapshot or GET readback. If
   bytes differ, unlock, check identity, and reconcile before marking clean.
6. On uncertain completion, read the target first. If present and the identity
   matches, reconcile using the original attempted bytes and current cache. If
   absent, retry conditional creation; if another file appears, preserve local
   recovery and refuse replacement. A GET/PUT race remains protected by
   `If-None-Match: *`.
7. Persist current local bytes separately from original attempt bytes. Editing
   the recovery database must never advance the assumed creation baseline.
8. Use C02's generation check to ensure creation finalization cannot clear pending
   state for a local save made while upload/readback was running.
9. Clear creation-attempt recovery metadata only after a confirmed, valid result.
   Retain the explicit pre-bootstrap backup until its recovery policy permits
   removal; complete Forget database removes all such snapshots.

**Concrete regression timeline for F06:** create bytes A; server stores A but
the client sees a network error; user saves edit B locally; retry sees the server
file already exists; reconcile with base A, local B, remote A; upload retains B.
The incorrect base B must never be used.

**Done when:** every locally preserved creation is exportable with its generated
key; credential replacement is atomic/cancellable; strong imported KDF settings
are not weakened by the local credential container.

## C08 — Keep transport small and make provider failures consistent

**Depends on:** C03/C04. Can be developed independently of UI cleanup.

**Edit:** `src/providers/webdav.provider.ts`,
`src/repositories/google-drive.repository.ts`, `src/providers/google-drive.provider.ts`.
Extract `src/providers/webdav.transport.ts` only to separate HTTP from credential
container/repository access; avoid one file per small helper.

1. Keep URL canonicalization, HTTP Basic construction, status mapping, and
   GET/conditional PUT in the WebDAV boundary. Export its validated connection
   schema for setup UI so validation rules cannot drift.
2. Reject non-HTTPS, embedded credentials, fragments, unsupported query forms,
   collection URLs, and Basic-auth usernames containing a colon. Preserve
   legitimate encoded path segments and fail clearly on malformed escapes.
3. Retain `credentials: 'omit'`, `cache: 'no-store'`, `redirect: 'error'`, signal
   forwarding, and complete-body consumption. Disposal releases usable auth
   references; lifecycle ownership aborts in-flight work.
4. Return a snapshot only from complete GET bytes and that response's exact ETag.
   Keep missing/weak validators readable but refuse conditional replacement.
5. Keep create-only and replace-only headers distinct. Never preflight existence
   and then issue an unconditional write.
6. Trust a successful PUT validator only when it is usable for the actual stored
   representation; otherwise GET a fresh pair. Never attach a HEAD validator to
   earlier bytes. The common workflow handles changed readback.
7. Distinguish 401, 403, 404/410, 409, 412, 423, 507, unsupported methods, transport
   failures, and aborts. Only 412 enters stale-write reconciliation.
8. Normalize equivalent Drive errors into common categories in its adapter.
   Preserve the repository's existing user-driven OAuth flow and AbortSignal
   forwarding; do not add background login popup loops.

### Library decision

Recommendation: retain the small fetch transport for this GET/PUT-only scope.
The inspected `webdav` implementation supports detailed GET responses, but its
PUT helper returns a Boolean and its request conversion does not directly
forward the current redirect/cache controls. This is an assessment of inspected
upstream source, not proof that no supported customization exists.

Before replacing transport with a dependency, demonstrate all of these against
the selected release: exact encoded URL, response headers with bytes, strong
ETag pairing, conditional create/replace, redirect refusal, omitted cookies,
abort, complete-body failure, browser bundle size, and normalized errors. Adopt
it only if the resulting adapter is materially simpler without patching global
fetch behavior. Keep the chosen release and rationale in the PR description.

References inspected on 2026-10-16:

- [Project documentation](https://github.com/perry-mitchell/webdav-client).
- [GET implementation](https://github.com/perry-mitchell/webdav-client/blob/master/source/operations/getFileContents.ts).
- [PUT implementation](https://github.com/perry-mitchell/webdav-client/blob/master/source/operations/putFileContents.ts).
- [Request conversion](https://github.com/perry-mitchell/webdav-client/blob/master/source/request.ts).

**Done when:** transport tests prove all conditions independently of the chosen
HTTP implementation, and shared synchronization never inspects provider IDs or
HTTP status strings to decide recovery.

## C09 — Specify and coalesce synchronization triggers

**Depends on:** C04/C05/C08; shipping the added triggers depends on C01's decision.

**Edit:** `src/hooks/use-sync.hook.ts`. Keep event registration in the hook and
network/reconciliation work in the synchronization service.

Proposed event policy, consistent with the current spec:

| Event/state                                                          | Action                                                                                               |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Successful unlock with usable connection                             | Request one sync.                                                                                    |
| Completed local save                                                 | Request sync for latest saved generation.                                                            |
| Tab becomes visible                                                  | Refresh if unlocked and no blocking auth/resource/capability error.                                  |
| Online event after transient network failure or pending offline work | Request one sync. Treat the event as a hint, not proof the server is reachable.                      |
| Manual retry                                                         | Retry recoverable failures or pending work. Route auth/connection failures to their recovery action. |
| Locked, forgotten, disposed, demo, or Local                          | Start no remote operation.                                                                           |

1. Keep at most one running pass and one requested follow-up per session. A new
   save/event records that another pass is needed; it does not repeatedly cancel
   the current upload. Abort remains for lifecycle invalidation.
2. Schedule from explicit events, not from every record/status change caused by
   synchronization itself. Prevent a sync-success render from creating a loop.
3. Network errors may recover on visibility/online/manual action. Authentication,
   missing file, unrelated database, and unsupported conditional writes require
   the corresponding recovery action; do not repeatedly retry them on tab focus.
4. Keep manual retry available and correctly labelled. Add no timers, automatic
   exponential retry machinery, or connectivity polling.

**Done when:** event bursts produce one pass plus at most one necessary follow-up;
manual retry works; error policy is identical for applicable Drive/WebDAV cases;
no authenticated work begins while locked.

## C10 — Simplify setup and workspace presentation without losing drafts

**Depends on:** C03–C05/C07. Split draft-preservation work from cosmetic menu work.

**Edit:** `import.menu.tsx`, `create.menu.tsx`, `provider-setup-modal.tsx`, the
three WebDAV modals, `workspace.page.tsx`, `workspace-controls.component.tsx`,
`entry-details.component.tsx`, and `entry-edit.form.tsx`.

1. Extract one provider-action menu shell. Keep small Import/Create wrappers if
   useful to existing callers. Render only the selected provider modal.
2. Use C03's typed UI registrations and a consistent `onComplete` callback.
   Provide a loading state and retryable load failure without handwritten module
   shape probing.
3. Extract repeated WebDAV connection fields and schema. Keep create-only database
   naming/password/key-file controls and import-only unlock controls in their
   own forms.
4. Move replacement orchestration to the credential/lifecycle service. The page
   opens an action and consumes its valid result; it does not construct providers,
   interpret credential storage, or maintain a second async session state machine.
5. Derive provider recovery actions from capabilities/error state. WebDAV owns its
   replacement modal; the generic workspace renders the registered action.
6. Give controls separate `providerLabel`, `canDownload`, and recovery-action
   props. Remove all logic that compares a display label with `demo` or provider IDs.
7. Use truthful statuses: local save confirmed, synchronization running, remote
   synchronization confirmed, or error. A saved connection is not yet a synced
   database. Show saved-local alongside a remote failure when pending data exists.
8. Reset closed setup forms explicitly and invalidate their work. Closing a form
   during KDF/network work must not save it later.
9. For a clean selected-entry form, reset values when its accepted database
   version changes. A reset must not manufacture a dirty state.
10. For a dirty form, retain its draft and original edit baseline when remote
    state arrives. If the selected entry is deleted remotely, do not unmount the
    draft. Saving preserves the draft as a new entry/conflict copy while the
    original deletion remains; explicit discard accepts the remote state.
11. If a mutation is already saving, defer installation of an incoming database
    into the editor until that save completes. Reconcile its persisted result
    before accepting newer remote state, rather than overwriting a remote change
    using a form's stale full-entry defaults.
12. Idle lock still discards runtime drafts and releases secrets as defined by the
    existing lock policy; draft preservation must not block idle lock.

**Done when:** clean fields reflect refresh; unsaved input survives ordinary
refresh/deletion; same-entry incoming changes are preserved; demo never exposes
Download; recovery buttons perform the action their labels describe.

## C11 — Add focused behavioral regression coverage

**Depends on:** each test group accompanies its corresponding task. Do not wait
until all refactoring is complete to test the risky paths.

Use the existing Vitest, React Testing Library, MSW, real KDBX, native Argon2
bridge, and fake IndexedDB. Feature behavior goes through `App` wherever practical;
small protocol, storage, and conflict tables stay at their existing useful seams.
Do not duplicate every scenario at every layer or add production-only test APIs.

**Existing files to extend/reorganize:**

- `__tests__/component/app.provider-registry.spec.tsx`: split the large combined
  import/replacement/offline/forget test into focused workflows.
- `__tests__/unit/record.repository.spec.ts`: migration, transactions, validation,
  tombstones, and preservation of unknown rows.
- `__tests__/unit/record.service.spec.ts`: import/create compatibility; move
  extracted workflow coverage to focused service suites as appropriate.
- `__tests__/unit/session.service.spec.ts`: retain unlock/demo coverage; move
  synchronization scenarios to `synchronization.service.spec.ts`.
- `__tests__/unit/conflict-copy.service.spec.ts`: decision table and real round trips.
- `__tests__/unit/webdav.provider.spec.ts`: protocol/error/URL matrix.
- `__tests__/component/workspace-controls.component.spec.tsx` and actual App
  workflows: labels, recovery actions, and demo download regression.

Add shared fixtures for encrypted base/local/remote databases, uploaded-file
inspection, and deferred MSW responses. Model remote content with stateful bytes
and ETags instead of request-count-sensitive authentication rules. Use barriers
to release requests deterministically; avoid timing sleeps.

| Test group           | Required scenarios                                                                                                                                                                 | Assert                                                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Storage              | Legacy arrays; future envelopes; invalid row among valid rows; duplicate IDs; disabled Drive; invalid update output.                                                               | Healthy bytes/key material retained, unknown data preserved, no invalid write accepted.                                                |
| Forget               | Active and quarantined duplicate; credential replacement races; delayed sync/save; peer-tab notification.                                                                          | No restored row, credential, session, or follow-up authenticated request; other database untouched; no remote DELETE.                  |
| Credentials          | Stronger imported KDF; KDBX3/4; password only; password plus key file; wrong factors; missing/corrupt container; failed replacement.                                               | Required factors enforced, costs retained, salts independent, old connection survives failure, main exports contain no server secrets. |
| Setup cancellation   | Close import/create/replacement during GET and during encryption; lock/forget before commit.                                                                                       | No abandoned connection commit; uncertain remote creation retains recoverable local outcome.                                           |
| Create               | Successful conditional creation; actual existing destination 412; uncertain success; retry after later edits; changed readback; unrelated existing file; generated key on failure. | Conditions exact, remote file not overwritten, latest local edit retained, export and generated key usable, no false clean state.      |
| Conditional sync     | Missing/weak/malformed ETag; exact validator; one 412; three 412s; PUT without validator; readback changed; truncated response.                                                    | No unconditional fallback, bounded attempts, same-response pairing, saved edits retained on failure.                                   |
| Conflict policy      | Independent entries; same entry/equal timestamps; identical edits; both deletion directions; repeated retry/remount; group move; attachments/icons/custom data/history.            | Every retained variant visible and decryptable; no duplicate conflict copies; original deletion respected.                             |
| Lifecycle/save races | Save during GET/PUT; connection replacement during old sync; lock/unlock same ID; forget with request waiting.                                                                     | Generation/session checks prevent rollback, old-source commit, and unlocked-session resurrection.                                      |
| Editor               | Clean refresh; dirty refresh; same-entry competing save; selected entry deleted; mutation already saving; idle lock.                                                               | Fresh clean fields; draft retained until save/discard; competing remote values retained; idle lock unblocked.                          |
| Trigger policy       | Unlock; save; tab return; online; burst of events; auth/missing-file errors; manual retry.                                                                                         | One running pass, coalesced follow-up, correct recovery action, no polling or locked work.                                             |
| Compatibility        | Local import/create/download; Drive OAuth/picker/import/create; remembered key files; legacy Drive bootstrap; demo.                                                                | Existing flows remain usable and provider write guarantees remain honest.                                                              |

Correct misleading tests while splitting them: the App test named creation
"without replacing an existing destination" currently exercises a 201 success;
add a separate 412 scenario with a pre-existing file. Move the raw KDBX round-trip
smoke test into shared environment/fixture coverage if it does not exercise App.
Make IndexedDB cleanup explicit between scenarios; DOM cleanup alone is not a
persistence reset. Keep browser-API overrides only where required and explain
their purpose through fixture names rather than broad test-only production changes.

## C12 — Extract optional Google configuration and align documentation

**Depends on:** C01–C03. Optional configuration can ship independently of WebDAV.

**Optional-config slice:** `astro.config.mjs`, `src/providers/google-drive.config.ts`,
Drive picker/repository config imports, registry availability filtering, and
`__tests__/unit/google-drive.config.spec.ts`.

1. Remove optional-config behavior from the WebDAV review scope if the split is
   approved. Preserve required settings until the independent slice lands.
2. In that slice, absent/blank identifiers disable only remote setup/auth actions.
   Existing Drive caches remain recognized and available to unlock/export.
3. Emit one non-secret informational configuration message. Do not log identifiers,
   tokens, or a message on every render.
4. Test both identifiers present, either missing, blank values, cached records
   without configuration, and availability after configuration returns.

**Documentation changes to include with the matching implementation:**

| File                                                                   | Required correction                                                                                                                                                  |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/specs/webdav-provider.md`                                        | Approved delivery split, migration bootstrap, creation recovery, and final trigger policy.                                                                           |
| `docs/architecture/database-providers.md`                              | Actual typed boundaries, availability versus recognition, credential ownership, lifecycle invalidation.                                                              |
| `docs/adr/0004-use-shared-provider-contracts-and-a-static-registry.md` | Change only if the approved provider/trigger decision changes; do not silently contradict it.                                                                        |
| `docs/features/webdav-kdbx.md`                                         | Remove premature completion claim until regressions/checks pass; explain key-file recovery and uncertain creation.                                                   |
| `docs/features/google-drive-kdbx.md`                                   | Actual conflict/triggers, migration, saved-local status, and optional configuration only in its own slice.                                                           |
| `docs/features/immediate-autosave.md`                                  | Update affected provider/persistence statements; describe actual synchronization scheduling/state. Do not claim typing autosaves if the UI still uses explicit Save. |
| `docs/screens/unlock-screen.md`                                        | Final setup, compatibility issue reporting, recovery export, generated-key download, and Forget database behavior.                                                   |
| `docs/screens/workspace-screen.md`                                     | Saved-local versus synced state, correct retry/recovery actions, and draft behavior during refresh.                                                                  |
| `docs/features/storage-terminology.md`                                 | Keep Database provider, WebDAV connection, Conflict copy, and Forget database consistent.                                                                            |

Preserve all existing user-authored local documentation changes. Do not add
documentation for features that did not change or claim live server compatibility.

## Verification and completion gates

For the plan document itself, run Prettier against this file and verify local
links. Application checks need not be rerun for a Markdown-only edit.

For implementation, use the declared supported Node/npm versions, then run the
following checks on each completed slice as applicable:

```sh
npm run check
npm run lint
npm run csslint
npm run format
npm test
npm run build
```

Run focused tests while implementing a task, then the full suite before declaring
the slice ready. Capture newly failing regression scenarios before their fix and
record the final results. Do not copy, read, or modify secret configuration files
to make a check pass. Request a missing required value only if the relevant check
cannot run with existing safe configuration.

Completion requires all of the following:

- Every finding F01–F12 has a regression or a documented, justified disposition.
- All nine review threads map to an implemented change, an approved scope split,
  or a specific explanation of retained code.
- No unsaved caller database enters the synchronization service.
- No provider contract advertises an operation without its implementation.
- No display label controls provider behavior.
- No connection change or async completion bypasses lifecycle/generation checks.
- No creation recovery invents a common version from later local edits.
- Existing Local/Drive data, remembered key files, and in-memory demo flows work.
- All applicable checks pass; remaining limitations are stated precisely.
- Component tests are not represented as proof of real-browser CORS behavior.
- Live deployment verification remains optional and requires no server secrets
  to complete this implementation.

## Implementation record

Implementation stayed on the current feature branch and retained the proposed
behavior policy: event-based sync triggers, conservative bootstrap for old
records without a verified common version, and visible conflict copies for
competing entry edits. The Google Drive availability work remains a reviewable
slice of this branch; stored records stay recognized when setup configuration
is missing.

- C01: rechecked PR #78 on 2026-10-17. Its remote head remained
  `a1b4a6b2b6986462ef2d05e60b873c822ac5bd68`, with nine unresolved inline
  review threads.
- C02–C03: persistence and typed provider foundations are in the existing
  commits `a1b4a6b` and `21c20e1`.
- C04–C10: lifecycle, persisted-snapshot synchronization, conflict copies,
  credential and creation recovery, provider error handling, event triggers,
  cancellable setup, and workspace draft handling are implemented.
- C11: the full Vitest suite passes: 36 files and 453 tests.
- C12: provider, storage, unlock, workspace, WebDAV, and save documentation now
  describes the implemented behavior.

Local verification used Node.js 24.19.0 from the workspace runtime. The
installed npm 11.6.2 does not meet the repository's npm 11.11.0 requirement,
so the equivalent local binaries were run directly: Astro check, ESLint,
Stylelint, Prettier, Vitest, and Astro build all passed. ESLint reports no
errors. Live browser CORS and deployment compatibility remain unverified.

Before any commit, separately show the exact Conventional Commit message and
obtain the user's confirmation as required by `AGENTS.md`. Do not create commits,
push, rewrite PR history, or reply to reviewers merely because this plan exists.
