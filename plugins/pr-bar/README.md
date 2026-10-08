# pr-bar

A Claude Code mod that shows the GitHub pull request for the session's current
git branch in a bar above the prompt box, with its actions as buttons under it.

```
 PR #128 · draft   ✗ 1 failed   2 unresolved  changes requested  feat(app): let pull…
[ Check feedback ] [ Fix CI ]
> _
```

The bar is a full-width grey row; the PR state and CI result are coloured pills on it: draft grey, open green, merged
purple, closed red; CI green, amber while pending, red on a failure. The title
links to the PR and is cut to fit the row.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install pr-bar --marketplace gugahoi/claude-mods
```

Answer `y` to add the marketplace, then pick a scope.

Needs the [GitHub CLI](https://cli.github.com) installed and signed in (`gh auth login`).

## What it shows

- **No PR for the branch:** the branch name and a **Commit + draft PR** button.
- **A PR:** its number (a link) and title, draft / open / merged / closed, a CI
  summary (`✓ passed`, `✗ N failed`, `… N pending`), the review decision, and
  how many review threads are unresolved.
- **Nothing** outside a git repo, on a detached HEAD, on `master`/`main`, or
  when `gh` is missing or failing.

The buttons show only when they apply, and each submits a prompt:

| Button | When | Prompt |
| --- | --- | --- |
| Commit + draft PR (`c`) | no PR yet, or uncommitted changes | Commit the changes, push, and open a draft PR |
| Check feedback (`f`) | open PR with unresolved threads | I've received feedback on PR #n. Check each unresolved review comment: is it correct and do we need to fix it? |
| Fix CI (`x`) | open PR with a failed check | CI is failing on PR #n. Find out why and fix it. |

Click a button, or focus the band (ctrl+x tab) and press its letter: `c`,
`f` or `x`. The bar steps aside while a survey uses the band.

## The panel: `/pr`

`/pr` opens the same PR in a panel, docked beside the transcript in fullscreen
or above the prompt otherwise, with room for the detail the bar leaves out:

```
 PR #128 · draft   ✗ 1 failed   2 unresolved
feat(app): let pull to refresh start on the home screen on iOS and Android
feat/pull-to-refresh · changes requested

Checks
✗ App / test
… App / deploy
✓ 14 passed

Unresolved threads (2)
src/feed/useVideoPreloader.ts:134 @reviewer
  Should this guard against a missing ref?

[ Check feedback ] [ Fix CI ]
```

Every check and thread is a link to it on GitHub. The buttons are the bar's.
`/pr` opens the panel with the keyboard, so `c`, `f` and `x` press them at once
(unless you have text in the prompt); Esc hands the keyboard back to the prompt,
ctrl+x tab returns to the panel, and ctrl+x x closes it.

## Choose a layout

The `layout` setting picks where the PR shows:

- `bar` (default): the bar above the prompt. `/pr` opens the panel when you want the detail.
- `panel`: no bar. The panel opens by itself when a session starts on a branch
  with something to show, and `/pr` reopens it after you close it.

Change it in `/config` (the pr-bar **Layout** row); the mod reloads with the new
layout. `/plugin install` also asks for it.

## How it refreshes

It runs `git rev-parse`, `git status --porcelain`, `gh pr view --json ...` and
one `gh api graphql` query for the review threads when the session starts,
after each turn (Claude may have pushed or switched branch), and every 60
seconds so CI results arrive while the session is idle. One fetch runs at a
time.

## Develop

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```
