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
- For Drive-backed files, sync after each change and provide manual `Sync`.
- For in-memory mode, keep the unlocked model in memory and provide a `Download` button.
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

- **Astro 5**: Full-stack framework with hybrid content + islands architecture
- **React 19**: Interactive UI islands & concurrent features
- **TypeScript (strict)**: End-to-end static typing
- **TailwindCSS v4**: Utility-first styling with CSS layering & `@apply` minimization
- **Shadcn/Ui**: Accessible, composable component primitives styled with Tailwind and project design tokens
- **kdbxweb**: KDBX file format operations
- **Zustand**: Planned for app state management
- **React Hook Form**: Planned for performant form state management
- **Zod**: Planned for schema-based validation & type inference
- **ESLint / Prettier / Stylelint**: Consistent formatting & linting
- **Modules (ESM)**: Native module interoperability

## Development

### Running the Application

```bash
npm run dev       # Start Astro dev server
npm run build     # Production build
npm run preview   # Preview production build
```

### Code Quality

```bash
# Diagnostics
npm run astro check  # Astro diagnostics & type-checking

# Linting
npm run lint         # ESLint check (ts, tsx, astro)
npm run lint:fix     # ESLint fix

# CSS Linting
npm run csslint      # Stylelint check
npm run csslint:fix  # Stylelint fix

# Formatting
npm run format       # Prettier check
npm run format:fix   # Prettier write
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

## Development Guidelines

### Dependencies

- Install new dependencies using npm install commands.
- DO NOT manually edit `package.json` or `package-lock.json`.

### Code Style

- Write comments only when necessary to clarify complex logic; prefer self-documenting code.
- Use `for...of` loops instead of `forEach` for better performance and readability.
- Avoid single-letter or one-word variable names; use descriptive names that clearly indicate purpose (e.g., `task` instead of `t`, `fileData` instead of `d`).
- DO NOT use the non-null assertion operator (`!`) in TypeScript; instead, use proper type guards, optional chaining, or refactor to handle null/undefined cases explicitly.

### Component Development

- Use `shadcn` CLI commands to install or update UI components.
- DO NOT write component source from memory; always use the CLI to ensure consistency.

### Astro Patterns

- Use Astro Actions (`src/actions`) instead of adding bespoke API endpoint routes.
- Implement server logic in actions and invoke them from forms/components to keep a unified server boundary.

### Maintenance

- After changes, update tests and docs when needed to keep behavior and documentation aligned.

## Security and Privacy Baseline

- Never log secrets (passwords, key file data, decrypted values, OAuth tokens).
- Never persist plaintext database unlock credentials (passwords, key-file bytes, decrypted values).
- OAuth runtime tokens for cloud storage are stored in `localStorage` using provider-scoped keys (Google Drive key: `keeweb-lite.oauth.google-drive`).
- Prefer least-privilege Drive scopes (`drive.file`).
- Persist only minimum metadata needed for reopen/sync.
