import type { EngineInterface, On, PluginOptions, PromptAutocompleteResult } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import { ago, handoffs, heading, register } from './register'

const HOUR = 3_600_000
const now = Date.now()
const FILES = [
  { name: 'video-preloader-handoff.md', kind: 'file', mtimeMs: now - 50 * HOUR },
  { name: 'handoff-learn-pull-to-refresh.md', kind: 'file', mtimeMs: now - 2 * HOUR },
  { name: 'Handoff-Learn-Video-Transition.md', kind: 'file', mtimeMs: now - 3 * HOUR },
  { name: 'notes.md', kind: 'file', mtimeMs: now },
  { name: 'handoff.txt', kind: 'file', mtimeMs: now },
  { name: 'handoff-old.md', kind: 'dir', mtimeMs: 0 },
]
const TEXT: Record<string, string> = {
  '/T/handoff-learn-pull-to-refresh.md': '\n# Handoff: pull to refresh\n\nbody',
  '/T/video-preloader-handoff.md': 'Video preloader notes\n## Later heading',
}

// The kit's `$` has no fs and cannot raise prompt.autocomplete, so stub the two nouns the mod uses.
const stub = (list: () => Promise<unknown[]>) =>
  ({
    env: { get: async () => '/T/' },
    fs: { list, read: async (p: string) => TEXT[p] ?? Promise.reject(new Error('ENOENT')) },
  }) as unknown as EngineInterface

type Hook = (
  $: EngineInterface,
  e: { text: string; cursor: number; token: string; start: number },
  next: () => Promise<PromptAutocompleteResult>,
) => Promise<PromptAutocompleteResult>

// Capture the registered hook with a fake `on`, then drive it directly.
const registered: { event: string; matcher: { token: RegExp }; hook: Hook }[] = []
register(
  ((event: string, matcher: { token: RegExp }, hook: Hook) => {
    registered.push({ event, matcher, hook })
    return { catch: () => undefined }
  }) as unknown as On,
  {} as PluginOptions,
)

test('time ago', async () => {
  expect(ago(30_000)).toBe('just now')
  expect(ago(5 * 60_000)).toBe('5m ago')
  expect(ago(2 * HOUR)).toBe('2h ago')
  expect(ago(50 * HOUR)).toBe('2d ago')
})

test('first heading, else first non-empty line', async () => {
  expect(heading('intro\n\n## Title  \nbody')).toBe('Title')
  expect(heading('\n  just text\nmore')).toBe('just text')
  expect(heading('')).toBe('')
})

test('lists handoff markdown files newest first, filtered by name', async () => {
  const $ = stub(async () => FILES)
  const all = await handoffs($, '')
  expect(all.map(s => s.label)).toEqual([
    'handoff-learn-pull-to-refresh.md',
    'Handoff-Learn-Video-Transition.md',
    'video-preloader-handoff.md',
  ])
  expect(all[0]).toEqual({
    text: '/T/handoff-learn-pull-to-refresh.md',
    label: 'handoff-learn-pull-to-refresh.md',
    description: '2h ago · Handoff: pull to refresh',
  })
  expect(all[1]?.description).toBe('3h ago') // unreadable file: age only
  expect(all[2]?.description).toBe('2d ago · Later heading')
  expect((await handoffs($, '-LEARN')).map(s => s.label)).toEqual([
    'handoff-learn-pull-to-refresh.md',
    'Handoff-Learn-Video-Transition.md',
  ])
  expect((await handoffs($, 'video')).length).toBe(2)
})

test('caps at 10', async () => {
  const many = Array.from({ length: 15 }, (_, i) => ({ name: `handoff-${i}.md`, kind: 'file', mtimeMs: now - i }))
  expect((await handoffs(stub(async () => many), '')).length).toBe(10)
})

test('hook adds rows after the engine, or returns its result unchanged', async () => {
  expect(registered.map(r => r.event)).toEqual(['prompt.autocomplete'])
  const { matcher, hook } = registered[0]!
  expect(matcher.token.test('Handoff-learn')).toBe(true)
  expect(matcher.token.test('/tmp/handoff')).toBe(false)

  const engine: PromptAutocompleteResult = { suggestions: [{ text: '/handoff' }] }
  const e = { text: '/implement handoff-learn', cursor: 24, token: 'handoff-learn', start: 11 }
  const ok = await hook(stub(async () => FILES), e, async () => engine)
  expect(ok.suggestions.map(s => s.text)).toEqual([
    '/handoff',
    '/T/handoff-learn-pull-to-refresh.md',
    '/T/Handoff-Learn-Video-Transition.md',
  ])

  const broken = stub(async () => Promise.reject(new Error('EACCES')))
  expect(await hook(broken, e, async () => engine)).toBe(engine)
})
