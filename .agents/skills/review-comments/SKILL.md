---
name: review-comments
description: Walk through PR review comments one at a time with the author - assess each, propose a change, and wait for a decision before replying and resolving.
---

## What I do

- Read all open review comment threads on the current PR.
- Go through the threads **one at a time**, never in bulk:
  1. Show a link to the thread, the comment, and my assessment: is this a real/valid issue, or not?
  2. If valid, propose a concrete change. If not, explain why I think it doesn't apply.
  3. Ask the author what to do: apply the change, decline with a reason, or something else.
  4. Wait for the author's decision - do not act without it.
  5. If applying a change: make the code change, then show the proposed commit message and ask for confirmation before committing - wait for a yes, then commit, push, and reply to the thread with the commit link.
  6. If declined: no code change or commit - just reply to the thread with the reason.
  7. Once the reply is posted, resolve the thread if the "Who can resolve" rules below allow it.
  8. Only then move on to the next comment.
- A decision the author gives for one thread only applies to that thread, not to any other thread (except the grouping case below).
- Exception: if several threads point to the same underlying issue (e.g. the same outdated GitHub Action version in 20 workflow files), I treat them as one - one assessment, one proposed change, one decision from the author. That decision then applies to all of them: one commit if it covers them all, but each thread still gets its own reply, and is resolved per the "Who can resolve" rules below.
- This is only for currently open/unresolved threads. Reviewers add new comments after re-reviewing, so this skill is meant to be run again on later review passes - it just picks up whatever is unresolved at that point.

## Who can resolve

- **Bot-authored threads** (e.g. `copilot-pull-request-reviewer`, other automated reviewers): once replied to and the author confirms it's settled, I resolve the thread myself.
- **Human-authored threads** (a real reviewer's login): I only review and reply - I do not call `resolveReviewThread` on these. Resolving is the human reviewer's call, not something to automate on their behalf.

## Reply formats

Fixed with a commit:

```text
<commit-url>
```

e.g. `https://github.com/<owner>/<repo>/commit/<sha>`

Declined with a reason:

```text
<Reason why this is not needed.>
```

e.g. `We don't use forks in this repository, so this doesn't apply here.`

## How to reply to a comment

```bash
gh api repos/<owner>/<repo>/pulls/<pr>/comments/<comment-id>/replies \
  -X POST \
  -f body="https://github.com/<owner>/<repo>/commit/<sha>"
```

## How to get threads and comments

```bash
gh api graphql -f query='{
  repository(owner: "<owner>", name: "<repo>") {
    pullRequest(number: <pr>) {
      reviewThreads(first: 10) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          path
          line
          comments(first: 10) {
            pageInfo { hasNextPage endCursor }
            nodes {
              url
              body
              author { login }
            }
          }
        }
      }
    }
  }
}'
```

## How to resolve a thread

```bash
gh api graphql -f query='mutation {
  resolveReviewThread(input: {threadId: "<thread-node-id>"}) {
    thread { isResolved }
  }
}'
```
