import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Commands } from '../types'

const PANE = 'bang'

const commands = atom({ plugin: 'bang-picker', key: 'commands' } as const, [] as Commands)

// A fenced block, or an inline `! cmd` span. The inline form needs a space
// after the `!` so code like `!e.agentId` is not taken for a command.
const PATTERN = /```[^\n]*\n([\s\S]*?)```|`!\s+([^`\n]+)`/g

// The `! …` commands a reply suggests, in order, deduplicated, one per digit.
// A fence counts only when its body is a single `!` line: a longer one is
// likely a heredoc, and its first line alone would be the wrong command.
export const extract = (text: string): Commands => {
  const found = [...text.matchAll(PATTERN)].flatMap(([, fence, inline]) => {
    const lines = (fence ?? '').split('\n').filter(line => line.trim())
    const cmd =
      inline ?? (lines.length === 1 ? /^\s*!\s*(.+)$/.exec(lines[0] ?? '')?.[1] : undefined)

    return cmd?.trim() ? [cmd.trim()] : []
  })

  return [...new Set(found)].slice(0, 9)
}

// A fill lands as prose; a suggestion taken with Tab may switch to bash mode.
const pick = ($: EngineInterface, cmd: string) => $.prompt.suggest({ text: `!${cmd}` })

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'bang',
      description: "Pick a ! command from Claude's last reply",
    })

    return next(e)
  })

  on('command.run', { command: 'bang' }, async $ => {
    const found = await read($, commands)

    if (found.length === 0) {
      return { text: 'No ! commands in the last reply.' }
    }

    await $.ui.open({
      id: PANE,
      title: 'Run a suggested command',
      focus: true,
      closeOnEscape: true,
      rows: found.length + 1,
    })

    return {}
  })

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) {
      const found = extract(e.answer)
      await update($, commands, () => found)
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const found = await read($, commands)
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {found.map((cmd, i) => (
          <Button
            key={String(i + 1)}
            hotkey={String(i + 1)}
            plain
            onPress={async () => {
              await pick($, cmd)
              await $.ui.close({ id: PANE })
            }}
          >
            <Text>{cmd}</Text>
          </Button>
        ))}
        <Text dimColor>Then Tab, Enter to run it. Esc closes.</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const found = await read($, commands)

    if (e.props.hasSurvey || e.props.isWorking || found.length === 0) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Text dimColor>Run a suggested command:</Text>
        {found.map((cmd, i) => (
          <Button
            key={String(i + 1)}
            hotkey={String(i + 1)}
            plain
            onPress={() => pick($, cmd)}
          >
            <Text wrap="truncate-end">{cmd}</Text>
          </Button>
        ))}
      </Box>
    )
  })
}
