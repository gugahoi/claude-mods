import type { EngineInterface } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import { load, match } from './register'

const PRS = [
  { number: 6335, title: 'fix(app): let pull to refresh start on the home screen', state: 'MERGED' },
  { number: 6325, title: 'fix(app): stop the page snapping back', state: 'MERGED' },
  { number: 7001, title: 'feat: report beta builds separately', state: 'OPEN' },
]

test('filters by number prefix or title text', async () => {
  expect(match(PRS, '63').map(p => p.number)).toEqual([6335, 6325])
  expect(match(PRS, 'BETA').map(p => p.number)).toEqual([7001])
  expect(match(PRS, '').length).toBe(3)
})

test('outside a git repo, gh is never called', async () => {
  const ran: string[] = []
  const $ = {
    process: { run: async (argv: readonly string[]) => (ran.push(argv.join(" ")), { exitCode: 128, stdout: '' }) },
  } as unknown as EngineInterface
  expect(await load($, '/tmp')).toEqual([])
  expect(ran).toEqual(["git rev-parse --is-inside-work-tree"])
})
