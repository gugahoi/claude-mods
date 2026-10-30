# bang-picker

A Claude Code mod that saves copy-pasting the `!` commands Claude asks you to
run yourself. When a reply suggests commands such as `` `! gh issue edit …` ``,
they are listed, numbered, in a band above the prompt.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install bang-picker --marketplace gugahoi/claude-mods
```

Answer `y` to add the marketplace, then pick a scope.

## How it works

- In an empty prompt, press a command's number: it shows as the prompt's dim
  suggestion. Press Tab to take it (the box switches to bash mode), then Enter
  to run it. Nothing runs until you press Enter.
- It picks up inline `` `! cmd` `` spans (a space after `!`, so code like
  `` `!e.agentId` `` is left alone) and fenced blocks holding a single `! cmd`
  line; longer fenced blocks, such as heredocs, are skipped.
- Up to 9 commands, deduplicated, from the main conversation's latest reply;
  the list is replaced every turn and hidden while Claude is working.
- `/bang` opens the same list as a dialog, with long commands shown whole:
  press a number to put it in the prompt, then Tab, Enter. Esc closes it.
- ctrl+x tab focuses the band, ctrl+x ctrl+a collapses it.

## Develop

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```
