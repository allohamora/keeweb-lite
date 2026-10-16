---
name: one-by-one
description: Collect the context for a review, audit or gap analysis, then go through the findings one group at a time with the user - assess each, propose a change, and wait for a decision before fixing, skipping or changing it.
---

## What I do

- Collect the context first: read what the request points at and list all findings.
- Group findings that share the same idea. Never split a group.
- Show a short numbered index of the groups, each with a one-line summary.
- Go through the groups **one at a time**, never in bulk:
  1. Show the progress as current/total (e.g. `1/20`), the other locations the group covers, and my assessment. When the group is about code, show the current code.
  2. Propose a concrete change. When the group is about code, show the proposed code, or abstract code that describes the idea.
  3. Ask what to do: apply the change, decline with a reason, or something else. Wait for the user's decision - do not act without it.
  4. Apply only the chosen option, then propose the commit with its message.
  5. Once the commit is approved and pushed, show the next group right away.
- Always show a group in full (steps 1-3), also when it is the next one or is brought up again. Never just its title or a "still waiting" line.
- After the last group, show a short summary with the outcome of each group.
- A decision applies to its group only, not to any other group.
