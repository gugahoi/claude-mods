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
