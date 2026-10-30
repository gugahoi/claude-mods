import { expect, test } from 'claude-code/testing'

import { extract } from './register'

const REPLY = [
  'Run `! gh issue edit 1 --add-label bug` then `! gh pr view 2`.',
  '```bash',
  '! git push',
  '```',
  'Again: `! gh pr view 2`. Not `!e.agentId`.',
  '```',
  '! cat <<EOF > notes.md',
  'hello',
  'EOF',
  '```',
].join('\n')

const COMMANDS = ['gh issue edit 1 --add-label bug', 'gh pr view 2', 'git push']

const BAND = {
  plugin: 'bang-picker',
  component: 'AbovePrompt',
  surface: 'terminal',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('extract finds inline and single-line fenced commands, once each', () => {
  expect(extract(REPLY)).toEqual(COMMANDS)
  expect(extract('No commands here.')).toEqual([])
})

test('a reply lists its commands, and a digit suggests one',async ($, on) => {
  const suggested: string[] = []
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('prompt.suggest', (_, e) => {
    suggested.push(e.text)

    return { isShown: true }
  })
  // Stands for the engine's own band, drawn when the mod passes.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  await $.turn.complete({
    answer: REPLY,
    durationMs: 1,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })

  const ui = await $.ui.mount(BAND)
  const buttons = await ui.findAll({ type: 'Button' })
  expect(buttons.map(b => b.props.hotkey)).toEqual(['1', '2', '3'])
  expect(buttons.map(b => b.text)).toEqual(COMMANDS)

  await ui.press({ key: '2' })
  expect(suggested).toEqual(['!gh pr view 2'])
  await ui.unmount()

  const working = await $.ui.mount({ ...BAND, props: { ...BAND.props, isWorking: true } })
  expect(await working.findAll({ type: 'Button' })).toHaveLength(0)
  expect((await working.find({ type: 'Text' }))?.text).toBe('engine')
  await working.unmount()
})

const PANE = {
  plugin: 'bang-picker',
  component: 'Pane',
  requestId: 'bang',
  surface: 'terminal',
  props: {
    title: 'Run a suggested command',
    isFocused: true,
    bodyColumns: 80,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const BANG = {
  command: 'bang',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 },
} as const

test('/bang opens a dialog, and a digit suggests a command and closes it', async ($, on) => {
  const suggested: string[] = []
  const opened: string[] = []
  const closed: string[] = []
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('ui.open', (_, e) => (opened.push(e.id), { value: { isPlaced: true } }))
  on('ui.close', (_, e) => (closed.push(e.id), { value: undefined }))
  on('prompt.suggest', (_, e) => (suggested.push(e.text), { isShown: true }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect((await $.command.run(BANG)).text).toBe('No ! commands in the last reply.')
  expect(opened).toEqual([])

  await $.turn.complete({
    answer: REPLY,
    durationMs: 1,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await $.command.run(BANG)
  expect(opened).toEqual(['bang'])

  const ui = await $.ui.mount(PANE)
  const buttons = await ui.findAll({ type: 'Button' })
  expect(buttons.map(b => b.text)).toEqual(COMMANDS)

  await ui.press({ key: '3' })
  expect(suggested).toEqual(['!git push'])
  expect(closed).toEqual(['bang'])
  await ui.unmount()
})
