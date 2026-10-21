import { atom, read, update } from 'claude-code'
import type { ElementTable, EngineInterface, Register } from 'claude-code'

import type { PrBarCheck, PrBarChecks, PrBarPr, PrBarSnapshot, PrBarThread } from '../types'

const snapshot = atom({ plugin: 'pr-bar', key: 'snapshot' } as const, null)
// The PR whose feedback Claude has checked: its threads can now be committed and resolved.
const feedbackChecked = atom({ plugin: 'pr-bar', key: 'feedbackChecked' } as const, null)
const PANE = 'pr'

const FIELDS = 'number,title,state,isDraft,url,statusCheckRollup,reviewDecision'
// ponytail: first 100 threads only; paginate if a PR ever has more
const THREADS =
  'query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$number){reviewThreads(first:100){nodes{isResolved path line comments(first:1){nodes{author{login} body url}}}}}}}'

// The buckets `gh pr checks` uses. A CheckRun carries `conclusion` ('' while it runs), a StatusContext `state`.
const FAILED = ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE']
const PASSED = ['SUCCESS', 'NEUTRAL', 'SKIPPED']
const ORDER = { failed: 0, pending: 1, passed: 2 } as const

type GhCheck = {
  conclusion?: string
  state?: string
  name?: string
  workflowName?: string
  context?: string
  detailsUrl?: string
  targetUrl?: string
}
type GhView = {
  number: number
  title: string
  url: string
  state: 'OPEN' | 'MERGED' | 'CLOSED'
  isDraft: boolean
  reviewDecision: string
  statusCheckRollup: GhCheck[]
}
type GhThread = {
  isResolved: boolean
  path: string
  line: number | null
  comments: { nodes: { author: { login: string } | null; body: string; url: string }[] }
}

const bucket = (c: GhCheck): keyof PrBarChecks => {
  const s = c.conclusion || c.state || ''
  return FAILED.includes(s) ? 'failed' : PASSED.includes(s) ? 'passed' : 'pending'
}

export function summarise(rollup: readonly GhCheck[]): PrBarChecks {
  const sum = { passed: 0, failed: 0, pending: 0 }
  for (const c of rollup) sum[bucket(c)] += 1
  return sum
}

export const ci = ({ passed, failed, pending }: PrBarChecks) =>
  failed ? `✗ ${failed} failed` : pending ? `… ${pending} pending` : passed ? '✓ passed' : 'no checks'

const STATE_BG = { draft: 'inactive', open: 'success', merged: 'merged', closed: 'error' } as const
const ciBg = ({ passed, failed, pending }: PrBarChecks) =>
  failed ? 'error' : pending ? 'warning' : passed ? 'success' : 'inactive'

export function buttons({ pr }: PrBarSnapshot, checked: number | null = null) {
  const out: { key: string; label: string; hotkey: string; prompt: string }[] = []
  const isLive = pr?.state === 'draft' || pr?.state === 'open'
  if (!pr)
    out.push({ key: 'commit', label: 'Commit + draft PR', hotkey: 'c', prompt: 'Commit the changes, push, and open a draft PR' })
  if (pr && isLive && pr.threads.length > 0)
    out.push({
      key: 'feedback',
      label: 'Check feedback',
      hotkey: 'f',
      prompt: `I've received feedback on PR #${pr.number}. Check each unresolved review comment: is it correct and do we need to fix it?`,
    })
  if (pr && isLive && pr.threads.length > 0 && checked === pr.number)
    out.push({
      key: 'resolve',
      label: 'Commit + resolve',
      hotkey: 'r',
      prompt: `Commit the changes and push, then reply to and resolve each review thread on PR #${pr.number} we've addressed.`,
    })
  if (pr && isLive && pr.checks.failed > 0)
    out.push({ key: 'ci', label: 'Fix CI', hotkey: 'x', prompt: `CI is failing on PR #${pr.number}. Find out why and fix it.` })
  return out
}

export async function load($: EngineInterface): Promise<PrBarSnapshot | null> {
  const head = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'])
  const branch = head.stdout.trim()
  // ponytail: default branch by name, and gh is skipped there (no PR is ever opened from it)
  if (head.exitCode !== 0 || ['HEAD', 'master', 'main'].includes(branch)) return null
  const view = await $.process.run(['gh', 'pr', 'view', '--json', FIELDS])
  if (view.exitCode !== 0) return /no pull requests found/i.test(view.stderr) ? { branch, pr: null } : null
  const pr: GhView = JSON.parse(view.stdout)
  const threads = await $.process.run([
    'gh', 'api', 'graphql',
    '-F', 'owner={owner}', '-F', 'repo={repo}', '-F', `number=${pr.number}`, '-f', `query=${THREADS}`,
  ])
  if (threads.exitCode !== 0) return null
  const nodes: GhThread[] = JSON.parse(threads.stdout).data.repository.pullRequest.reviewThreads.nodes
  const checkRuns: PrBarCheck[] = pr.statusCheckRollup
    .map(c => ({
      name: c.workflowName ? `${c.workflowName} / ${c.name}` : (c.name ?? c.context ?? 'check'),
      result: bucket(c),
      url: c.detailsUrl ?? c.targetUrl ?? pr.url,
    }))
    .sort((a, b) => ORDER[a.result] - ORDER[b.result])
  const open: PrBarThread[] = nodes
    .filter(n => !n.isResolved)
    .map(n => {
      const first = n.comments.nodes[0]
      return {
        path: n.path,
        line: n.line,
        author: first?.author?.login ?? 'ghost',
        body: first?.body.split('\n').find(l => l.trim())?.trim() ?? '',
        url: first?.url ?? pr.url,
      }
    })
  return {
    branch,
    pr: {
      number: pr.number,
      title: pr.title,
      url: pr.url,
      state: pr.state === 'OPEN' && pr.isDraft ? 'draft' : (pr.state.toLowerCase() as PrBarPr['state']),
      checks: summarise(pr.statusCheckRollup),
      checkRuns,
      review: pr.reviewDecision.toLowerCase().replaceAll('_', ' '),
      threads: open,
    },
  }
}

let isRunning = false
let isQueued = false

// One fetch at a time; a refresh asked for mid-fetch runs once more after it, so a push isn't missed.
// Resolves the snapshot it stored, or undefined when it only queued a rerun.
async function refresh($: EngineInterface) {
  if (isRunning) return void (isQueued = true)
  isRunning = true
  let snap: PrBarSnapshot | null = null
  try {
    do {
      isQueued = false
      snap = await load($).catch(() => null) // gh or git missing: draw nothing
      await update($, snapshot, () => snap)
    } while (isQueued)
  } finally {
    isRunning = false
  }
  return snap
}

// Drawing helpers shared by the bar and the panel.
type Els = ElementTable

const pill = (Text: Els['Text'], bg: string, text: string) => (
  <Text backgroundColor={bg} color="inverseText" bold>{` ${text} `}</Text>
)

// A list, not a fragment: `<>...</>` is a column Box here.
const pills = (Text: Els['Text'], pr: PrBarPr) => [
  pill(Text, STATE_BG[pr.state], `PR #${pr.number} · ${pr.state}`),
  pill(Text, ciBg(pr.checks), ci(pr.checks)),
  pr.threads.length ? pill(Text, 'warning', `${pr.threads.length} unresolved`) : null,
]

// Set when Check feedback is pressed; turn.complete hands it to feedbackChecked once that turn ends.
let feedbackAsked: number | null = null

const actions = ($: EngineInterface, { Box, Button }: Els, snap: PrBarSnapshot, checked: number | null, marginTop = 0) => {
  const list = buttons(snap, checked)
  const press = async (key: string, prompt: string) => {
    if (key === 'feedback') feedbackAsked = snap.pr?.number ?? null
    if (key === 'resolve') await update($, feedbackChecked, () => null)
    return $.prompt.submit({ text: prompt, asUser: true })
  }
  return list.length > 0 ? (
    <Box gap={1} marginTop={marginTop}>
      {list.map(b => (
        <Button key={b.key} label={b.label} hotkey={b.hotkey} onPress={() => press(b.key, b.prompt)} />
      ))}
    </Box>
  ) : null
}

export const register: Register = (on, options) => {
  const isPanel = options.layout === 'panel'

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'pr', description: "Show this branch's pull request in a panel" })
    // The panel layout opens the panel once, when the branch has something to show.
    void refresh($).then(snap => (isPanel && snap ? $.ui.open({ id: PANE, title: 'Pull request' }) : undefined))
    $.clock.every(60_000, () => void refresh($)) // CI moves while the session is idle
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) return next(e)
    if (feedbackAsked !== null) {
      const number = feedbackAsked
      feedbackAsked = null
      await update($, feedbackChecked, () => number)
    }
    void refresh($) // Claude may have committed, pushed or switched branch
    return next(e)
  })

  // Asked for, so it asks for the keyboard too: its buttons' letters work at once.
  on('command.run', { command: 'pr' }, async $ => {
    void refresh($)
    await $.ui.open({ id: PANE, title: 'Pull request', focus: true })
    return { text: 'Pull request panel opened.' }
  })

  // Above the prompt (the bar layout): the PR as a row of pills, its actions
  // under it. A band Button takes its hotkey once the band has focus.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const snap = await read($, snapshot)
    const checked = await read($, feedbackChecked)
    if (isPanel || !snap || e.props.hasSurvey) return next(e)
    const els = $.ui.resolve(e)
    const { Box, Text, Link } = els
    const { pr } = snap
    const bar = pr
      ? [
          ...pills(Text, pr),
          pr.review ? <Text>{pr.review}</Text> : null,
          <Box flexShrink={1}>
            <Text wrap="truncate-end">
              <Link href={pr.url} label={pr.title} />
            </Text>
          </Box>,
        ]
      : [pill(Text, 'inactive', 'no PR'), <Text>{snap.branch}</Text>]
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1} width={e.props.bodyColumns} backgroundColor="subtle">
          {bar}
        </Box>
        {actions($, els, snap, checked)}
      </Box>
    )
  })

  // The panel: the same PR with each check that isn't green and each unresolved
  // thread listed, every one a link. A Button takes its hotkey once the panel has focus.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const snap = await read($, snapshot)
    const checked = await read($, feedbackChecked)
    const els = $.ui.resolve(e)
    const { Box, Text, Link } = els
    if (!snap) return <Text dimColor>No pull request here: not a git repo, the default branch, or gh is unavailable.</Text>
    const { pr } = snap
    if (!pr)
      return (
        <Box flexDirection="column">
          <Box gap={1}>{[pill(Text, 'inactive', 'no PR'), <Text>{snap.branch}</Text>]}</Box>
          {actions($, els, snap, checked, 1)}
        </Box>
      )

    const heading = (text: string) => (
      <Box marginTop={1}>
        <Text bold>{text}</Text>
      </Box>
    )
    const notGreen = pr.checkRuns.filter(c => c.result !== 'passed')
    return (
      <Box flexDirection="column">
        <Box gap={1}>{pills(Text, pr)}</Box>
        <Box marginTop={1}>
          <Text bold wrap="truncate-end">
            <Link href={pr.url} label={pr.title} />
          </Text>
        </Box>
        <Text dimColor wrap="truncate-end">
          {[snap.branch, pr.review].filter(Boolean).join(' · ')}
        </Text>

        {heading('Checks')}
        {notGreen.map(c => (
          <Text color={c.result === 'failed' ? 'error' : 'warning'} wrap="truncate-end">
            {c.result === 'failed' ? '✗ ' : '… '}
            <Link href={c.url} label={c.name} />
          </Text>
        ))}
        {pr.checks.passed ? <Text color="success">✓ {pr.checks.passed} passed</Text> : null}
        {pr.checkRuns.length === 0 ? <Text dimColor>No checks</Text> : null}

        {pr.threads.length ? heading(`Unresolved threads (${pr.threads.length})`) : null}
        {pr.threads.map(t => (
          <Box flexDirection="column">
            <Text wrap="truncate-start">
              <Link href={t.url} label={t.line ? `${t.path}:${t.line}` : t.path} />
              <Text dimColor> @{t.author}</Text>
            </Text>
            <Text dimColor wrap="truncate-end">
              {'  '}
              {t.body}
            </Text>
          </Box>
        ))}

        {actions($, els, snap, checked, 1)}
      </Box>
    )
  })
}
