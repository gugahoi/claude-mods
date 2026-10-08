# handoff-autocomplete

A Claude Code mod that autocompletes handoff plan files in the prompt box.
Type `handoff` after `/implement` (or anywhere in a prompt) and pick a recent
handoff file from the typeahead; it is replaced with the file's absolute path.
Keep typing to filter by file name (`handoff-learn`).

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install handoff-autocomplete --marketplace gugahoi/claude-mods
```

Answer `y` to add the marketplace, then pick a scope.

## How it works

- It lists `*handoff*.md` files in the OS temp directory (`$TMPDIR`, else
  `/tmp`), where the `/handoff` skill saves them.
- It suggests up to 10, newest first, below Claude Code's own suggestions,
  each with its age and first heading.
- Whatever follows `handoff` in the typed word must appear in the file name
  (case-insensitive): `handoff-learn` matches `handoff-learn-pull-to-refresh.md`.

## Develop

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```
