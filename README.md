# claude-mods

Mods for [Claude Code](https://claude.com/claude-code): plugins of function
hooks that change how the terminal behaves and looks.

| Mod | What it does |
| --- | --- |
| [gh-autocomplete](plugins/gh-autocomplete) | Type `#` in a git repo and pick a pull request or open issue from the typeahead, filtered by number or title; `#pr` / `#issue` narrow to one kind. |
| [pr-bar](plugins/pr-bar) | The current branch's PR (state, CI, unresolved threads) as a bar above the prompt or a `/pr` panel, with buttons to commit and open a draft PR, check review feedback or fix CI. |
| [handoff-autocomplete](plugins/handoff-autocomplete) | Type `handoff` and pick a recent `/handoff` plan file; the path is filled in for you. |
| [bang-picker](plugins/bang-picker) | The `!` commands Claude's last reply asks you to run, numbered above the prompt: press a number, Tab, Enter to run one in bash mode. |

## Install

At the prompt of a Claude Code terminal session, install the ones you want:

```
/plugin install gh-autocomplete --marketplace gugahoi/claude-mods
/plugin install pr-bar --marketplace gugahoi/claude-mods
/plugin install handoff-autocomplete --marketplace gugahoi/claude-mods
/plugin install bang-picker --marketplace gugahoi/claude-mods
```

The first one asks to add the marketplace: answer `y`, then pick a scope.
`gh-autocomplete` and `pr-bar` need the [GitHub CLI](https://cli.github.com)
installed and signed in (`gh auth login`).

## Develop

Each mod lives in `plugins/<name>`. From the repository root:

```
claude plugin validate .                 # the marketplace
claude plugin validate plugins/pr-bar    # one mod
claude plugin test plugins/pr-bar
claude --plugin-dir plugins/pr-bar       # try it without installing
```

Release a mod by bumping `version` in its `plugin.json`, then
`claude plugin tag plugins/<name>` to tag it `<name>--v<version>`.

## License

MIT
