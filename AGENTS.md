# keeweb-lite

Lightweight, web-only password manager inspired by [KeeWeb](https://github.com/keeweb/keeweb).

This project is intentionally focused on a small, practical feature set because upstream KeeWeb is abandoned.

## Project Goals

- Keep KeeWeb-lite as a small, practical, static web app.
- Implement behavior defined in feature specs and screen specs.
- Avoid duplicating feature-level implementation details in this file.

## Core Constraints

- 100% client-side only.
- No backend server, custom API, or hosted database.
- Must run as a static web app.
- No SSR-only runtime behavior, API routes, Astro Actions, or server adapters.

## Docs

- Feature specs: [docs/features](docs/features/)
- Screen specs: [docs/screens](docs/screens/)

## Tech Stack

- **Astro 5**: Static build + islands architecture
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
- **[Conventional Commits](https://www.conventionalcommits.org/)**: Commit format `<type>[optional scope]: <description>`; breaking changes with `!` or `BREAKING CHANGE:`

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
npm run check     # Astro diagnostics & type-checking

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

## Project Structure

```text
src/
├── components/
│   ├── ui/          # shadcn/ui primitives and wrappers
│   └── **/*.component.tsx  # Custom app components (non-shadcn, nested folders allowed)
├── layouts/         # Astro layouts
├── pages/           # Astro pages
├── lib/             # Custom libs and third party GOF wrappers
├── repositories/    # Persistence repositories and storage adapters (*.repository.ts)
├── services/        # Business/domain logic services (*.ts)
└── styles/          # Global styles
```

## Layering Rule

- Build application features using layers (UI, domain/services, repositories/persistence) to keep responsibilities clear.
- Prefer putting domain logic in `src/services/*.ts`.
- Prefer putting browser persistence logic in `src/repositories/*.repository.ts`.
- Prefer putting custom app UI in `src/components/**/*.component.tsx`.
- Shadcn-derived code means `src/components/ui/*` and `src/lib/utils.ts`.
- These are guidance defaults, not hard constraints; small pragmatic deviations are acceptable when they improve clarity.

## Development Guidelines

### Dependencies

- Install new dependencies using npm install commands.
- DO NOT manually edit `package.json` or `package-lock.json`.

### Code Style

- Write comments only when necessary to clarify complex logic; prefer self-documenting code.
- Prefer arrow-function constants over function declarations (for example, `const helper = () => {}` instead of `function helper() {}`).
- Exception: in shadcn-derived code, keep upstream-friendly structure and style.
- Prefer destructuring for object/array field access when it improves clarity.
- Prefer destructuring in function parameters when values are used immediately (for example, `({ recentFiles }) => {}` instead of `(state) => { const { recentFiles } = state; }`).
- Prefer TypeScript inference over redundant annotations (for example, `const value = 123` instead of `const value: number = 123`, and `createStore(combine(...))` instead of `createStore<Type>(...)` when inference is sufficient).
- Add explicit TypeScript annotations only when inference is not sufficient or when defining a stable exported/public API surface.
- Use `for...of` loops instead of `forEach` for better performance and readability.
- Avoid one-character variable names (`a`, `b`, `x`, `d`) unless they are conventional loop indices in very small scopes.
- Use descriptive names that clearly indicate purpose (for example, `record`, `recordId`, `fileData`).
- Exception: shadcn-derived code can keep upstream short names (for example event params like `e`) when preserving component parity.
- DO NOT use the non-null assertion operator (`!`) in TypeScript; instead, use proper type guards, optional chaining, or refactor to handle null/undefined cases explicitly.

### Component Development

- Use shadcn CLI for installing shadcn components (for example: `npx shadcn@latest add button`).

### Astro Patterns

- Keep the app static and client-side only.
- Do not add API routes, Astro Actions, server endpoints, or other server runtime boundaries.

### Clarification

- If any requirement, constraint, or expected outcome is unclear, ask the user clarifying questions until the task is fully clear before implementation.
- Prefer the ask/question tool for clarifications when it is available.
- Start with the simplest primitive solution that satisfies the explicit request.
- Before adding extra complexity, ask follow-up questions such as: "Do we need to handle old browsers?", "Do we need to migrate this data?", and "Do we need to set up cache here?"
- Do not add overengineering or unrequested scope without explicit user confirmation.

### Maintenance

- After changes, update [tests](__tests__/), [docs](docs/) and [AGENTS.md](AGENTS.md) when needed to keep behavior and documentation aligned.

### Testing Style

- Prefer nested test suites grouped by module and method.
- Repository tests should use this shape:
  - `describe('something.repo', () => { describe('getRecords', () => { it('something', () => {}) }) })`
- Keep each `it(...)` focused on one behavior.

## Security and Privacy Baseline

- Never log secrets (passwords, key file data, decrypted values, OAuth tokens).
- Never persist plaintext database unlock credentials (passwords, key-file bytes, decrypted values).
- Prefer least-privilege Drive scopes (`drive.file`).
- Persist only minimum metadata needed for reopen/sync.
