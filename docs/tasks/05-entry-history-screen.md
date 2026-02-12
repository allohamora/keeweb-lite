# Screen 05: Entry History

Goal: expose native KDBX entry history in the details pane and support safe version restore.

## Why This Screen Exists

History is core for accidental-edit recovery and must rely on native KDBX history, not custom snapshots.

## Source Docs

- [KDBX Entry History](../features/kdbx-entry-history.md)
- [Immediate Autosave](../features/immediate-autosave.md)

## Checklist

1. [ ] Add history section to entry details for the currently selected entry. Done when users can discover historical versions without leaving entry view.
2. [ ] Render native KDBX history revisions (timestamps and relevant field previews) directly from entry model. Done when no parallel snapshot store exists.
3. [ ] Add read-only inspect flow for a selected historical version before restore. Done when users can verify target revision content first.
4. [ ] Add explicit restore action with target-version confirmation. Done when restore intent is deliberate and reversible via normal history behavior.
5. [ ] Route restore mutations through normal edit path so immediate autosave and sync behavior remain consistent. Done when restore follows same persistence pipeline as manual edits.
6. [ ] Keep state consistent on restore/save failures and show actionable error feedback. Done when failed restore cannot silently corrupt current entry.
7. [ ] Add tests for history render, restore success, restore failure, and post-reopen persistence. Done when recovered values survive save/sync and reload.
