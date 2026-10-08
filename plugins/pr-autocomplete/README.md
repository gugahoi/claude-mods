# pr-autocomplete

A Claude Code mod that autocompletes GitHub pull requests in the prompt box.
Type `#` inside a git repo and pick a PR from the typeahead; keep typing to
filter by number (`#63`) or title (`#beta`).

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install pr-autocomplete --marketplace gugahoi/claude-mods
```

Answer `y` to add the marketplace, then pick a scope.

Needs the [GitHub CLI](https://cli.github.com) installed and signed in (`gh auth login`).

## How it works

- Outside a git repo it does nothing.
- Inside one it runs `gh pr list --state all --limit 100` and caches the result
  for 60 seconds per directory, so the first `#` takes about a second.
- It suggests up to 10 PRs, below Claude Code's own suggestions.

## Develop

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```
