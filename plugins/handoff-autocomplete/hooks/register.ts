import type { EngineInterface, PromptAutocompleteSuggestion, Register } from 'claude-code'

let tmpdir: string | undefined // TMPDIR never changes for the life of the process

export const ago = (ms: number) => {
  const m = Math.floor(ms / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  return m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`
}

// First markdown heading, else the first non-empty line.
export const heading = (text: string) => {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  return (lines.find(l => l.startsWith('#')) ?? lines[0] ?? '').replace(/^#+\s*/, '')
}

// `query` is what follows `handoff` in the token, matched anywhere in the file name.
export async function handoffs($: EngineInterface, query: string): Promise<PromptAutocompleteSuggestion[]> {
  tmpdir ??= ((await $.env.get('TMPDIR')) ?? '/tmp').replace(/\/+$/, '')
  const dir = tmpdir
  const q = query.toLowerCase()
  const files = (await $.fs.list(dir))
    .filter(f => {
      const name = f.name.toLowerCase()
      return f.kind === 'file' && name.endsWith('.md') && name.includes('handoff') && name.includes(q)
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, 10)
  return Promise.all(
    files.map(async f => {
      const text = `${dir}/${f.name}`
      const title = heading(await $.fs.read(text).catch(() => ''))
      const age = ago(Date.now() - f.mtimeMs)
      return { text, label: f.name, description: title ? `${age} · ${title}` : age }
    }),
  )
}

export const register: Register = on => {
  on('prompt.autocomplete', { token: /^handoff/i }, async ($, e, next) => {
    const [mine, below] = await Promise.all([handoffs($, e.token.slice('handoff'.length)).catch(() => []), next(e)])
    return mine.length ? { suggestions: [...below.suggestions, ...mine] } : below
  })
}
