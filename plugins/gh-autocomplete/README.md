# gh-autocomplete

A Claude Code mod that autocompletes GitHub pull requests and issues in the
prompt box. Type `#` inside a git repo and pick one from the typeahead; keep
typing to filter by number (`#63`) or title (`#beta`).

- `#pr` or `#issue` shows only that kind.
- `#pr:<query>` or `#issue:<query>` filters within it: `#issue:login`, `#pr:63`.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install gh-autocomplete --marketplace gugahoi/claude-mods
```

Answer `y` to add the marketplace, then pick a scope.

Needs the [GitHub CLI](https://cli.github.com) installed and signed in (`gh auth login`).

## How it works

- Outside a git repo it does nothing.
- Inside one it runs `gh pr list --state all --limit 100` and
  `gh issue list --state open --limit 100` side by side and caches the result
  for 60 seconds per directory, so the first `#` takes about a second. If one
  fails (say, issues are turned off) the other still shows.
- It suggests up to 10, newest number first, below Claude Code's own
  suggestions. Picking one writes `#<number>`.

## Develop

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```
