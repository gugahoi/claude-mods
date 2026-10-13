import type { EngineInterface, Register } from 'claude-code'

export type Item = { kind: 'pr' | 'issue'; number: number; title: string; state: string }

const TTL_MS = 60_000
const cache = new Map<string, { at: number; items: Promise<Item[]> }>()

async function list($: EngineInterface, cwd: string, kind: Item['kind'], state: string): Promise<Item[]> {
  const gh = await $.process.run(
    ['gh', kind, 'list', '--state', state, '--limit', '100', '--json', 'number,title,state'],
    { cwd },
  )
  // non-zero on its own, e.g. a repo with issues turned off: the other kind still shows
  return gh.exitCode === 0 ? JSON.parse(gh.stdout).map((i: Omit<Item, 'kind'>) => ({ ...i, kind })) : []
}

export async function load($: EngineInterface, cwd: string): Promise<Item[]> {
  const git = await $.process.run(['git', 'rev-parse', '--is-inside-work-tree'], { cwd })
  if (git.exitCode !== 0) return []
  const [prs, issues] = await Promise.all([list($, cwd, 'pr', 'all'), list($, cwd, 'issue', 'open')])
  return [...prs, ...issues].sort((a, b) => b.number - a.number)
}

async function items($: EngineInterface): Promise<Item[]> {
  const cwd = await $.session.cwd()
  const hit = cache.get(cwd)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.items
  const fresh = load($, cwd).catch(() => {
    cache.delete(cwd) // gh missing or the call was cut short: retry on the next keystroke
    return []
  })
  cache.set(cwd, { at: Date.now(), items: fresh })
  return fresh
}

// `pr` or `issue` alone, or followed by `:` and a query, narrows to that kind
export const match = (list: readonly Item[], query: string) => {
  const [, kind, rest = query] = /^(pr|issue)(?::|$)(.*)/i.exec(query) ?? []
  const q = rest.toLowerCase()
  return list
    .filter(i => !kind || i.kind === kind.toLowerCase())
    .filter(i => String(i.number).startsWith(q) || i.title.toLowerCase().includes(q))
    .slice(0, 10)
}

export const register: Register = on => {
  on('prompt.autocomplete', { token: /^#/ }, async ($, e, next) => {
    const [list, below] = await Promise.all([items($), next(e)])
    const mine = match(list, e.token.slice(1)).map(i => ({
      text: `#${i.number}`,
      description: `${i.kind === 'pr' ? `PR ${i.state.toLowerCase()}` : 'issue'} · ${i.title}`,
    }))
    return { suggestions: [...below.suggestions, ...mine] }
  })
}
