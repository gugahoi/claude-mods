import type { EngineInterface, Register } from 'claude-code'

export type PR = { number: number; title: string; state: string }

const TTL_MS = 60_000
const cache = new Map<string, { at: number; prs: Promise<PR[]> }>()

export async function load($: EngineInterface, cwd: string): Promise<PR[]> {
  const git = await $.process.run(['git', 'rev-parse', '--is-inside-work-tree'], { cwd })
  if (git.exitCode !== 0) return []
  const gh = await $.process.run(
    ['gh', 'pr', 'list', '--state', 'all', '--limit', '100', '--json', 'number,title,state'],
    { cwd },
  )
  return gh.exitCode === 0 ? JSON.parse(gh.stdout) : []
}

async function prs($: EngineInterface): Promise<PR[]> {
  const cwd = await $.session.cwd()
  const hit = cache.get(cwd)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.prs
  const fresh = load($, cwd).catch(() => {
    cache.delete(cwd) // gh missing or the call was cut short: retry on the next keystroke
    return []
  })
  cache.set(cwd, { at: Date.now(), prs: fresh })
  return fresh
}

export const match = (list: readonly PR[], query: string) => {
  const q = query.toLowerCase()
  return list
    .filter(p => String(p.number).startsWith(q) || p.title.toLowerCase().includes(q))
    .slice(0, 10)
}

export const register: Register = on => {
  on('prompt.autocomplete', { token: /^#/ }, async ($, e, next) => {
    const [list, below] = await Promise.all([prs($), next(e)])
    const mine = match(list, e.token.slice(1)).map(p => ({
      text: `#${p.number}`,
      description: `${p.state.toLowerCase()} · ${p.title}`,
    }))
    return { suggestions: [...below.suggestions, ...mine] }
  })
}
