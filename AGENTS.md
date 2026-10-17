# General

- Don't read `.env`, `terraform/terraform.tfvars`, `helm/values.yaml`, or other files with secrets. Ask the user for a value instead.
- Don't edit or write files until the user explicitly asks. Investigate and present findings or options first, and wait for confirmation.
- In non-interactive environments (e.g. cloud sessions, CI, headless runs), don't wait for user approval: treat the task as the request to edit, commit and push, and skip the confirmation steps.
- Use simple, concise language in answers, code, commit messages, PR descriptions and comments.
- Run the relevant checks (typecheck, lint, format, tests, build) once the requested change is complete, not after each file or small edit. Fix any failures.
- Parallel subagents must not block or interfere with each other: split work so they never touch the same files or shared resources, and run checks that use shared resources once from the main session (e.g. tests that share one database would block each other and waste time if run in parallel).
- If code changed since you last looked at it in a way no linter/formatter would produce (removed comments, edited logic, renamed vars), assume the user edited it manually and factor that in.
- Treat staged changes you didn't stage yourself as the user's work: don't unstage, revert or change them.

# Commits

- Commit only when the user asks. Before committing, show the full proposed message (subject, body and footer) and ask for confirmation, e.g. "Ready to commit as:", then the message with each line (subject, body, footer) in inline code without labels, then "Go ahead and commit and push?". A yes covers commit and push in that same step.
- Use Conventional Commits for commit messages: `type(scope): subject`.
  - Use one of these types, picked by the commit's main purpose. Supporting work (refactors, tests, docs, etc.) stays in the same commit, e.g. a new feature with refactors and tests is `feat`. Unrelated changes get their own commit.
    - `feat`: new app behavior.
    - `fix`: app bug fix.
    - `perf`: app performance improvement.
    - `refactor`: app code restructuring with no behavior change.
    - `style`: app code formatting only.
    - `ci`: any infrastructure or CI/CD change (`.github/workflows`, `helm/`, `terraform/`, etc.).
    - `build`: build system or dependencies.
    - `test`: tests only.
    - `docs`: docs only.
    - `chore`: anything else, e.g. repo tooling and config.
    - `revert`: reverts a previous commit.
  - Scope: only in a monorepo, and only when the change touches exactly one workspace package. Use its directory name, read from the repo's workspace config, never guessed. Otherwise no scope.
  - Subject: lowercase, imperative mood, starts with a verb, no trailing period.
  - Body: optional, blank line after the subject. Add one only when the _why_ isn't obvious from the subject.
  - Breaking changes: `!` before the colon and/or a `BREAKING CHANGE: <description>` footer.
  - Footer: `Co-Authored-By: <agent name> <agent email>`, the agent's own, not the user's.
  - Keep every line of the message (header, body and footer) within 100 characters.

# Code

- Follow the rule of three: don't extract a helper, constant or abstraction until the third repetition, unless asked. Don't add one to wrap a trivial expression.
- Take at most 4 parameters, and at most 2 of the same type (e.g. `string, string, string` ids are easy to swap). Past that, take one object.
- Group code by feature, not by type: keep what belongs to a feature together, even when other features use it. Only generic code that belongs to no single feature goes in shared locations.
- Don't silence type errors with shortcuts like `any`, `as` casts, `@ts-ignore` or `!`. Fix the types first (e.g. with a type guard). Use a shortcut only when the types can't express it. `as const` is fine: it narrows a type and doesn't silence an error.
- Prefer immutable code where possible: derive new values instead of mutating or reassigning existing ones. Mutate only when there is no clearer way.
- Default to no comments. Write one only if names, types and structure don't already answer the question and skipping it risks a real mistake. A comment copied from elsewhere (a reference file, a plan, another agent's output) must pass the same test.
- If a change affects something that has docs (e.g. `docs/`, `README.md`) or code comments, update them in the same change. If it has none, don't create any.

# Tests

- Test each behavior once, at the highest layer that reaches it (e2e over integration over unit). Add a lower-layer test only for logic the higher layers can't reach. A test must fail when our code breaks: don't write ones that only restate the code or mock the thing under test. The goal is to test our real code, not mocks: prefer real dependencies, and mock where the real one isn't worth using (e.g. real HTTP requests to third parties, etc.).
- When a change merges duplicated code into a shared one, merge the duplicated tests in the same change: test the shared behavior once and keep only the per-caller cases (e.g. its own ids or ordering) in each caller's tests.
- Group tests in one top-level `describe` named after the file's subject, with a nested `describe` per method, endpoint or behavior group, and no deeper.
- Tests must not leak side effects into other tests or work around other tests' leftovers (e.g. skipping earlier events): fix the leak instead. Clear globally what can be cleared (e.g. the database). A test handles the rest itself (e.g. realtime events) and undoes only what it changed, not with blanket helpers like `vi.restoreAllMocks()` or `vi.unstubAllEnvs()`, etc.
- Write clear, explicit tests that read top to bottom, with setup, action and assertion visible in the test. Avoid hidden state and indirection: shared mutable variables, setup spread across hooks, nested callbacks, results observed through side effects and hand-repeated boilerplate. Prefer fixtures, return values and the framework's built-in tools, and use state only when there is no other way.
