# Screen 06: Password Generator

Goal: provide KeeWeb-like password generation in unlock and entry-editing contexts with safe apply/copy flows.

## Why This Screen Exists

Password generation is a high-frequency user flow and must be usable before unlock and during entry editing.

## Source Docs

- [Password Generator](../features/password-generator.md)
- [Interface](../features/interface.md)
- [KDBX Entry History](../features/kdbx-entry-history.md)
- [Immediate Autosave](../features/immediate-autosave.md)

## Checklist

1. [ ] Add generator entry points on Unlock screen and workspace entry editor. Done when users can open generator in both contexts.
2. [ ] Build generator panel/modal with keyboard dismiss (`Esc`) and focused interaction flow. Done when generator can be opened/closed without breaking active context.
3. [ ] Implement controls for length, uppercase, lowercase, numbers, and symbols. Done when generated output changes according to selected options.
4. [ ] Keep action semantics explicit: `Generate` creates candidate only, `Apply` mutates entry password. Done when generation does not alter entry until confirm.
5. [ ] Add generated value reveal/hide and clipboard copy action with clear user feedback. Done when copy failures are surfaced and recoverable.
6. [ ] Route `Apply` through standard entry-edit path so immediate autosave executes normally. Done when apply triggers save pipeline and status updates.
7. [ ] Verify password apply creates native KDBX history revision for rollback. Done when restored history includes pre-apply value.
8. [ ] Keep generated plaintext in runtime memory only and never persist in localStorage or IndexedDB. Done when persistence layers contain no generator output.
9. [ ] Add integration tests for unlock-context generator, entry apply path, history creation, and copy/apply failure handling. Done when both contexts are covered end-to-end.
