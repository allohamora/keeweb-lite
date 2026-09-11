# Instructions

- Don't read `.env`, `terraform/terraform.tfvars`, `helm/values.yaml`, or other files with secrets. If I need a value from one, ask the user first instead of reading it.
- Don't make code changes (edits, file writes) until the user explicitly asks for the change. Investigate and present findings/options first, and wait for confirmation before editing.
- Use Conventional Commits for commit messages: `type(scope): subject`.
  - Types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `style`, `perf`, `build`, `ci`, `revert`. Pick the type based on what actually changed.
  - Scope: only in a monorepo (multiple apps/packages, e.g. workspaces in package.json, or an apps/ or packages/ layout) — add a scope matching the exact app/package directory name, e.g. `fix(api): correct pagination offset`. Never invent a scope from anything else (e.g. a feature, skill, or file name). In a single-app repo, always skip the scope, e.g. `fix: correct pagination offset`.
  - Subject: lowercase, imperative mood, starts with a verb, no trailing period.
  - Body: optional, blank line after the subject. Add one when the _why_ isn't obvious from the subject alone, e.g. the reasoning behind a non-obvious change, a tradeoff, or context a reviewer would otherwise have to ask for. Skip it for small, self-explanatory changes.
  - Breaking changes: add a `!` before the colon (e.g. `feat!: subject`) and/or a `BREAKING CHANGE: <description>` footer explaining the break.
  - Add a `Co-Authored-By: <agent name> <agent email>` footer using the agent's own name and email, not the user's.
- Before every commit, show the proposed commit message and ask for confirmation (e.g. "Ready to commit as `<message>`. Go ahead?"). On a yes, commit and push in that same step - don't ask again separately for the push.
- Don't create git commits or push until the user explicitly asks for it.
- Use simple, concise language, e.g. answers, code, commit messages, PR descriptions, comments.
- Default to no comments. Write one only when it explains something the code can't on its own. Skip comments that just restate clear code, since those go stale fast.
- Before considering a change done, run the relevant checks for what you touched (e.g. typecheck, lint, tests, build), and fix any failures.
- When a change affects something documented elsewhere (e.g. `docs/`, `README.md`), update that documentation in the same change. Don't add documentation for things that didn't change.
- If you notice code changed since you last looked at it, in a way that no linter/formatter would produce (e.g. removed comments, edited logic, renamed vars), assume the user made a manual edit, and factor that into your next decisions accordingly.
