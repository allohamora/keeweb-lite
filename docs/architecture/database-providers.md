# Database provider architecture

Local, Google Drive, and WebDAV use shared typed contracts and one static registry. Google Drive remains registered so stored records are always recognized; its import and create actions are available only when both public Google identifiers are configured. Missing configuration leaves cached Drive data available for unlock and download while remote actions remain unavailable.

## Boundaries

| Component                | Responsibility                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Provider definition      | Stable ID, label, source schema and version, operations, capabilities, and optional availability.                                                |
| Database binding         | One database's provider identity and validated, versioned source configuration. WebDAV credentials are stored separately in an encrypted record. |
| Provider session         | Temporary authentication state, storage operations, remote revision interpretation, and request cleanup.                                         |
| Provider setup UI        | Local file input, Google Drive picker, or WebDAV URL and credential form. Produces typed setup input for the shared workflow.                    |
| Shared database services | KDBX creation, unlock, serialization, encryption, merging, conflict policy, and history state.                                                   |
| Shared synchronization   | Event triggers, pending changes, common-version state, retries, cancellation, and status.                                                        |
| Record repository        | Encrypted database and credential records, source configuration, migrations, and complete local forgetting.                                      |

Provider transports operate on encrypted database bytes. They do not decrypt or merge databases. Common services do not construct vendor API requests or interpret a provider's revision format.

## Capabilities and operations

The contract represents supported operations explicitly rather than requiring every provider to implement methods that do nothing.

- Local shares registration, setup, browser persistence, and download behavior. It has no remote session operations.
- Remote sessions expose reading and their supported write and create operations. Read-only storage can be represented without requiring a new workflow, but adding a new read-only product flow is outside this change.
- Conditional replacement takes the revision paired with the downloaded snapshot and fails if it is stale. Unconditional replacement is a distinct capability without this guarantee.
- Conditional creation fails when a file already exists. It is independent of replacing an existing file.
- Revisions are opaque to common services. A conditional read must provide the revision belonging to the returned bytes; providers must not invent a revision or attach unrelated metadata to a snapshot.
- Cancellation and disposal belong to the session lifecycle. Locking and forgetting invalidate pending work before releasing sensitive state.
- Each unlocked database owns a runtime lifecycle ID and abort signal. Repository commits compare persistent generation and forgotten-record tombstones; UI updates compare the runtime session ID.
- Provider errors distinguish authentication, permission, missing resource, failed precondition, locked resource, capacity, network, and unsupported capability failures. Common workflows map these to recovery behavior without matching provider IDs.

Typed capability variants should prevent common code from silently converting a conditional operation into an unconditional upload. WebDAV requires protected writes for automatic synchronization. Google Drive's existing adapter currently uploads unconditionally; changing the interface does not strengthen that server operation.

## Authentication and setup

- Authentication stays provider-specific: Google Drive keeps its OAuth flow; WebDAV initially supports HTTP Basic over HTTPS with a username and password or app password; Local has no remote credentials. Additional WebDAV authentication methods can be added later.
- Shared encryption and storage services protect persisted WebDAV secrets with the database's unlock credentials. This does not imply that every provider persists the same credential fields or uses the same authentication lifecycle.
- Importing an existing WebDAV database downloads encrypted bytes using temporary setup credentials, then completes database unlock before persisting the encrypted credential record.
- Setup forms remain provider-specific. Do not combine a local File, a Drive file ID, and a WebDAV URL into a form full of provider-specific optional fields.
- The application composes setup UI with provider definitions in a static registry. Core database and transport contracts remain independent of React components.

## Registry and persistence

- Shared menus, labels, setup actions, sync availability, and status use registered definitions and capabilities.
- Stored record recognition does not depend on provider availability. Setup actions are filtered by capability and availability at the UI registry boundary.
- Keep provider-specific source types and validation at module boundaries. Do not replace typed source data with arbitrary dictionaries throughout the application.
- Legacy record arrays migrate to the versioned records envelope on a validated write. Unsupported versions remain untouched and block mutation; individual invalid rows stay visible while healthy records remain usable.
- Local saves happen only after the explicit workspace Save action. Remote saves persist encrypted bytes and pending state before synchronization.
- Preserve existing Local and Google Drive identities and stored records through an explicit versioned migration.
- Preserve unsupported or invalid records for individual reporting and recovery. One incompatible record must not clear the entire store.
- Demo remains an in-memory session and is not a persisted storage provider.

## Adding a provider

1. Add its provider module with source schema and migration, supported capabilities, authentication, storage adapter, and setup UI.
2. Register the module in the central registry.
3. Check its protocol behavior and common contract expectations, including the concurrency guarantees it advertises.

Adding a provider should not require new provider-ID branches in synchronization hooks, database services, or generic screens. Shared contracts should evolve only for a genuinely new capability, not for vendor-specific field names. Runtime installation of external plugins is outside this design.

## Shared synchronization policies

- Google Drive and WebDAV use the same visible conflict-copy policy, including preserving an edit that conflicts with deletion.
- Both synchronize on initial opening after unlock, returning to a visible unlocked tab, completed saves, relevant online events, and manual retry. Neither polls on an interval.
- Status separates pending local bytes from remote confirmation. Google Drive's and WebDAV's network failures retain the local cache and pending state.
- Google Drive's existing unconditional upload limitation remains explicit. Sharing the policy and scheduler does not claim stronger remote-write guarantees.

See the [WebDAV feature plan](../features/webdav-kdbx.md) and [registry ADR](../adr/0004-use-shared-provider-contracts-and-a-static-registry.md).
