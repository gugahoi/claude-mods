import type { EngineInterface } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import { load, match, type Item } from './register'

const ITEMS: Item[] = [
  { kind: 'pr', number: 7001, title: 'feat: report beta builds separately', state: 'OPEN' },
  { kind: 'issue', number: 6400, title: 'login fails on beta', state: 'OPEN' },
  { kind: 'pr', number: 6335, title: 'fix(app): let pull to refresh start on the home screen', state: 'MERGED' },
  { kind: 'issue', number: 6330, title: 'Login screen flickers in prod', state: 'OPEN' },
  { kind: 'pr', number: 6325, title: 'fix(app): stop the page snapping back', state: 'MERGED' },
]

const numbers = (query: string) => match(ITEMS, query).map(i => i.number)

test('filters by number prefix or title text', async () => {
  expect(numbers('63')).toEqual([6335, 6330, 6325])
  expect(numbers('BETA')).toEqual([7001, 6400])
  expect(numbers('').length).toBe(5)
})

test('pr and issue narrow to one kind, with an optional :query', async () => {
  expect(numbers('pr')).toEqual([7001, 6335, 6325])
  expect(numbers('ISSUE')).toEqual([6400, 6330])
  expect(numbers('issue:login')).toEqual([6400, 6330])
  expect(numbers('pr:63')).toEqual([6335, 6325])
  expect(numbers('pro')).toEqual([6330]) // not a keyword: title search, issues included
})

const fake = (out: Record<string, { exitCode: number; stdout: string }>) => {
  const ran: string[] = []
  const $ = {
    process: {
      run: async (argv: readonly string[]) => {
        ran.push(argv.slice(0, 2).join(' '))
        return out[argv.slice(0, 2).join(' ')] ?? { exitCode: 0, stdout: '' }
      },
    },
  } as unknown as EngineInterface
  return { $, ran }
}

test('outside a git repo, gh is never called', async () => {
  const { $, ran } = fake({ 'git rev-parse': { exitCode: 128, stdout: '' } })
  expect(await load($, '/tmp')).toEqual([])
  expect(ran).toEqual(['git rev-parse'])
})

test('mixes PRs and issues, newest number first', async () => {
  const { $ } = fake({
    'gh pr': { exitCode: 0, stdout: JSON.stringify([{ number: 9, title: 'a', state: 'MERGED' }, { number: 5, title: 'b', state: 'OPEN' }]) },
    'gh issue': { exitCode: 0, stdout: JSON.stringify([{ number: 7, title: 'c', state: 'OPEN' }]) },
  })
  expect((await load($, '/repo')).map(i => `${i.kind}#${i.number}`)).toEqual(['pr#9', 'issue#7', 'pr#5'])
})

test('issues failing (e.g. turned off) still shows PRs', async () => {
  const { $ } = fake({
    'gh pr': { exitCode: 0, stdout: JSON.stringify([{ number: 9, title: 'a', state: 'OPEN' }]) },
    'gh issue': { exitCode: 1, stdout: '' },
  })
  expect((await load($, '/repo')).map(i => i.number)).toEqual([9])
})
