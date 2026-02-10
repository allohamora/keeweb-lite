# keeweb-lite

Lightweight, web-only password manager inspired by [KeeWeb](https://github.com/keeweb/keeweb).

This project is intentionally focused on a small, practical feature set because upstream KeeWeb is abandoned.

## Project Goals

- Open local `.kdbx` files.
- Unlock with password and optional key file (local key file only).
- Open `.kdbx` files from Google Drive.
- Read, render, edit, and save KDBX through `kdbxweb`.
- Save immediately after every edit.
- Use native KDBX entry history and render history/restore in the UI.
- For Drive-backed files, sync after each change and provide manual `Sync now`.
- For in-memory mode, update only in memory and provide a `Download key` button.
- Persist and display last sync metadata.
- Show sync status with a colored status circle (different colors per sync state).
- Keep a KeeWeb-like interface with no server.

## Core Constraints

- 100% client-side only.
- No backend server, custom API, or hosted database.
- Must run as a static web app.

## Docs

- Detailed feature specs live in `docs/features/`.

## Tech Stack

- Astro 5 + React 19
- TypeScript (strict)
- TailwindCSS v4 + shadcn-style UI components
- `kdbxweb` for KDBX operations
- Zustand planned for app state (not implemented yet)

## Development

```bash
npm run dev
npm run build
npm run preview

npm run lint
npm run lint:fix
npm run csslint
npm run csslint:fix
npm run format
npm run format:fix
```

## Commit Conventions

- Use [Conventional Commits](https://www.conventionalcommits.org/) format: `<type>[optional scope]: <description>`
- Keep commit summaries concise.
- Common types:
  - `feat`: new feature
  - `fix`: bug fix
  - `docs`: documentation only
  - `style`: formatting, whitespace
  - `refactor`: code restructuring without behavior change
  - `perf`: performance improvement
  - `test`: adding or updating tests
  - `chore`: maintenance, dependencies, tooling
  - `ci`: CI/CD changes
- Breaking changes: add `!` after type (e.g., `feat!:`) or `BREAKING CHANGE:` in footer.

## Project Structure

```text
src/
├── components/ui/   # Reusable UI components
├── layouts/         # Astro layouts
├── pages/           # Astro pages
├── lib/             # Custom libs and third party GOF wrappers
├── services/        # Business/domain logic services (*.ts)
└── styles/          # Global styles
```

## Service Layer Rule

- All business logic must be implemented in `src/services/name.ts` files.
- Example: `src/services/kdbx.ts` should contain all KDBX actions.
- UI components and pages should call services, not implement business logic directly.

## Security and Privacy Baseline

- Never log secrets (passwords, key file data, decrypted values, OAuth tokens).
- Never persist plaintext credentials.
- Prefer least-privilege Drive scopes (`drive.file`).
- Persist only minimum metadata needed for reopen/sync.
